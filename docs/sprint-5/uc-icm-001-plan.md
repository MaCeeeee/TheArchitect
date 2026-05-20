# UC-ICM-001 — Regulation Data Foundation (W1 Implementation Plan)

**Sprint:** W1 (20.–26. Mai 2026)
**BSH-Demo:** 14.06.2026
**Linear:** [THE-272](https://linear.app/thearchitect/issue/THE-272)
**Pre-Flight:** 2026-05-19 (Codebase-Scan + Linear-Setup durch)
**Status:** In Progress (D1)

## Goal

In W1 bauen wir die Datengrundlage: ~30 Regulation-Paragraphen aus NIS2 + LkSG + DSGVO landen via Server-B-Crawler in Server A's MongoDB, mit 768-dim-Embeddings in Server B's Qdrant. End-of-W1: `GET /api/projects/:id/regulations` liefert echte Daten, bereit für UC-ICM-002 (LLM-Mapping) in W2.

## Architektur

```
┌─ Server A (Production, 100.96.198.73) ────────────────────────┐
│  TheArchitect Backend (Express)                               │
│   /api/projects/:projectId/regulations                        │
│     ├─ GET   (list, filter by source)                         │
│     ├─ POST  /crawl   (dispatches to Server B)                │
│     └─ Model: Regulation                                      │
│  MongoDB :27017 (Tailscale-binding)                           │
└────────────────────────┬──────────────────────────────────────┘
                         │ HTTP via Tailscale
┌────────────────────────▼──────────────────────────────────────┐
│ Server B (Coolify, 100.106.223.83)                            │
│  thearchitect-compliance-crawler (Node/Fastify)               │
│   POST /crawl   {projectId, sources: [...]}                   │
│   Crawl → Parse → Mongo (A) → Embed → Qdrant (B)              │
│  Embedding-Sidecar (existiert, UC-SIM-001)                    │
│  Qdrant (existiert)                                           │
└───────────────────────────────────────────────────────────────┘
```

## Day-by-Day

| Tag | Datum | Wochentag | Was | Status |
|---|---|---|---|---|
| D1 | 20.05 | Mi | REQ-ICM-001.1: Regulation-Model + Shared-Types + Tests | 🏁 Start heute |
| D2 | 21.05 | Do | REQ-ICM-001.2: `packages/compliance-crawler/` scaffolden + NIS2-Source | |
| D3 | 22.05 | Fr | REQ-ICM-001.2: LkSG + DSGVO Sources | |
| ⏸️ | 23.–25.05 | Sa–Mo | Pfingsten — Pause | |
| D4 | 26.05 | Di | REQ-ICM-001.3: Embedding-Sync zu Qdrant + Integration | |
| D5 | 27.05 | Mi | Coolify-Deploy + E2E-Test + Backend-Route auf Server A | |

⚠️ Pfingstmontag 25.05 → effektiv 5 Werktage über 8 Kalendertage. UC-ICM-002 (W2) startet einen Tag später als ursprünglich geplant (jetzt Do 28.05).

## REQ-Implementation Details

### REQ-ICM-001.1 ([THE-275](https://linear.app/thearchitect/issue/THE-275))

**Files:**
- `packages/shared/src/types/compliance.ts` (neu)
- `packages/server/src/models/Regulation.ts` (neu)
- `packages/server/src/models/__tests__/Regulation.test.ts` (neu)

**Shared-Type:**
```typescript
export interface IRegulation {
  projectId: string;
  source: 'nis2' | 'lksg' | 'dsgvo' | 'dora' | 'iso27001' | 'custom';
  jurisdiction: 'EU' | 'DE' | 'AT' | 'CH';
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  language: 'de' | 'en';
  embedding?: number[];
  crawledAt: Date;
  version: number;
}
```

**Indexes:**
- Unique compound: `(projectId, source, paragraphNumber, version)` — Upsert-Dedup
- Query: `(projectId, source)`, `(projectId, effectiveFrom)`

**Tests:**
1. CRUD roundtrip
2. Upsert via compound index ist idempotent
3. Version-Increment bei Update
4. Validation: `fullText` ≥ 50 chars Pflicht

### REQ-ICM-001.2 ([THE-276](https://linear.app/thearchitect/issue/THE-276))

**Package:** `packages/compliance-crawler/` (neu, eigener Monorepo-Package)

```
packages/compliance-crawler/
  package.json          // @thearchitect/compliance-crawler
  src/
    index.ts            // Fastify-Server
    routes/
      crawl.ts          // POST /crawl
      health.ts         // GET /health
    sources/
      eur-lex.ts        // NIS2
      gesetze-im-internet.ts  // LkSG + DSGVO
      base.ts           // Interface
    db/
      mongo.ts          // Connect to Server A via MONGODB_URI
    embeddings/
      qdrant.ts         // Wrapper für UC-SIM-001 Sidecar
  Dockerfile            // multi-stage, slim
  .env.example
```

**Quellen:**

| Quelle | Methode | Paragraphen |
|---|---|---|
| EUR-Lex (NIS2) | CELEX-XML | Art. 20–24 |
| gesetze-im-internet (LkSG) | XML-Dump | §§ 3–9 |
| gesetze-im-internet (DSGVO/BDSG) | XML-Dump | Art. 32 + Begleitung |

**Tech-Stack:**
- Node 22 alpine, Fastify, cheerio, mongoose, axios
- Rate-Limit: 200ms zwischen Requests

### REQ-ICM-001.3 ([THE-277](https://linear.app/thearchitect/issue/THE-277))

**Reuse aus UC-SIM-001:** Embedding-Sidecar (`all-mpnet-base-v2`) und Qdrant-Client existieren auf Server B.

**Flow:** Crawler → Mongo Save → Embedding-Service Call → Qdrant Upsert (`regulations-{projectId}` Collection).

**Bulk-Endpoint:** `POST /embed-all?projectId=...` für initial Backfill.

## RVTM (Traceability)

| REQ | Implementation | Verification | Evidence |
|---|---|---|---|
| REQ-ICM-001.1 | `packages/server/src/models/Regulation.ts` | Jest tests | CI green |
| REQ-ICM-001.2 | `packages/compliance-crawler/src/` | Integration test + Coolify deploy | Crawler GET /health 200 from Server B |
| REQ-ICM-001.3 | `packages/compliance-crawler/src/embeddings/` | Qdrant inspection: 30 vectors | `curl qdrant/collections/regulations-.../points/count` |

## Risiken

| Risiko | Wahrsch. | Impact | Mitigation |
|---|---|---|---|
| EUR-Lex-XML-Format anders als erwartet | mittel | hoch | D2 Spike-Tag: 1 Paragraph erfolgreich parsen, dann skalieren |
| Tailscale-Latenz Server B → Mongo A | gering | mittel | Test heute: < 50 KB/s ist OK für Batch |
| Embedding-Sidecar nicht erreichbar von neuem Container | mittel | mittel | D4 Network-Test vor Code, Coolify-Service-Network richtig |
| Coolify-Deploy-Komplexität (Monorepo-Subpackage als Image) | mittel | mittel | D5 hat Puffer; Fallback: Standalone-Repo wenn nötig |

## Definition of Done

- [ ] D1: Regulation-Model in Backend, Tests grün, [THE-275](https://linear.app/thearchitect/issue/THE-275) closed
- [ ] D2-D3: 30 Regulations crawlbar lokal, [THE-276](https://linear.app/thearchitect/issue/THE-276) closed
- [ ] D4: 30 Regulations mit Embeddings in Qdrant, [THE-277](https://linear.app/thearchitect/issue/THE-277) closed
- [ ] D5: Crawler auf Server B deployed, Backend-Route triggert Crawler, 30 Regulations in Demo-Workspace Mongo
- [ ] [THE-272](https://linear.app/thearchitect/issue/THE-272) closed
- [ ] Sprint-Retro: `docs/sprint-5/uc-icm-001-retro.md`
