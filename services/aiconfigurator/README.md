# AIConfigurator REST API

A thin FastAPI wrapper over the [aiconfigurator](https://github.com/redhat-performance/aiconfigurator)
SDK, exposing GPU recommendation, performance estimation, and memory estimation
as HTTP endpoints. ConfigIQ's `app/api/*` proxy routes call this service.

This directory contains **only** the REST wrapper. The SDK itself (including its
Rust-compiled `aiconfigurator_core` extension) is not vendored here — it is
installed as a wheel published by the Red Hat fork's GitHub Releases.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/recommend` | GPU sizing recommendations |
| POST | `/estimate` | Single-point performance estimate |
| POST | `/memory` | Memory / KV-cache breakdown |
| GET | `/models` | Supported models |
| GET | `/systems` | Supported GPU systems |

Full spec: [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

## Run with the container (recommended)

The SDK's `aiconfigurator-core` wheel currently ships only for `linux/amd64`
(manylinux x86_64), so the container is the portable way to run this service:

The build context is `services/` (not this directory) so the image can pull in
the shared `configiq-py` package; pass the Containerfile with `-f`. The SDK
wheel is amd64-only, so build for `linux/amd64` (emulated on Apple Silicon):

```bash
docker build --platform linux/amd64 \
  -f services/aiconfigurator/Containerfile -t aiconfigurator services/
docker run --rm -p 7860:7860 aiconfigurator
curl http://localhost:7860/systems
```

The aiconfigurator SDK wheels are pinned in `pyproject.toml` by exact
fork-release download URL (the `aiconfigurator @ …` / `aiconfigurator-core @ …`
entries), so the image always installs those exact artifacts — no build args. To
move to a newer SDK build, update those URLs; see
[docs/RELEASE_PROCESS.md](../../docs/RELEASE_PROCESS.md#bumping-the-aiconfigurator-sdk).

## Local development

The `aiconfigurator-core` wheel pinned in `pyproject.toml` is amd64-only, so this
works on a `linux/amd64` host:

```bash
cd services/aiconfigurator
uv venv && uv pip install -e . --group dev
uv run pytest          # tests mock the SDK; no perf DB required
uv run ruff check .
uvicorn tools.api_service.app:app --reload --port 7860
```

On other platforms (e.g. macOS/arm) the `aiconfigurator-core` wheel is not yet
available; use the container instead.
