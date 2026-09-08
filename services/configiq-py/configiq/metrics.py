# SPDX-License-Identifier: Apache-2.0

"""Generic HTTP + process metrics and middleware for ConfigIQ services.

Imports OpenTelemetry (and Starlette) at module load, so this module is only
importable when the `otel` extra is installed. Services add `MetricsMiddleware`
to their app and get per-request HTTP metrics plus process CPU/memory gauges;
domain-specific instruments are created by each service via `get_meter`.
"""

import logging
import os
import time

from opentelemetry import metrics
from opentelemetry.metrics import CallbackOptions, Observation
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Global references
_meter = None
_process = None

# HTTP metric instruments
http_requests_total = None
http_request_bytes_total = None
http_response_bytes_total = None
http_request_duration_seconds = None
process_cpu_seconds = None
process_memory_bytes = None


def get_meter(name: str):
    """Return an OpenTelemetry meter for creating service-specific instruments."""
    return metrics.get_meter(name)


def init_http_metrics(meter_name: str) -> None:
    """Create the shared HTTP-request and process instruments.

    Call after the meter provider is configured (see `configiq.otel.init_metrics`).
    """
    global _meter, _process
    global http_requests_total, http_request_bytes_total, http_response_bytes_total
    global http_request_duration_seconds, process_cpu_seconds, process_memory_bytes

    try:
        import psutil
        _process = psutil.Process(os.getpid())
    except ImportError:
        logger.warning("psutil not available; process metrics disabled")
        _process = None

    _meter = metrics.get_meter(meter_name)

    http_requests_total = _meter.create_counter(
        name="http.server.requests",
        description="Total HTTP requests received",
        unit="1",
    )
    http_request_bytes_total = _meter.create_counter(
        name="http.server.request.body.size",
        description="Total HTTP request body bytes received",
        unit="By",
    )
    http_response_bytes_total = _meter.create_counter(
        name="http.server.response.body.size",
        description="Total HTTP response body bytes sent",
        unit="By",
    )
    http_request_duration_seconds = _meter.create_histogram(
        name="http.server.request.duration",
        description="HTTP request duration",
        unit="s",
    )

    if _process:
        def cpu_callback(options: CallbackOptions):
            try:
                cpu_times = _process.cpu_times()
                yield Observation(cpu_times.user + cpu_times.system)
            except Exception as e:
                logger.debug("Failed to collect CPU metric: %s", e)

        process_cpu_seconds = _meter.create_observable_counter(
            name="process.cpu.seconds",
            callbacks=[cpu_callback],
            description="Total CPU seconds consumed (user + system)",
            unit="s",
        )

        def memory_callback(options: CallbackOptions):
            try:
                yield Observation(_process.memory_info().rss)
            except Exception as e:
                logger.debug("Failed to collect memory metric: %s", e)

        process_memory_bytes = _meter.create_observable_gauge(
            name="process.memory.usage",
            callbacks=[memory_callback],
            description="Current memory usage in bytes",
            unit="By",
        )

    logger.info("Custom metrics initialized: HTTP + process metrics")


def record_http_request(method: str, endpoint: str, status_code: int,
                        request_bytes: int, response_bytes: int, duration: float) -> None:
    """Record metrics for a completed HTTP request."""
    if not http_requests_total:
        return  # not initialized

    attrs = {
        "http.request.method": method,
        "url.path": endpoint,
        "http.response.status_code": status_code,
    }
    attrs_no_status = {
        "http.request.method": method,
        "url.path": endpoint,
    }

    http_requests_total.add(1, attrs)
    http_request_bytes_total.add(request_bytes, attrs_no_status)
    http_response_bytes_total.add(response_bytes, attrs)
    http_request_duration_seconds.record(duration, attrs)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Collect per-request HTTP metrics via OpenTelemetry.

    No-ops (pass-through) until `init_http_metrics` has run, so it is always safe
    to add to the app.
    """

    async def dispatch(self, request, call_next):
        if not http_requests_total:
            return await call_next(request)

        start_time = time.time()

        content_length = request.headers.get("content-length", "0")
        request_bytes = int(content_length) if content_length.isdigit() else 0

        response = await call_next(request)

        duration = time.time() - start_time

        # Use the matched route template, not the raw path, to bound label
        # cardinality (e.g. "/systems", not "/systems/123").
        endpoint = request.url.path
        route = request.scope.get("route")
        if route is not None and hasattr(route, "path"):
            endpoint = route.path
        elif response.status_code == 404:
            endpoint = "<unmatched>"

        response_bytes = 0
        if "content-length" in response.headers:
            response_bytes = int(response.headers["content-length"])

        record_http_request(
            method=request.method,
            endpoint=endpoint,
            status_code=response.status_code,
            request_bytes=request_bytes,
            response_bytes=response_bytes,
            duration=duration,
        )
        return response
