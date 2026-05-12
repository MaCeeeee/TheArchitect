# Embedding Sidecar

HTTP service wrapping `sentence-transformers/all-mpnet-base-v2` for the
TheArchitect main app's `elementSimilarity.service.ts`.

**Decision rationale:** [notebooks/predictive-poc/embedding-backend-decision.md](../../notebooks/predictive-poc/embedding-backend-decision.md)

## API

| Method | Path | Description |
|---|---|---|
| GET  | `/health`        | 200 once model is loaded (~10s after start) |
| GET  | `/info`          | model name + dim + limits |
| POST | `/embed`         | `{text}` → `{vector: float[768]}` |
| POST | `/embed/batch`   | `{texts}` (≤64) → `{vectors: float[N][768]}` |

Vectors are L2-normalized → dot-product == cosine.

## Run locally (without docker)

```bash
cd services/embedding-sidecar
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Run in stack

It's a service in the root `docker-compose.yml` and `docker-compose.prod.yml`.

```bash
docker compose up -d embedding-sidecar
docker compose logs -f embedding-sidecar
curl localhost:8001/health
curl -X POST localhost:8001/embed -H "Content-Type: application/json" \
     -d '{"text":"Customer master record with PII data"}'
```

## Cold-start

First-time `docker compose up` builds the image which **pre-downloads
the 400MB model into the image** during build (see Dockerfile). So
the container starts in ~10s instead of needing to download at request
time.

When the container starts, `lifespan()` loads the model into memory
(~5-10s). `/health` returns 503 during this window.

## Tenant isolation

This sidecar is a **pure compute service** — no users, no workspaces,
no auth. Tenant isolation lives in the main app at the API layer
(REQ-SIM-005). Treat the sidecar as untrusted internally — never let
clients call it directly.

## Image size

~2GB (Python 3.11 + torch CPU + sentence-transformers + 400MB model).
CPU-only torch wheel keeps it under the GPU-enabled 6GB equivalent.

## When to swap to a remote API

If quality issues emerge at production scale, the migration path is:
1. New backend adapter file in main app
2. Same `elementSimilarity.service.ts` interface
3. Sidecar can stay as fallback OR be removed

See `embedding-backend-decision.md` for the trigger criteria.
