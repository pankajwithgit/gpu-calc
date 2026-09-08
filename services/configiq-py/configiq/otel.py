# SPDX-License-Identifier: Apache-2.0

"""OpenTelemetry providers for ConfigIQ services.

Imports OpenTelemetry at module load, so this module is only importable when the
`otel` extra is installed. Service name/version are passed in by the caller so
one implementation serves every service.
"""

import logging
import os

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.urllib3 import URLLib3Instrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)

# Global meter provider / in-memory reader for on-demand OTLP export.
_meter_provider = None
_in_memory_reader = None


def get_meter_provider():
    """Return the global MeterProvider instance (None until init_metrics)."""
    return _meter_provider


def _resource(service_name: str, service_version: str) -> Resource:
    return Resource.create({
        "service.name": service_name,
        "service.version": service_version,
        "service.instance.id": str(os.getpid()),  # unique per worker
        "process.pid": os.getpid(),
    })


def init_tracing(app, service_name: str, service_version: str) -> None:
    """Initialize OpenTelemetry tracing, exporting to OTLP only if configured.

    `app` is the FastAPI/Starlette instance to instrument. Instrumenting the
    existing app requires `instrument_app(app)`; the argument-less
    `FastAPIInstrumentor().instrument()` only patches apps created afterwards,
    so an app already constructed (as it always is by the time `enable()` runs)
    would emit no server spans.

    The OTLP span exporter is attached only when an endpoint is explicitly
    configured (`OTEL_EXPORTER_OTLP_ENDPOINT` or
    `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`). With no collector present, defaulting
    to a fixed endpoint would make the BatchSpanProcessor retry
    connection-refused exports indefinitely. Without an endpoint we still set up
    the provider + instrumentation (so spans and trace-context propagation work
    in-process); export just stays off until a collector is wired via env.
    """
    otel_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    otel_traces = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")

    tracer_provider = TracerProvider(resource=_resource(service_name, service_version))
    trace.set_tracer_provider(tracer_provider)

    if otel_endpoint or otel_traces:
        # For the OTLP HTTP exporter the per-signal `endpoint` kwarg is sent
        # as-is (no /v1/traces appended), so derive the signal path from the
        # base URL. Honor an explicit per-signal override if the caller sets one.
        traces_endpoint = otel_traces or (otel_endpoint.rstrip("/") + "/v1/traces")
        tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=traces_endpoint)))
        logger.info("OpenTelemetry tracing initialized with OTLP endpoint: %s", traces_endpoint)
    else:
        logger.info(
            "OpenTelemetry tracing initialized without an OTLP exporter "
            "(set OTEL_EXPORTER_OTLP_ENDPOINT to enable span export)"
        )

    FastAPIInstrumentor.instrument_app(app)
    RequestsInstrumentor().instrument()
    URLLib3Instrumentor().instrument()


def init_metrics(service_name: str, service_version: str) -> None:
    """Initialize OpenTelemetry metrics with dual export.

    Exports the same metrics in both:
    - Prometheus text format (via PrometheusMetricReader)
    - OTLP JSON format (via InMemoryMetricReader, exported on demand)

    NOTE: metrics are per-worker in multi-worker deployments (e.g. uvicorn
    --workers 4). Each worker exports its own metrics via /metrics with
    service.instance.id and process.pid labels to distinguish workers. For
    aggregation, scrape each worker and aggregate in Prometheus via PromQL.
    """
    global _meter_provider, _in_memory_reader

    prometheus_reader = PrometheusMetricReader()
    _in_memory_reader = InMemoryMetricReader()

    _meter_provider = MeterProvider(
        resource=_resource(service_name, service_version),
        metric_readers=[prometheus_reader, _in_memory_reader],
    )
    metrics.set_meter_provider(_meter_provider)

    logger.info("OpenTelemetry metrics initialized: Prometheus + OTLP JSON (instance=%s)", os.getpid())


def get_otlp_metrics():
    """Export current metrics in OTLP JSON format (None until init_metrics)."""
    if not _in_memory_reader:
        return None
    return _metrics_data_to_otlp_json(_in_memory_reader.get_metrics_data())


def _metrics_data_to_otlp_json(metrics_data):
    """Convert OpenTelemetry MetricsData to an OTLP JSON structure."""
    resource_metrics = []

    for resource_metrics_obj in metrics_data.resource_metrics:
        scope_metrics_list = []

        for scope_metrics_obj in resource_metrics_obj.scope_metrics:
            metrics_list = []

            for metric in scope_metrics_obj.metrics:
                metric_dict = {
                    "name": metric.name,
                    "description": metric.description or "",
                    "unit": metric.unit or "",
                }

                if hasattr(metric.data, "data_points"):
                    data_points = []
                    for point in metric.data.data_points:
                        dp = {
                            "attributes": [
                                {"key": k, "value": {"stringValue": str(v)}}
                                for k, v in (point.attributes.items() if point.attributes else {})
                            ],
                            "timeUnixNano": str(point.time_unix_nano),
                        }

                        if hasattr(point, "value"):
                            if hasattr(metric.data, "is_monotonic"):
                                # Counter
                                dp["asDouble"] = float(point.value)
                                metric_dict["sum"] = {
                                    "dataPoints": data_points,
                                    "aggregationTemporality": 2,  # CUMULATIVE
                                    "isMonotonic": metric.data.is_monotonic,
                                }
                            else:
                                # Gauge
                                dp["asDouble"] = float(point.value)
                                metric_dict["gauge"] = {"dataPoints": data_points}
                        elif hasattr(point, "bucket_counts"):
                            # Histogram — a HistogramDataPoint carries `sum`
                            # (double), not the NumberDataPoint `asDouble` field.
                            dp["sum"] = float(point.sum) if hasattr(point, "sum") else 0.0
                            dp["count"] = str(point.count) if hasattr(point, "count") else "0"
                            dp["bucketCounts"] = [str(c) for c in point.bucket_counts]
                            dp["explicitBounds"] = (
                                [float(b) for b in point.explicit_bounds]
                                if hasattr(point, "explicit_bounds") else []
                            )
                            metric_dict["histogram"] = {
                                "dataPoints": data_points,
                                "aggregationTemporality": 2,  # CUMULATIVE
                            }

                        data_points.append(dp)

                metrics_list.append(metric_dict)

            scope_metrics_list.append({
                "scope": {
                    "name": scope_metrics_obj.scope.name,
                    "version": scope_metrics_obj.scope.version or "",
                },
                "metrics": metrics_list,
            })

        resource_attrs = []
        if resource_metrics_obj.resource.attributes:
            for k, v in resource_metrics_obj.resource.attributes.items():
                resource_attrs.append({"key": k, "value": {"stringValue": str(v)}})

        resource_metrics.append({
            "resource": {"attributes": resource_attrs},
            "scopeMetrics": scope_metrics_list,
        })

    return {"resourceMetrics": resource_metrics}
