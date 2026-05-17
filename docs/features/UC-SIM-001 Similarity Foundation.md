---
aliases:
  - UC-SIM-001 Similarity Foundation
  - UC-SIM-001
  - Similarity Foundation
  - Embedding Foundation
tags:
  - feature
  - thearchitect
  - sprint-2
  - production-live
  - predictive-architecture
  - foundation
status: production-live
sprint: 2
use_case: UC-SIM-001
linear_parent: THE-239
deployed_at: 2026-05-12
deployed_to: https://thearchitect.site
owner: Matze Ganzmann
implementer: Claude Opus 4.7
related:
  - UC-RED-001 (nutzt diese Foundation)
  - UC-HARM-001 (nutzt diese Foundation)
  - UC-DATA-001 V2 (nutzt diese Foundation für Generator-Reuse)
---

# UC-SIM-001 Similarity Foundation

> [!success] Status — Production-Live seit 2026-05-12
> Sprint-2 Track A komplett deployed. Die Foundation auf der **UC-RED-001**, **UC-HARM-001** und **UC-DATA-001 V2** alle aufbauen.

## Was es ist

Die **Embedding-basierte Similarity-Infrastruktur** von TheArchitect:

| Komponente | Was |
|---|---|
| **Python Sidecar** | FastAPI + sentence-transformers (all-mpnet-base-v2, 768-dim) — generiert Vektoren aus Element-Beschreibungen |
| **Qdrant Vector-DB** | Workspace-isoliert via `elements-{projectId}` Collections (REQ-SIM-005 Hard-Stop) |
| **`elementSimilarity.service.ts`** | `upsertEmbedding`, `findSimilarElements`, `deleteEmbedding`, `findRedundancies` |
| **Auto-Indexing-Hook** | Jeder Element-CRUD-Pfad indexiert das Element automatisch in Qdrant |
| **Public Similar-API** | `POST /api/projects/:projectId/elements/similar` mit Score-Tier-Mapping (SAME/SIMILAR/UNIQUE) |

## Strategischer Wert

> [!quote] aus [[Predictive Architecture Strategy]]
> *"Embedding-Foundation ist eigentlich Pre-Requirement für die Tier-3-UCs UC-RED-001 und UC-HARM-001. Wenn das hier in 6 Monaten als 'machen wir auch noch' angefangen wird — verspätet."*

Die Sprint-2-Investition zahlt sich in Sprint-3 ein:
- **UC-RED-001** komplett (alle 5 REQs Done) in **1.5 Tagen** statt 5 geplanten
- **UC-HARM-001** ist nur ein Cross-Workspace-Wrapper um dieselben Embeddings

## REQs

| REQ | Was | Status |
|---|---|---|
| REQ-SIM-001 | Foundation Service (`findSimilarElements`) | ✅ Done |
| REQ-SIM-002 | Embedding-Hook auf CRUD-Pfaden | ✅ Done |
| REQ-SIM-003 | Public Similar-API mit Rate-Limit + Audit | ✅ Done |
| REQ-SIM-004 | V2 Generator-D Reuse (Sprint 2 Track B) | ✅ Done |
| REQ-SIM-005 | Tenant-Isolation per Workspace-Collection | ✅ Done — Hard-Stop |

## Tenant-Isolation-Modell

> [!warning] Cross-Workspace ist physikalisch unmöglich
> Embeddings für Projekt A liegen in `elements-{projectA-id}` Collection.
> Embeddings für Projekt B liegen in `elements-{projectB-id}` Collection.
> Eine Query gegen Collection A kann Collection B **nicht** sehen.
> Das ist die DSGVO-Hard-Stop-Garantie aus REQ-SIM-005.

UC-HARM-001 (Cross-Project) braucht daher einen **eigenen Architektur-Spike** wie Cross-Workspace-Querying gemacht wird ohne diese Isolation zu brechen.

## Score-Tiers (aus PoC findings)

| Score | Tier | Bedeutung |
|---|---|---|
| ≥ 0.85 | **SAME** | Sehr wahrscheinlich gleiches Konzept → auto-reuse |
| 0.65 – 0.85 | **SIMILAR** | Ähnlich genug für User-Confirm |
| < 0.65 | **UNIQUE** | Distinkt |

Plus **Confidence-Indicator** via topGap (Score-Diff Top1 vs TopK):
- `< 0.05` → low confidence (Index hat keinen guten Match)
- `≥ 0.05` → high confidence

## Code-Pointer

| Datei | Verantwortung |
|---|---|
| [packages/server/src/services/elementSimilarity.service.ts](../../packages/server/src/services/elementSimilarity.service.ts) | Service-API |
| [services/embedding-sidecar/](../../services/embedding-sidecar/) | Python FastAPI Sidecar |
| `docker-compose.prod.yml` | Qdrant v1.18 + Sidecar als Services |

## Konsumenten

- [[UC-RED-001 Redundancy Detector]] — Within-Project-Pair-Detection
- [[UC-HARM-001 Cross-Project Harmonisierung]] — Cross-Workspace (Sprint 4)
- **UC-DATA-001 V2** — Generator-D nutzt `findSimilar` für Reuse-Vorschläge

## Daily / Doku

- Daily 2026-05-12 (Track A live)
- Daily 2026-05-13 (Track B + Sensitivity)
- [[Predictive Architecture Strategy]]
