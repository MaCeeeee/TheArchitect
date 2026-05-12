"""
TheArchitect Embedding Sidecar
==============================

HTTP service that wraps sentence-transformers for the
elementSimilarity.service.ts in the main app.

Decision rationale: see notebooks/predictive-poc/embedding-backend-decision.md

Endpoints:
  GET  /health         → 200 once model is loaded
  POST /embed          → { vector: float[768] }
  POST /embed/batch    → { vectors: float[N][768] }
  GET  /info           → model metadata

The model is loaded once at startup (cold-start ~5-10s) and kept in
memory. All subsequent requests are warm-path inference (~50-80ms
single, faster in batch).

Tenant-isolation is enforced at the API-layer of the main app
(REQ-SIM-005), not here — this sidecar is a pure compute service
with no concept of users or workspaces.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("embedding-sidecar")

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2")
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "64"))
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "8000"))  # ~2000 tokens

# Module-level state — populated in lifespan
_model: SentenceTransformer | None = None
_model_dim: int | None = None
_model_loaded_at: float | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load the model on startup so the first request is fast."""
    global _model, _model_dim, _model_loaded_at
    log.info("loading model: %s", MODEL_NAME)
    t0 = time.monotonic()
    _model = SentenceTransformer(MODEL_NAME)
    _model_dim = int(_model.get_sentence_embedding_dimension())
    _model_loaded_at = time.time()
    log.info(
        "model ready in %.1fs (dim=%d)",
        time.monotonic() - t0,
        _model_dim,
    )
    yield
    log.info("shutdown")


app = FastAPI(
    title="TheArchitect Embedding Sidecar",
    version="0.1.0",
    lifespan=lifespan,
)


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1)


class EmbedBatchRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)


class EmbedResponse(BaseModel):
    vector: List[float]
    dim: int
    model: str


class EmbedBatchResponse(BaseModel):
    vectors: List[List[float]]
    dim: int
    model: str
    count: int


class InfoResponse(BaseModel):
    model: str
    dim: int
    max_batch_size: int
    max_text_length: int
    loaded_at: float | None


@app.get("/health")
def health():
    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded yet")
    return {"status": "ok"}


@app.get("/info", response_model=InfoResponse)
def info():
    return InfoResponse(
        model=MODEL_NAME,
        dim=_model_dim or 0,
        max_batch_size=MAX_BATCH_SIZE,
        max_text_length=MAX_TEXT_LENGTH,
        loaded_at=_model_loaded_at,
    )


@app.post("/embed", response_model=EmbedResponse)
def embed_one(req: EmbedRequest):
    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded yet")
    text = req.text[:MAX_TEXT_LENGTH]
    vec = _model.encode(text, normalize_embeddings=True)
    return EmbedResponse(vector=vec.tolist(), dim=int(vec.shape[0]), model=MODEL_NAME)


@app.post("/embed/batch", response_model=EmbedBatchResponse)
def embed_batch(req: EmbedBatchRequest):
    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded yet")
    if len(req.texts) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"batch too large (max {MAX_BATCH_SIZE})",
        )
    texts = [t[:MAX_TEXT_LENGTH] for t in req.texts]
    vectors = _model.encode(
        texts,
        batch_size=min(32, len(texts)),
        normalize_embeddings=True,
    )
    return EmbedBatchResponse(
        vectors=vectors.tolist(),
        dim=int(vectors.shape[1]),
        model=MODEL_NAME,
        count=len(texts),
    )
