# RVTM — UC-PROBMGMT-001: Automated Defect & Problem Management (ISO 15288 §6.3.7)

**Pre-Flight:** 2026-07-11 · **Linear-UC:** [THE-443](https://linear.app/thearchitect/issue/THE-443) · **Score:** 82,9/100
**Strategy-Doc:** `docs/strategy/2026-07-11-problem-management-and-operational-governance-engine.md`
**Zwilling:** UC-RISK-001 ([THE-444](https://linear.app/thearchitect/issue/THE-444)) — geteilte Operational Governance Engine
**Status:** Slice 1 **implementiert + getestet** (2026-07-11); Slices 2–4 offen.

## Traceability-Matrix

| REQ | Linear | Slice | 15288 §6.3.7 | Verifikation | Evidence | Status |
|---|---|---|---|---|---|---|
| REQ-PROBMGMT-001.1 — Ingest + Schema-Validierung + deterministischer P_score + WORM-Register + Human-Gate | [THE-445](https://linear.app/thearchitect/issue/THE-445) | 1 | Identify + Analyze | Unit (Schema, Score-Determinismus, WORM-Append) + Route-Supertest | **17/17 grün**, `tsc --noEmit` sauber (2026-07-11) | **done** |
| REQ-PROBMGMT-001.2 — Sentry-Quelle + Fingerprint-Dedup + occurrence_counter | [THE-446](https://linear.app/thearchitect/issue/THE-446) | 2 | Identify | Integration (2 Payloads gleiche Ursache → 1 Defect, Counter=2) | — | offen |
| REQ-PROBMGMT-001.3 — Closed Loop: Verify-Closure + Cascade-Close + SLA-Breach | [THE-447](https://linear.app/thearchitect/issue/THE-447) | 3 | Track + Verify | Integration (fix→verify→cascade; SLA→Eskalation) | — | offen |
| REQ-PROBMGMT-001.4 — LLM-Anreicherung (Duplikat/Trend) + Notify | [THE-448](https://linear.app/thearchitect/issue/THE-448) | 4 | Analyze + Monitor | Test (LLM=Vorschlag; Degradation ohne LLM) | — | offen |

## Slice 1 — Artefakte (2026-07-11)

**Shared** (`packages/shared/src/`): `types/register.types.ts`, `constants/register-scoring.constants.ts` (versionierte Gewichte `v1`), `utils/register-scoring.ts` (reine `computePScore`/`routeByScore`/`scoreAndRoute`), Barrel erweitert.
**Server** (`packages/server/src/`): `models/RegisterEntry.ts` (WORM, pre-save-Guard), `services/register.service.ts` (`ingestEntry`/`decideGate`/`computeFingerprint` + Audit je Schritt), `routes/register.routes.ts` (POST `/ingest`, POST `/:id/gate`, GET `/`), Mount in `index.ts`.
**Tests** (`packages/server/src/__tests__/`): `register-scoring.test.ts`, `RegisterEntry.model.test.ts`, `register.routes.test.ts` — 17 Tests.

Score-Kalibrierung `v1`: Gewichte S=2,0 · U=1,0 · C=1,5; Schwellen critical≥16, noise≤5 (Spanne −5…22,5). Register-Store = Mongo. Ausgehende Aktionen alle `proposed`/`requiresApproval` (kein Auto-Execute). Offen für Bau: Sentry-Ingest (.2), Verify/Cascade/SLA (.3), LLM (.4).

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

## Offene Entscheidungen (vor Bau)

1. Score-Gewichte/Schwellen (Startvorschlag Slice 1).
2. Register-Speicherort: Mongo (Empfehlung, konsistent mit RISK-001).
3. Paging-Kanal Pfad A: PagerDuty/Opsgenie vs. Slack.

## Bau-Reihenfolge

PROBMGMT-001 vor RISK-001 (RISK erbt die dann gebaute Engine). Slice 1 → 2 → 3 → 4.
