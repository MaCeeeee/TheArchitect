# TheArchitect Embedding Sidecar
# Pre-bakes the sentence-transformers model into the image so the first
# `docker compose up` doesn't trigger a 400MB download at request time.

FROM python:3.11-slim AS base

# Avoid HuggingFace symlinks warnings + pin cache dir
ENV HF_HUB_DISABLE_SYMLINKS_WARNING=1 \
    HF_HOME=/models/hf \
    TRANSFORMERS_CACHE=/models/hf \
    SENTENCE_TRANSFORMERS_HOME=/models/sbert \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps for sentence-transformers (torch wheel needs libgomp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install python deps. CPU-only torch (no CUDA) keeps the image at ~2GB
# instead of ~6GB. We're not training anything, inference on CPU is fine.
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

# Pre-fetch the model into the image so cold-start at runtime is just
# loading from disk, not downloading from HuggingFace.
ARG EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
RUN python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('${EMBEDDING_MODEL}')"

COPY main.py .

EXPOSE 8001

# Healthcheck — used by docker-compose depends_on to gate dependent services
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD curl -fsS http://localhost:8001/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
