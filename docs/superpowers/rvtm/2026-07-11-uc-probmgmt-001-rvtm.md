# RVTM — UC-PROBMGMT-001: Automated Defect & Problem Management (ISO 15288 §6.3.7)

**Pre-Flight:** 2026-07-11 · **Linear-UC:** [THE-443](https://linear.app/thearchitect/issue/THE-443) · **Score:** 82,9/100
**Strategy-Doc:** `docs/strategy/2026-07-11-problem-management-and-operational-governance-engine.md`
**Zwilling:** UC-RISK-001 ([THE-444](https://linear.app/thearchitect/issue/THE-444)) — geteilte Operational Governance Engine
**Status:** **UC KOMPLETT — alle 4 Slices implementiert, getestet, DEPLOYED.** Slice 1+2 = #52/`56fa11b` (2026-07-12), Slice 3+4 = #56/`3474a2c` (2026-07-13). 40/40 Tests (6 Suites), `tsc` sauber. Prod-Smoke: alle 9 Register-Routen live + auth-gated.

## Traceability-Matrix

| REQ | Linear | Slice | 15288 §6.3.7 | Verifikation | Evidence | Status |
|---|---|---|---|---|---|---|
| REQ-PROBMGMT-001.1 — Ingest + Schema-Validierung + deterministischer P_score + WORM-Register + Human-Gate | [THE-445](https://linear.app/thearchitect/issue/THE-445) | 1 | Identify + Analyze | Unit (Schema, Score-Determinismus, WORM-Append) + Route-Supertest | **17/17 grün**, `tsc --noEmit` sauber (2026-07-11) | **done** |
| REQ-PROBMGMT-001.2 — Sentry-Quelle + Fingerprint-Dedup + occurrence_counter | [THE-446](https://linear.app/thearchitect/issue/THE-446) | 2 | Identify | Integration (2 Payloads gleiche Ursache → 1 Defect, Counter=2) + Fingerprint-Unit-Tests + Urgency-Eskalation | **deployed** #52; n8n-Workflow `3QMcMgiKMh7WsFei` validiert, inaktiv (Live-Aktivierung = Credential + Projekt-ID + Sentry-Webhook) | **done** |
| REQ-PROBMGMT-001.3 — Closed Loop: Verify-Closure + Cascade-Close + SLA-Breach | [THE-447](https://linear.app/thearchitect/issue/THE-447) | 3 | Track + Verify | Integration (verify→resolve/reopen; recurrence-block; cascade Incident+Problem; SLA-sweep idempotent) + Prod-Smoke 401; n8n-Cron `cweHcyNrFjGVt6Jg` (täglich /sla-sweep) | **deployed** #56 | **done** |
| REQ-PROBMGMT-001.4 — LLM-Anreicherung (Duplikat/Trend) + Notify | [THE-448](https://linear.app/thearchitect/issue/THE-448) | 4 | Analyze + Monitor | Stub-LLM-Vorschläge (Halluzinations-Filter, Audit model+promptHash); Degradation (kein Client / LLM-Error); createProblem→Slice-3-Cascade; Notify build/no-webhook | **deployed** #56 | **done** |

## Slice 1 — Artefakte (2026-07-11)

**Shared** (`packages/shared/src/`): `types/register.types.ts`, `constants/register-scoring.constants.ts` (versionierte Gewichte `v1`), `utils/register-scoring.ts` (reine `computePScore`/`routeByScore`/`scoreAndRoute`), Barrel erweitert.
**Server** (`packages/server/src/`): `models/RegisterEntry.ts` (WORM, pre-save-Guard), `services/register.service.ts` (`ingestEntry`/`decideGate`/`computeFingerprint` + Audit je Schritt), `routes/register.routes.ts` (POST `/ingest`, POST `/:id/gate`, GET `/`), Mount in `index.ts`.
**Tests** (`packages/server/src/__tests__/`): `register-scoring.test.ts`, `RegisterEntry.model.test.ts`, `register.routes.test.ts` — 17 Tests.

Score-Kalibrierung `v1`: Gewichte S=2,0 · U=1,0 · C=1,5; Schwellen critical≥16, noise≤5 (Spanne −5…22,5). Register-Store = Mongo. Ausgehende Aktionen alle `proposed`/`requiresApproval` (kein Auto-Execute).

## Slice 2 — Artefakte (2026-07-12)

**Engine-Erweiterung:** `computeFingerprint` = hash(component + errorType + normalisierter Top-Frame) — lowercase, `:line[:col]` gestrippt, Titel nur als Fallback ohne Stacktrace. Dedup in `ingestEntry`: offene Chain (open/assessed/triaging/mitigating) mit gleichem Fingerprint → `recordOccurrence` schreibt neue WORM-Row mit `supersedes`, `occurrence_counter+1`, Urgency = max(gemeldet, `urgencyFromOccurrences` log2: 1→1, 2→2, 4→3, 8→4, 16→5), Score re-berechnet, eingehender Report als `evidence.occurrences[]`-Link, Human-Gate-Entscheidungen per Aktions-Typ übernommen. Terminal-Chains (noise/resolved/…) absorbieren nicht → frischer Defect. Audit: `register.occurrence`. Route-Schema: + `errorType`, `eventId`. Model: + `errorType`.

**n8n (AC-1):** Workflow `Sentry → Register Ingest (THE-446)` — id `3QMcMgiKMh7WsFei`, validiert (4 Nodes), **inaktiv**. Webhook `POST /sentry-defect-ingest` → Code-Node normalisiert (level→severity fatal=5…debug=1, Sentry-Frames oldest→newest → letzter = Top-Frame, tags Array/Objekt-tolerant) → HTTP-POST an Engine. **AC-6:** API-Key als n8n-Credential `TheArchitect Register API Key` (httpHeaderAuth `X-API-Key`), nichts im Repo. Aktivierung braucht: Projekt-ID in URL, Credential befüllen, Sentry-Alert-Webhook zeigen lassen.

## Slice 3 — Artefakte (2026-07-13, deployed #56)

**Fundament:** stabile `chainId` (Identität über die WORM-Kette, = _id der ersten Row, auf jede Supersede-Row kopiert) + `firstSeenAt` + `slaDeadline`; `parentRef` referenziert eine `chainId` (Incident→Defect→Problem). Shared: `SLA_WINDOWS_MS` (critical 1d / normal 14d / noise —) + reine `slaDeadlineFrom`.
**Verify-Closure (AC-1):** `closeEntry(chainId)` — `resolved` nur bei `testsGreen && keine Occurrence nach appliedAt`; sonst `open` (reopen) mit Grund. Route `POST /:chainId/close`.
**Cascade (AC-2):** resolved Defect → offene Child-Incidents resolven; Parent-Problem resolvet, sobald ALLE Child-Defects resolved. Audits `register.closed`/`.reopened`/`.cascade_closed`/`.problem_resolved`.
**SLA (AC-3):** `sweepSla` (Chain-Heads) → `escalate`-Proposal (proposed/requiresApproval, kein Auto-Execute), Audit `register.sla_breach`, idempotent, `nowMs` injizierbar. Route `POST /register/sla-sweep`; n8n-Cron `cweHcyNrFjGVt6Jg` (täglich 07:00, inaktiv).

## Slice 4 — Artefakte (2026-07-13, deployed #56)

**LLM = Vorschlags-Layer, nie Entscheider.** `registerEnrichment.service.ts`: `suggestDuplicates` (Kandidaten über den Fingerprint hinaus, nur offener Defect-Pool, halluzinierte IDs gefiltert, NIE Auto-Merge) + `suggestProblemClusters` (≥2 Member). LLM-Client injizierbar (`LlmClient`, Default Anthropic `ANTHROPIC_MODEL||haiku-4-5`); kein Key / LLM-Error → `degraded:true`, Engine unberührt (AC-5). Jeder Output `suggestion:true` + Audit `register.enrichment` (model+promptHash, AC-3).
**Human-Confirm (AC-2):** `createProblem` legt Problem an + verlinkt Defects (`parentRef`) → Slice-3-Cascade. Route `POST /register/problem`.
**Notify (AC-4):** `opsNotify.service.ts` — Block-Kit-Builder + `deliverBlocks` (`OPS_NOTIFY_WEBHOOK_URL`, no-webhook = no-op, wirft nie); fire-and-forget bei kritischem Ingest / Occurrence-Eskalation / SLA-Breach. Melder-Antwort bleibt human-gated (`reply_reporter`).
Routes: `POST /:chainId/suggest-duplicates`, `/register/suggest-problems`, `/register/problem`.

## Wiederverwendung (senkt Feasibility-Risiko)

| Bestehend | Wofür | Ticket |
|---|---|---|
| `RadarSignal` + `BaseSignalCrawler` + Cron + Dedup | Ingest-/Normalisierungs-/Dedup-Muster | THE-310 |
| Audit-Trail (Governance & Compliance) | Schritt-5-Audit-Log | THE-8 |
| RISK-Engine (Score-Matrix, WORM, Gate, Loop) | identische Foundation, geteilt | THE-444 |

## Risiken / Watch-Points (Ousterhout)

- **UU = mittel:** externe Payload-Formate (Sentry) erst beim Verdrahten bekannt → Slice 1 ohne Quelle, Slice 2 brennt UU ab.
- **Score-Matrix empirisch zu kalibrieren:** Gewichte `w1..w3` + Schwellen versioniert, Startwerte in Slice 1, nachjustieren.
- **Asilomar #16:** ausgehende Aktionen (Melder-Antwort, Noise-Abweisung, Eskalation) bleiben hinter Human-Gate.

## Offen (Aktivierung/Tuning — kein Bau mehr)

1. **n8n scharf schalten** (User-Schritte, Claude-Grenze bei API-Key): `ta_`-Key erzeugen → n8n-Credential `TheArchitect Register API Key` (Header `X-API-Key`) → `<PROJECT_ID>` in beide Workflow-URLs (Sentry `3QMcMgiKMh7WsFei` + SLA-Cron `cweHcyNrFjGVt6Jg`) → Sentry-Alert-Webhook → aktivieren.
2. **`OPS_NOTIFY_WEBHOOK_URL`** in Prod-`.env` (Slack/Teams) — sonst Notify = stummer no-op.
3. **Score-Gewichte empirisch kalibrieren**, sobald echte Defects fließen.

## Bau-Reihenfolge

PROBMGMT-001 (komplett, deployed) → RISK-001 erbt die fertige Engine.
