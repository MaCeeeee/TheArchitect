# Pre-Flight RVTM — UC-CHOICE-003: Real-time Compliance Linting (THE-190)

**Datum:** 2026-07-11
**Status:** Pre-Flight abgeschlossen — spezifikationsreif MIT zwei Klärungen (Sandbox-Scope, Schema-Fundament)
**Linear:** [THE-190](https://linear.app/thearchitect/issue/THE-190/uc-choice-003-real-time-compliance-linting-in-decision-sandbox) (High, Backlog seit 2026-04-27, Heartbeat-Flag Typ C am 2026-06-28)

## 1. Kontext

Pattern C der Bounded-Autonomy-Familie: „ESLint für Architektur-Entscheidungen" — Real-time-Compliance-Feedback im Editor. Größter weißer Fleck im DACH-EAM-Markt (kein Wettbewerber lintet live gegen Unternehmens-Policies). Voll spezifiziert mit 6 REQs (THE-201..206). Blockt THE-192 (Configurator, seit 2026-07-11 formal) und THE-195 (Exception Workflow).

## 2. Linear-Umfeld (Step 1)

| Issue | Titel | Status | Relevanz |
|---|---|---|---|
| THE-190 | UC-CHOICE-003 (Parent) | Backlog, High | 6 REQs vorhanden, seit April unverändert |
| THE-201..206 | REQ-CHOICE-003.1–.6 | Backlog | Voll ausformulierte ACs (siehe Gap-Matrix §4) |
| THE-124 | UC-GOV-001 manuelle Tests 5/7/8 | **Done** (2026-04-29) | War laut April-RVTM „Voraussetzung für CHOICE-003-Demos" — erledigt |
| THE-118 / GOV-001 | Policy-as-Data | **Done** | Engine, auf der alles aufsetzt |
| THE-192 / THE-195 | CHOICE-002 / -006 | Backlog | Dependents — warten auf diese Pipeline |
| THE-371 | UC-HEARTBEAT-001 | relatedTo | Heartbeat flaggte THE-190 am 2026-06-28 als liegengebliebenen Kandidaten („Fundamente alle vorhanden") |

**Keine offenen Blocker.** Alle Fundamente (Policy-Engine, WS-Loop, Pattern Library, Compliance-Matrix) sind Done.

## 3. Ist-Zustand der Engine (Codebase, Step 2)

Der Kern existiert und ist solide:

- **Rules-as-Data:** `Policy` mit `rules: IPolicyRule[]` (`{field, operator, value, message}`), Scope-Matching, 9 Operatoren (`server/src/models/Policy.ts`, `services/compliance.service.ts:149-174`)
- **Inkrementelle Live-Evaluation:** `evaluateElementPolicies` pro Element bei Create/Update/Delete (`architecture.routes.ts:656/761/853`), Upsert auf Unique-Index `policyId+elementId+field`, Auto-Resolve
- **Realtime-Loop:** Eval → `violation:update` (nur `{projectId}`) → Client-Debounce 1s → Refetch (max 500) → Count-Maps → 3D-Dots (`NodeObject3D.tsx:424`) + `PolicyBoard`-Bars
- **Non-persisting Evaluator:** `checkCompliance` (`compliance.service.ts:34`) — de-facto Dry-Run-Seed, aber eigener Code-Pfad (liest `e.metadata`, persistierender Pfad liest `e.metadataJson` — **Divergenz = Bug-Quelle**)
- **ENFORCE-Gate:** ConformanceHub verlinkt „Enforce" → ComplianceDashboard — heute ein reiner **Viewer**, nichts wird tatsächlich enforced. UC-CHOICE-003 füllt dieses Gate mit Substanz.

## 4. Gap-Matrix pro REQ (Step 2, Kern des Pre-Flights)

| REQ | Coverage | Vorhanden | Lücke | Konflikt mit Ist-Schema |
|---|---|---|---|---|
| **003.1** Perf p95<2s | PARTIAL | Inkrementelle Per-Element-Eval, Client-Debounce | Kein Perf-Test, kein CI-Gate, kein Server-Cache/Debounce; Eval läuft fire-and-forget NACH der Response — es gibt gar keinen p95-Messpunkt im User-Pfad | — |
| **003.2** Strukturierte Messages | PARTIAL | `message`, `severity`, Inline-3D-Rendering (Dots) | Kein `ruleId` (**Rules haben `_id:false` — keine Identität!**), kein `resourcePath`, kein `docLink`, kein Output-JSON-Schema; 3D transportiert nur Counts, keine Details | `severity`-Domain: Ist `error/warning/info`, REQ verlangt `low/medium/high/critical` |
| **003.3** Enforcement-Levels | **NONE** | — | `enforcementLevel` existiert nirgends; kein Save/Apply-Blocking (Eval ist post-response); Hard-Block erfordert **synchrone Eval im Write-Path** = Architektur-Entscheidung | severity ist heute überladen (Klassifikation + Scoring-Formel `compliance.service.ts:90`); Blast-Radius ≈ 15+ Stellen (Modelle, DTOs, LLM-Draft-Pipeline, 3 UIs); `PolicyDraftReview` nennt severity bereits „Enforcement severity" |
| **003.4** Override + Audit | **NONE** (Audit-Substrat PARTIAL) | `AuditLog` append-only-ish (keine UPDATE/DELETE-Routen), `audit()`-Middleware | Kein Override-Flow (`suppressed`-Status ist toter Enum-Wert), keine Begründungspflicht, kein CSV/JSON-Export | — |
| **003.5** Dry-Run | PARTIAL | `checkCompliance` = non-persisting Whole-Project-Eval | Kein `dryRun`-Param, keine Draft-Policy-Simulation (`PolicyDraftReview` previewt Policies, nicht deren Violations) | `metadata` vs `metadataJson`-Divergenz beim Dry-Run-Bau mitfixen |
| **003.6** Severity-Cutoff + Telemetrie | **NONE** | `Project.settings` als erweiterbarer Container | Kein Governance-Settings-Objekt, keine Override-Rate-Telemetrie (nichts zu zählen, solange 003.4 fehlt) | — |

### Befund über den REQs: „Decision Sandbox" ist unspezifiziert

Der UC-Titel verspricht Linting „in Decision Sandbox" — **kein REQ deckt die Sandbox ab.** Es existiert auch keine: Scenarios sind der einzige Non-Committing-Mechanismus (Delta/Overlay), aber **Policies werden nie gegen Scenario-Deltas evaluiert** (`loadElement` liest nur Live-Neo4j). Die vorhandene Realtime-Loop lintet den **Haupteditor**. Entscheidungsbedarf: Slice 1 = Editor-Linting (ENFORCE-Gate vervollständigen, Titel de facto „Real-time Compliance Linting"), Scenario-/Sandbox-Eval als separater Folge-REQ.

### Seit April verändert (REQ-Präzisierung nötig)

- Norm-Registry as Data (THE-413/414) + Ontologie-enforced Writes (THE-417): `docLink`/Normbezug sollte auf die Registry zeigen, nicht auf hartkodierte Knowledge-Base-URLs
- **Ontologie-Zod-Gate an der Schreibgrenze ist Präzedenzfall für synchrones Write-Path-Blocking** — Hard-Mandatory kann dasselbe Muster nutzen
- Conformance-IA (2026-06-28-conformance-three-gates.md): 003 = Substanz des ENFORCE-Gates

## 5. WSJF Re-Score (8-Kriterien)

April-Score: **85,7** (damals #2 im Backlog). Re-Score wegen veränderter Inputs (Rescore-Trigger: Blocker THE-124 seit 29.04. Done, Engine live validiert):

| Kriterium | Apr | Jetzt | Begründung Delta |
|---|---|---|---|
| Business Value | 5 | 5 | Unverändert: größter weißer Fleck, ESLint-Story; zusätzlich ENFORCE-Gate + Trust-Spine (Enforcement mit Audit = Notar-Prinzip) |
| Business Risk | 4 | 4 | Wettbewerbsfenster offen (MEGA verspricht es marketing-seitig) |
| Impl. Challenges | 3 | 3 | Gap-Scan bestätigt: severity-Refactor 15+ Stellen + synchroner Write-Path; aber Eval-Kern + WS-Loop stehen |
| Chance of Success | 4 | **5** | Fundament vollständig da + manuell validiert (THE-124 Done); checkCompliance als Dry-Run-Seed; Zod-Gate als Blocking-Präzedenzfall |
| Compliance | 5 | 5 | Append-only Audit + Export + Enforcement = Kern-Compliance-Substanz |
| Relations | 5 | 5 | Blockt THE-192 + THE-195 (formal); CHOICE-006 erweitert das Audit-Schema |
| Urgency | 4 | 4 | Heartbeat-Flag (liegt seit 27.04.), kein externer Termin |

**Priority Score: 88,6 / 100** (vorher 85,7) — **gleichauf mit CTXGOV Read-Side-Gate an der Backlog-Spitze**, vor UC-WFCOMP-001 (82,9).

## 6. Komplexitätsbewertung nach Ousterhout (Pflicht-Gate)

| Dimension | Verdikt | Begründung |
|---|---|---|
| Ausweiten von Änderungen | **hoch (einmalig)** | severity/enforcementLevel-Trennung berührt 15+ Stellen inkl. Scoring-Formel + LLM-Draft-Pipeline — eine bewusste Migrations-Welle, danach sinkt die Streuung (zwei orthogonale Achsen statt einer überladenen) |
| Kognitive Last | mittel | Etablierte Patterns (Sentinel-Levels, OPA-Messages, Azure Dry-Run) mit Real-World-Vorbildern in den REQs |
| Unbekannte Unbekannte | mittel | Ist-Zustand präzise vermessen; die 2 offenen Architektur-Fragen sind benannt und entscheidbar: (a) Sandbox-Scope, (b) synchrone Eval für Hard-Block (Präzedenzfall existiert) |
| Abhängigkeiten | **niedrig** | Alle Vorläufer Done (GOV-001, THE-124); baut ausschließlich auf Eigenem auf |
| Unklarheiten | mittel → sinkt | severity-Doppelrolle (Klassifikation + Score) ist bestehende Obscurity, die der UC explizit AUFLÖST statt umgeht |

**Kein Umschnitt-Zwang** (Regel triggert bei UU hoch ODER Deps hoch — beides nicht der Fall). **Haupt-Watch-Point:** Die severity-Migration muss als eigener Vorschalt-Schritt laufen (Schema-Fundament), sonst bauen 003.2/003.3 auf sich bewegendem Grund. **Zweiter Watch-Point:** Hard-Block synchron im Write-Path ändert das Latenz-Profil jedes Element-Writes — Advisory/Soft dürfen asynchron bleiben, nur Hard-Policies dürfen in den Request-Pfad.

## 7. Verdikt & empfohlener Schnitt

**Spezifikationsreif nach zwei Klärungen:**

1. **Sandbox-Deskopierung (empfohlen):** Slice 1 = Real-time Linting im Haupteditor (ENFORCE-Gate vervollständigen). Scenario-Policy-Eval („Sandbox") als neuer Folge-Seed, nicht Teil von 003.
2. **Neuer Vorschalt-REQ 003.0 „Schema-Fundament":** severity-Domain-Migration (`error/warning/info` → `low/medium/high/critical` mit Daten-Migration + Scoring-Formel-Anpassung), `ruleId`-Einführung (Rule-Identität statt `_id:false`), `enforcementLevel` als neue orthogonale Achse (Default `advisory`).

**Empfohlene Bau-Reihenfolge:** 003.0 (Fundament) → 003.2 (Messages + Schema) → 003.3 (Enforcement-Gating) → 003.4 (Override + Audit) → 003.6 (Cutoff + Telemetrie) → 003.5 (Dry-Run) → 003.1 (Perf-Messung + CI-Gate zum Abschluss — erst messbar, wenn der synchrone Pfad existiert).

## 8. Traceability

| Artefakt | Referenz |
|---|---|
| Parent | THE-190 (blocks THE-192, THE-195) |
| REQs | THE-201..206 vorhanden; 003.0 vorgeschlagen (nach User-Go) |
| Vorläufer | THE-118/GOV-001 Done, THE-124 Done |
| Scoring | §5 (88,6; Sheet-Sync ausstehend) |
| Vorgänger-Pre-Flight | 2026-07-11-uc-choice-002-preflight-rvtm.md (THE-192 zurückgestellt) |
| Strategie | docs/strategy/2026-06-28-conformance-three-gates.md (ENFORCE-Gate) |
| Plan | docs/superpowers/plans/2026-07-11-uc-choice-003-realtime-compliance-linting.md |

## 9. Plan-Traceability (Requirement → Task → Verifikation)

**Plan:** `docs/superpowers/plans/2026-07-11-uc-choice-003-realtime-compliance-linting.md`
**Erstellt:** 2026-07-11 · Alle Status `PENDING` bis Ausführung (executing-plans aktualisiert je Task).

| ID | Requirement (Linear) | Plan-Task(s) | Files (geplant) | Verifikation | Status |
|---|---|---|---|---|---|
| R-442a | severity-Domain `low/medium/high/critical` + Migration bestandsdatenstabil | T1, T2, T4 | `shared/.../compliance.types.ts`, `models/Policy.ts`, `models/PolicyViolation.ts`, `scripts/migrate-severity-enforcement.ts` | `jest migrate-severity` (Mapping+Idempotenz) + `jest policy-evaluation -t THE-442` | PENDING |
| R-442b | Scoring-Formel regressionsstabil (Alt-Score reproduziert) | T3 | `services/compliance.service.ts` | `jest compliance-score` (error·3+warning·1 ≙ high·3+medium·1 = 55%) | PENDING |
| R-442c | `ruleId` als stabile Rule-Identität + Index-Umstellung auf `(policyId,elementId,ruleId)` | T2, T4, T5 | `models/Policy.ts`, `models/PolicyViolation.ts`, `services/policy-evaluation.service.ts` | `jest policy-evaluation` (ruleId gesetzt, unique) | PENDING |
| R-442d | `enforcementLevel`-Achse (Default advisory), DTOs + LLM-Draft-Pipeline | T1, T2, T6 | `models/Policy.ts`, `shared/.../compliance.types.ts`, `standards.routes.ts` | Build 3 Pakete + `jest policy-evaluation` | PENDING |
| R-442e | Blast-Radius vollständig (Governance-UIs, Seeds, Tests) | T6, T7 | `client/.../PolicyDraftReview.tsx`, `ComplianceDashboard.tsx`, `PolicyManager.tsx`, `data/seed-policies.ts` | `grep`-Sweep (keine Legacy-Literale) + volle Suite | PENDING |
| R-202a | Strukturierte Messages `{ruleId,severity,message,resourcePath,docLink}` + JSON-Schema | T8 | `schemas/validation-violation.schema.json`, `services/violation-format.ts` | `jest violation-schema` (ajv, CI-Gate) | PENDING |
| R-202b | docLink auf Norm-Registry (Fallback KB), keine hartkodierten URLs | T9 | `services/policy-evaluation.service.ts` | `jest` deriveDocLink (standardId+section) | PENDING |
| R-202c | Frontend: Inline-Violation-Details am 3D-Knoten (nicht nur Count) | T10 | `stores/complianceStore.ts`, `components/3d/NodeObject3D.tsx` | `vitest complianceStore.details` + In-Browser (Tooltip zeigt severity+message) | PENDING |
| R-203a | 3 Enforcement-Levels; Hard synchron im Write-Path (422), Advisory/Soft async | T12, T13 | `services/enforcement-gate.service.ts`, `routes/architecture.routes.ts` | `jest enforcement-gate` (blockt hard, nicht soft; scope/dates; update-form) + curl 422 | PENDING |
| R-203b | UI: Enforcement-Icons, Block-Dialog, Änderung nicht stillschweigend verworfen | T14 | `client/.../EnforcementBlockDialog.tsx`, `stores/architectureStore.ts`, `PolicyManager.tsx` | In-Browser (Dialog erscheint, Rollback → Element nicht im 3D) | PENDING |
| R-204a | Soft-Override: Begründung ≥50 Zeichen, sonst 422 | T16 | `services/violation-override.service.ts`, `routes/governance.routes.ts` | `jest violation-override` (reason<50→422, hard→403, advisory→422) | PENDING |
| R-204b | Append-only Audit-Trail (userId,ts,reason,policyId,ruleId,elementId,enforcementLevel) | T16 | `services/violation-override.service.ts` (via `createAuditEntry`) | `jest` (AuditLog-Eintrag `policy_violation_override`) | PENDING |
| R-204c | CSV/JSON-Export der Audit-Logs (DSGVO: IDs statt Klarnamen) | T17 | `services/audit-export.service.ts`, `routes/governance.routes.ts` | `jest audit-export` (RFC-4180-Quoting, 3 Zeilen) | PENDING |
| R-204d | UI: OverrideDialog (Live-Zähler), suppressed-Ansicht | T18 | `client/.../OverrideDialog.tsx`, `ComplianceDashboard.tsx`, `stores/complianceStore.ts` | In-Browser (30→disabled, 60→submit, „Overridden"-Badge) | PENDING |
| R-206a | Severity-Cutoff in `Project.settings.governance` (Default high) | T20 | `models/Project.ts`, `routes/project.routes.ts` (dedizierter PATCH) | `jest` + PATCH klobbert übrige settings nicht | PENDING |
| R-206b | Cutoff dämpft effektive Enforcement-Stufe (reversibel), sync+async Pfad | T21 | `services/enforcement-gate.service.ts`, `services/policy-evaluation.service.ts` | `jest enforcement-gate -t cutoff` (below-cutoff→advisory) | PENDING |
| R-206c | Override-Rate-Telemetrie (>30% & N≥10 → Banner) + Onboarding-Hint | T22 | `routes/governance.routes.ts`, `client/.../ComplianceDashboard.tsx` | `jest override-stats` + In-Browser (Banner, Hint dismiss) | PENDING |
| R-205a | Dry-Run: Kandidaten-Policies eval ohne Persist/Audit/Score-Impact | T23, T24 | `services/policy-dryrun.service.ts`, `services/element-loader.service.ts`, `routes/governance.routes.ts` | `jest policy-dryrun` (0 PolicyViolations, 0 AuditLog) | PENDING |
| R-205b | Eval-Pfad konsolidiert (metadata↔metadataJson-Divergenz behoben) | T23 | `services/element-loader.service.ts`, `services/compliance.service.ts` | volle Suite grün nach Loader-Move | PENDING |
| R-205c | Draft-Violation-Preview im Client + JSON-Download + Promotion-Hint | T24 | `client/.../PolicyDraftReview.tsx`, `PolicyManager.tsx` | In-Browser („Preview violations", JSON-Download) | PENDING |
| NF-201a | async Eval p95 < 800ms (Server-Anteil); hard Gate p95 < 300ms @50×100 | T25 | `__tests__/policy-perf.test.ts` | `jest policy-perf` (p95-Assertions) | PENDING |
| R-201b | Loading-State sichtbar > 500ms | T26 | `client/.../ComplianceDashboard.tsx` | In-Browser (Spinner erst nach 500ms) | PENDING |
| NF-201c | CI-Gate führt Perf-Test aus (Actions geflaggt → lokaler jest = Gate) | T27 | `.github/workflows/ci.yml` | Workflow-Datei + `npm test` lokal | PENDING |
| C-scope | Scenario-/Sandbox-Eval NICHT im Scope (deskopiert) | — | — | Design-Constraint (Seed `seed_scenario_policy_eval`) | N/A |

**Coverage (Plan-Phase):** 23 Requirements · 0 PASS · 0 FAIL · 22 PENDING · 1 N/A · geplante Coverage nach Ausführung 100%.

**Change Log:** 2026-07-11 — §9 initial angelegt (Plan-Phase), alle testbaren REQs PENDING.
