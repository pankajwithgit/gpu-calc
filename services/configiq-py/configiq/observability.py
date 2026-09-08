# SPDX-License-Identifier: Apache-2.0

"""One-call observability wiring for ConfigIQ FastAPI services.

Imports OpenTelemetry at module load (via `configiq.otel`/`configiq.metrics`), so
this module is only importable when the `otel` extra is installed. Services wire
it behind a try/except so observability stays optional::

    try:
        from configiq import observability
        observability.enable(app, service_name="aicostings",
                             service_version="0.1.0", meter_name="aicostings.api")
        _OBS = True
    except ImportError:
        _OBS = False
"""

from starlette.responses import JSONResponse, Response

from . import metrics as _metrics
from . import otel as _otel

# Re-export so services can create domain instruments without importing
# OpenTelemetry directly.
get_meter = _metrics.get_meter


def enable(app, *, service_name: str, service_version: str, meter_name: str) -> None:
    """Initialize tracing + metrics and attach the metrics middleware to `app`."""
    _otel.init_tracing(app, service_name, service_version)
    _otel.init_metrics(service_name, service_version)
    _metrics.init_http_metrics(meter_name)
    app.add_middleware(_metrics.MetricsMiddleware)


def metrics_response(accept: str) -> Response:
    """Render metrics for a /metrics endpoint using content negotiation.

    - Accept: application/json → OTLP JSON (for pmdaopentelemetry and similar)
    - anything else (default)  → Prometheus/OpenMetrics text

    Returns a 503 response if the requested format is not yet available.
    """
    # If enable() never ran, the global Prometheus REGISTRY holds no app metrics;
    # rendering it would return a misleading 200 with empty/foreign metrics.
    if _otel.get_meter_provider() is None:
        return JSONResponse({"detail": "Metrics reader not initialized"}, status_code=503)

    if "application/json" in (accept or "").lower():
        otlp_data = _otel.get_otlp_metrics()
        if not otlp_data:
            return JSONResponse({"detail": "OTLP metrics reader not initialized"}, status_code=503)
        return JSONResponse(otlp_data)

    # Prometheus text format (default). Metrics are per-worker and not aggregated
    # across uvicorn workers — scrape each worker or aggregate in Prometheus.
    from prometheus_client import REGISTRY, generate_latest

    return Response(
        content=generate_latest(REGISTRY),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
