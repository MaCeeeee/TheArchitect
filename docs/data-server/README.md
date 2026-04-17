# Data-Server (n8n + Qdrant RAG) — Setup

TheArchitect delegiert Retrieval-Augmented-Generation (RAG) an einen **Data-Server** auf einer separaten Hostinger-VPS. Ziel: PDFs / XLSX aus Gesetzen und User-Inputs ingesten, chunk'en, embedden, indizieren und per Query abrufen — als "zweites Gehirn" für TheArchitect.

## Architektur

```
┌────────────────────┐   HTTPS (shared secret)   ┌──────────────────────────────┐
│  TheArchitect      │ ────────────────────────▶ │  n8n Webhook                 │
│  Primary VPS       │                           │  POST /webhook/rag-ingest    │
│  ragService.ts     │                           │  POST /webhook/rag-query     │
└────────────────────┘                           └─────────────┬────────────────┘
                                                               │
                                                  ┌────────────┴────────────┐
                                                  │                         │
                                          ┌───────▼────────┐       ┌────────▼────────┐
                                          │  OpenAI        │       │  Qdrant         │
                                          │  Embeddings    │       │  Vector-DB      │
                                          │  text-3-small  │       │  (Coolify)      │
                                          └────────────────┘       └─────────────────┘
```

- **Auth:** TheArchitect sendet `X-API-Key: <DATA_SERVER_SHARED_SECRET>` in jedem Request. n8n prüft den Header in jedem Webhook als erste Node.
- **Transport:** HTTPS über `n8n.thearchitect.site` (Let's Encrypt via Coolify Traefik). Alternativ rein Tailscale-privat.
- **Storage:** Qdrant (vector) + n8n-Postgres (dokument-metadata, optional).

## Setup-Schritte

### 1. Qdrant auf Coolify deployen

In Coolify (`http://data-server:8000`):

1. My first project → production → **+ New Resource → Databases → Qdrant**
2. Service Name: `qdrant`
3. Environment Variables: `QDRANT__SERVICE__API_KEY=<öffne neu generieren>` (weiterer Secret, nicht der Shared-Secret)
4. Persistent Storage: Default (Volume wird angelegt)
5. Deploy

Qdrant läuft dann intern im `coolify`-Netzwerk unter `http://qdrant:6333`. Von n8n erreichbar per Hostname.

### 2. OpenAI-Credentials in n8n anlegen

1. https://n8n.thearchitect.site → Settings → **Credentials** → **+ Add Credential**
2. Typ: **OpenAI**
3. API Key: Deinen OpenAI-Key einfügen
4. Save

### 3. Qdrant-Credentials in n8n anlegen

**Hinweis:** Coolify-Services resolven sich nicht über einfache Aliase (`qdrant`), sondern über den vollen Container-Namen. Setz stattdessen n8n-Env-Vars für Flexibilität:

Coolify → n8n → Environment Variables → **+ Add**:
```
QDRANT_URL=http://qdrant-<containerSuffix>:6333
QDRANT_API_KEY=<der Key aus Schritt 1>
```

Den vollen Container-Namen findest du mit:
```bash
ssh root@100.106.223.83 "docker ps --format '{{.Names}}' | grep qdrant"
```

Dann in n8n:

1. Credentials → **+ Add Credential** → **Qdrant API**
2. URL: `={{$env.QDRANT_URL}}`
3. API Key: `={{$env.QDRANT_API_KEY}}`
4. Save

### 4. Shared Secret in n8n Environment setzen

Coolify → n8n → Environment Variables → `+ Add`:

```
DATA_SERVER_SHARED_SECRET=<64-hex-chars, identisch mit TheArchitect .env>
```

Generiert einmalig mit `openssl rand -hex 32`. Save → Restart n8n-Container.

### 5. Drei n8n-Workflows bauen

Für jeden Workflow: **+ New Workflow → Add Nodes** nach Rezept unten. Danach **Activate** (Schalter oben rechts).

#### Workflow A — `rag-health`
Simple Smoke-Test.

1. **Webhook** (GET): Path `rag-health`, Authentication: Header Auth → Header Name `X-API-Key` → Value `={{$env.DATA_SERVER_SHARED_SECRET}}`
2. **Respond to Webhook**: JSON `{ "ok": true, "version": "1.0.0" }`

#### Workflow B — `rag-ingest`
Ingest PDF/XLSX-Text → chunk → embed → Qdrant.

1. **Webhook** (POST): Path `rag-ingest`, gleiche Header-Auth wie oben
2. **Code** (JavaScript): Validate `{ projectId, source, filename, mimeType, content, metadata }`. Output: Das Body-Objekt erweitert um `documentId: crypto.randomUUID()`
3. **Default Data Loader** (LangChain): Input Data: JSON → Field `content`, Metadata: Map `projectId`, `source`, `filename`, `documentId`, `metadata.*`
4. **Recursive Character Text Splitter**: Chunk Size `1500`, Chunk Overlap `200`
5. **Embeddings OpenAI**: Model `text-embedding-3-small`
6. **Qdrant Vector Store (Insert)**: Collection `thearchitect-rag` (auto-create if missing), Dimension `1536`
7. **Respond to Webhook**: JSON `{ "documentId": "={{$('Code').item.json.documentId}}", "chunkCount": "={{$('Recursive Character Text Splitter').all().length}}" }`

#### Workflow C — `rag-query`
Query-Embedding → Qdrant similarity → Top-K chunks mit Metadata zurück.

1. **Webhook** (POST): Path `rag-query`, gleiche Header-Auth
2. **Code**: Validate `{ projectId, text, topK?, filters? }`
3. **Embeddings OpenAI** (standalone): Input `={{$('Webhook').item.json.text}}`, Model `text-embedding-3-small`
4. **Qdrant Vector Store (Retrieve)**: Collection `thearchitect-rag`, Limit `={{$('Webhook').item.json.topK || 8}}`, optional Filter by `projectId` / `source` / `jurisdiction` aus Body
5. **Code** — Map result to `{ chunks: [{ documentId, chunkId, text, score, metadata }] }`
6. **Respond to Webhook**: gemappte JSON

### 6. TheArchitect verbinden

In TheArchitect `.env`:

```
DATA_SERVER_URL=https://n8n.thearchitect.site
DATA_SERVER_SHARED_SECRET=<gleicher 64-hex-String wie in n8n>
```

TheArchitect-Routes:

| Endpoint | Method | Scope |
|----------|--------|-------|
| `/api/rag/health` | GET | Authenticated |
| `/api/projects/:projectId/rag/ingest` | POST | Editor+ |
| `/api/projects/:projectId/rag/query` | POST | Viewer+ |

Payload-Beispiel für Ingest:

```json
{
  "source": "regulation",
  "filename": "ESRS-1-General-Requirements.pdf",
  "mimeType": "application/pdf",
  "content": "<extrahierter Plaintext>",
  "metadata": {
    "jurisdiction": "EU",
    "regulationId": "ESRS-1",
    "effectiveDate": "2024-01-01",
    "language": "en",
    "tags": ["CSRD", "materiality"]
  }
}
```

Payload-Beispiel für Query:

```json
{
  "text": "Welche Anforderungen gelten für doppelte Wesentlichkeitsanalyse?",
  "topK": 6,
  "filters": { "jurisdiction": "EU", "regulationId": "ESRS-1" }
}
```

### 7. Smoke-Test

```bash
# Health
curl -s https://n8n.thearchitect.site/webhook/rag-health \
  -H "X-API-Key: $DATA_SERVER_SHARED_SECRET" | jq

# Ingest (triviales Beispiel)
curl -s https://n8n.thearchitect.site/webhook/rag-ingest \
  -H "X-API-Key: $DATA_SERVER_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId":"test",
    "source":"regulation",
    "filename":"hello.txt",
    "mimeType":"text/plain",
    "content":"Die doppelte Wesentlichkeit bewertet Auswirkungen auf Mensch und Umwelt sowie finanzielle Risiken.",
    "metadata":{"jurisdiction":"EU","regulationId":"ESRS-1"}
  }' | jq

# Query
curl -s https://n8n.thearchitect.site/webhook/rag-query \
  -H "X-API-Key: $DATA_SERVER_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test","text":"Was ist doppelte Wesentlichkeit?","topK":3}' | jq
```

## Ausbau-Ideen (nach Pitch)

- PDF-Extraktion direkt in n8n: **Extract from File** Node (n8n kann PDF lesen) — dann muss TheArchitect nicht selbst PDF-Text extrahieren, sondern kann das PDF-Binary hochladen
- xlsx-Ingest: **Extract from File (XLSX)** Node → row-wise chunks
- Law-Crawling: Scheduled Trigger → HTTP Request (z.B. eur-lex.europa.eu) → gleicher Ingest-Flow
- Re-ranking: Cohere-Reranker Node nach Qdrant-Retrieve für bessere Qualität
- Multi-Tenant Collection-Names: `thearchitect-rag-{projectId}` statt globaler Collection
