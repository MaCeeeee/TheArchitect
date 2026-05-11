# Spike-0: Embedding-Backend-Decision

> **Decision: Lokales Python-Sidecar mit `sentence-transformers/all-mpnet-base-v2` (PoC-Setup) für Sprint 2 → Voyage-API als Phase-2-Upgrade falls Quality knapp wird.**
>
> **Rationale 1-Liner:** PoC hat 5/5 PASS mit lokalem Modell — Quality ist nicht der Bottleneck. Setup-Geschwindigkeit + DSGVO-Story + Null-Cost gewinnen.

**Date:** 2026-05-11
**Time-Budget:** 2h (used: ~45 min — research + matrix only, no live-test)
**Reference:** [docs/strategy/2026-05-06-predictive-architecture.md](../../docs/strategy/2026-05-06-predictive-architecture.md), [findings.md](./findings.md)

---

## Die 3 Kandidaten

| Option | Was | Wo lebt es | Modell |
|---|---|---|---|
| **A — Voyage AI API** (Anthropic-recommended) | Cloud-API, REST-Call pro Embedding | Voyage-Cloud (US-Hosting wahrscheinlich) | voyage-4-large / voyage-4 / voyage-4-lite |
| **B — Lokales Python-Sidecar** | Container mit sentence-transformers, HTTP-Service | TheArchitect-Docker-Stack | all-mpnet-base-v2 (open-source, 768d) |
| **C — OpenAI text-embedding-3-small** | Cloud-API, REST-Call | OpenAI-Cloud (US) | text-embedding-3-small |

---

## Cost-Vergleich (TheArchitect-Skala, realistisch)

**Annahmen:**
- BSH-Demo-Workspace: ~1.000 Elements → wir sahen 926 in der PoC
- Production-Skala pro Workspace: 5.000 Elements obere Grenze (BSH-Konzern-Größe)
- Pro Element-Embedding: ~50 Tokens (`name + type + layer + description` truncated)
- Re-Embed-Frequenz: 100 Element-Updates pro Tag pro Workspace (großzügig)
- Initial-Indexing pro Workspace: 1× komplett

**Kostenrechnung Voyage-4-lite ($0.02/1M Tokens):**

| Operation | Tokens/Workspace | Cost/Workspace |
|---|---|---|
| Initial-Indexing (5k × 50) | 250k | $0.005 |
| Re-Embed (100/Tag × 50 × 365) | 1.83M/Jahr | $0.037/Jahr |
| Similarity-Queries (1000/Tag × 50) | 18.25M/Jahr | $0.365/Jahr |
| **Gesamt pro Workspace pro Jahr** | ~20M | **~$0.40** |

**Voyage-4 Free-Tier:** 200M Tokens lebenslang → reicht für ~10 Workspaces × 1 Jahr **ohne einen Cent**.

→ **Cost ist KEIN Decision-Faktor.** Selbst bei 100 Production-Workspaces sind das $40/Jahr. Vernachlässigbar.

---

## Quality-Vergleich

| Modell | Dimensionen | PoC-Resultat | Bemerkung |
|---|---|---|---|
| `all-mpnet-base-v2` (Option B) | 768 | **5/5 PASS** | Mit BSH-Demo-Daten am 2026-05-11 validiert |
| `voyage-4` / `voyage-4-large` (Option A) | 1024 / variable | nicht getestet | Ist nominell stärker (MTEB-Benchmarks), aber: |
| `text-embedding-3-small` (Option C) | 1536 | nicht getestet | OpenAI's günstige Variante |

**Wichtig:** Wir haben das PoC bereits mit Option B durchgezogen und 5/5 PASS bekommen. Davon waren 2 STRONG PASS (Q3 Audit-Trail Cross-Layer, Q4 LkSG German↔English).

→ **Marginal höhere Quality bei A/C ist nicht der Bottleneck.** Wir haben kein Quality-Problem.

---

## Compliance-Matrix (DSGVO + Konzern-Verkauf)

| Aspekt | A Voyage-API | B Lokales Sidecar | C OpenAI-API |
|---|:---:|:---:|:---:|
| Daten verlassen das System | ✓ | ✗ | ✓ |
| EU-Hosting möglich | (VPC AWS/Azure, kostenpflichtig) | ✓ | ✗ |
| BSH-Compliance-Sales-Argument | rotes Tuch | grünes Häkchen | rotes Tuch |
| AVV / DPA notwendig | ja | nein (kein Datentransfer) | ja |
| Cross-Border-Transfer-Risiko | mittel | null | hoch |

→ **Für Konzern-Kunden wie BSH ist Option B klar überlegen.** "Eure Architektur-Daten verlassen unsere Infrastruktur niemals" ist ein verkaufsentscheidendes Argument.

---

## Latenz-Vergleich

| Operation | A Voyage | B Sidecar | C OpenAI |
|---|---|---|---|
| Single Embedding | ~200ms (network + inference) | ~50-80ms (lokal-CPU) | ~150ms (network) |
| Batch (100 Elements) | ~500ms | ~300ms | ~400ms |
| Cold-Start | 0 | 5-10s (Model-Load on Container-Start) | 0 |

→ **B ist im Production-Steady-State am schnellsten** (kein Network-Hop). Cold-Start ist bei Container-Restart einmalig.

---

## Setup-Aufwand-Vergleich

| Aspekt | A Voyage | B Sidecar | C OpenAI |
|---|---|---|---|
| API-Account-Setup | 5 Min | nicht nötig | bereits da (Key in .env) |
| Code-Integration | 1h (REST-Wrapper) | 4h (Container + HTTP-Service + sentence-transformers) | 30 Min |
| docker-compose.yml-Erweiterung | nein | ja (1 neuer Service) | nein |
| Production-Deploy | nein (nur Env-Var) | ja (neuer Container muss auf VPS) | nein |
| Maintenance | API-Compatibility-Watching | Python-Deps + Model-Updates | API-Compatibility-Watching |
| Rollback wenn Probleme | trivial (Code) | trivial (Container-Stop) | trivial (Code) |

→ **A/C sind schneller zu integrieren.** B braucht 4-5h Mehraufwand.

---

## Decision-Matrix Summary

| Faktor (Gewicht) | A Voyage | B Sidecar | C OpenAI |
|---|:---:|:---:|:---:|
| Cost (10%) | ★★★★★ | ★★★★★ | ★★★★★ |
| Quality (15%) | ★★★★★ | ★★★★ | ★★★★★ |
| Compliance / DSGVO (30%) | ★★ | ★★★★★ | ★ |
| Latenz (15%) | ★★★ | ★★★★★ | ★★★ |
| Setup-Geschwindigkeit (20%) | ★★★★★ | ★★★ | ★★★★★ |
| Konzern-Sales-Argument (10%) | ★ | ★★★★★ | ★ |
| **Gewichteter Score** | **3.4** | **4.4** | **3.2** |

---

## Empfehlung

### Phase 1 — Sprint 2 (jetzt)
**Option B: Lokales Python-Sidecar mit `all-mpnet-base-v2`**

Begründung:
1. PoC hat Quality bereits validiert (5/5 PASS)
2. DSGVO-Story ist konzern-verkaufsentscheidend
3. Null-Cost forever
4. Foundation für Tier-3-UCs (UC-RED-001 + UC-HARM-001) ist sauber on-prem

Aufwand: **+4h** in Sprint-2-Plan einplanen für Container-Setup. Akzeptabel.

### Phase 2 — Falls Quality im Real-Use-Case knapp wird
**Upgrade-Pfad zu voyage-4-nano (open-weight) ODER voyage-4-API**

Trigger-Signal: User-Feedback im UC-RED-001 oder UC-HARM-001 zeigt False-Positives oder False-Negatives die mit Embedding-Quality erklärbar wären.

Migration-Pfad ist trivial:
- Service-Interface bleibt identisch
- Nur Backend-Adapter tauschen
- Re-Indexing aller Workspaces läuft im Background

### Was wir NICHT machen
- Voyage-VPC-Deployment (AWS/Azure Marketplace) — zu viel Setup, kein klarer Quality-Vorteil über lokales Setup
- OpenAI-API — kein DSGVO-Argument, keine Quality-Vorteil
- Eigenes Fine-Tuning — kein klarer Bedarf, der PoC-Score zeigt es

---

## Konkrete Nächste Schritte

REQ-SIM-001 (Service-Foundation) bekommt jetzt diese Architektur:

```
TheArchitect-Docker-Stack (existing)
├── app (Node.js/TypeScript)
├── mongodb
├── neo4j
├── redis
├── minio
├── caddy
└── NEU: embedding-sidecar (Python)
    ├── sentence-transformers/all-mpnet-base-v2 (cached at /models)
    ├── FastAPI HTTP service on :8001
    └── POST /embed { text: string } → { vector: number[] }
```

`elementSimilarity.service.ts` ruft via HTTP `embedding-sidecar:8001/embed` auf — anstatt Voyage-API.

Qdrant ist bereits im Stack (via dataServer.service für RAG) — Collection-Naming `elements-{workspaceId}` macht Tenant-Isolation hart (REQ-SIM-005).

### Sprint-2-Adjustment

In `docs/superpowers/plans/2026-05-11-tier1-bsh-sprint2.md` Track A bekommt eine neue Task A0:

**Task A0 — Embedding-Sidecar-Container** (~3h)
- [ ] A0.1 Neuer `Dockerfile.embedding-sidecar` mit Python + sentence-transformers
- [ ] A0.2 FastAPI-Service mit single `/embed` Endpoint
- [ ] A0.3 Pre-warm des Modells beim Container-Start
- [ ] A0.4 Healthcheck endpoint
- [ ] A0.5 docker-compose.yml-Erweiterung
- [ ] A0.6 Commit: `feat(embedding-sidecar): local sentence-transformers HTTP service`

REQ-SIM-001 baut darauf auf via HTTP-Client.

**Sprint-2 wird dadurch nicht länger** — A0 läuft parallel zu Track C (PLATEAU-Polish, das ist DevOps-Arbeit, nicht App-Code).

---

## Lessons aus dem Spike

- **45 Min ist genug** für eine fundierte Backend-Decision wenn der Quality-PoC schon da ist
- **Cost ist nicht der Decision-Faktor** bei Embedding-APIs in unserer Skala
- **Compliance + Sales-Argument** wiegt schwerer als marginal-höhere Quality
- **Migration-Pfad sauber halten:** Service-Interface stable, Backend-Adapter swappable
