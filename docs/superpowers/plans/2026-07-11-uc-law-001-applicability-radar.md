# UC-LAW-001 — Regulatory Applicability Radar (Umsetzung)

**Stand:** 2026-07-11 · **Branch:** `claude/enterprise-architecture-legal-r3tenn` · **Grundlage:** ADR-0004 E6 (Quellen als Ontologie-Daten), THE-390 P4b (Add-to-pipeline-Adapter), WFCOMP-Scope-Philosophie (THE-353)

## Ziel

Die Frage „**Welche Gesetze gelten für diese Art der Unternehmensarchitektur?**" beantworten — deterministisch, aus dem, was schon da ist: den Architektur-Elementen (insb. den vom **AI Wizard/Blueprint** generierten, `source='blueprint'`) und dem Projekt-Kontext (Name, Beschreibung, Vision, Tags, Stakeholder). Jede Einschätzung trägt Evidenz (welche Elemente, welche Treffer) und mündet direkt in die bestehende Compliance-Pipeline („Add to pipeline", THE-390 P4b).

## Nicht-Ziele

- **Keine Rechtsberatung.** Der Report ist Entscheidungsunterstützung mit Disclaimer; Schwellenwerte (NIS2-Größe, LkSG ≥1000 MA) und Rollen (Controller/Processor, Provider/Deployer) kann die Heuristik nicht prüfen — sie werden als `baselineNote` ehrlich ausgewiesen.
- **Kein LLM im Pfad.** Reproduzierbar, erklärbar, läuft ohne API-Keys. (LLM-gestützte Verfeinerung wäre ein späterer, separater Schritt — human-confirmed wie beim ICM-Mapping.)
- **Keine Persistenz.** Der Report wird on-demand berechnet (GET), nichts gespeichert.
- **Kein Fragebogen-Persistenz-Umbau.** Der Blueprint-Questionnaire wird weiterhin nicht serverseitig gespeichert; der Radar arbeitet auf dessen dauerhafter Spur: den importierten Elementen.

## Architektur

```
GET /api/projects/:projectId/norms/applicability          (norms.routes.ts)
  └─ buildApplicabilityReport                             (regulationApplicability.service.ts)
       ├─ loadProjectFacts        Neo4j-Elemente (+metadata.sensitivity, source='blueprint')
       │                          + Mongo-Projekt (name/description/vision/tags/stakeholders)
       ├─ evaluateSignals  PURE   SIGNAL_DEFS → Signale mit Evidenz (gekappt, matchCount ehrlich)
       ├─ assessRules      PURE   APPLICABILITY_RULES → Score (noisy-OR) → Verdict
       └─ loadNormWorldState      listNorms/listAvailableCorpusNorms/PipelineState
                                  → referenced / inPipeline / availableInCorpus / workId
```

- **Signale + Regeln sind DATA** (`server/src/data/applicability-rules.ts`) im THE-413-Geist: ein neues Gesetz = Regel-Zeile mit `corpusSourceIds` aus `NORM_ONTOLOGY.normSources` (Test erzwingt Registry-Membership), kein Code-Umbau.
- **Scoring:** noisy-OR `1−Π(1−w)` — unabhängige Evidenz verstärkt sich, überstimmt nie. Verdicts: ≥0.75 `applicable` · ≥0.45 `likely` · ≥0.2 `possible` · sonst `not_indicated` (`verdictFromScore`, shared).
- **Gating:** `requiresSignals` (z. B. `high-risk-ai-context` nur bei `ai-components`) — Evidenz bleibt sichtbar, `detected` bleibt false (Transparenz statt stillem Verwerfen).
- **Typ-Schwellen:** `minTypeMatches` (z. B. „substantial technology estate" ≥3 Tech-Elemente); Pattern-/Sensitivity-Treffer zählen immer.
- **Großzügig wie WFCOMP:** False Negative (Gesetz übersehen) ist gefährlicher als ein zu viel geprüftes.

## Abgedeckte Normen (v1)

| Regel | Kern-Signale | Hinweis |
|---|---|---|
| `dsgvo` | personal-data, pii-classified (X-Ray-Sensitivity), customer-facing, health-data | Rolle bestimmt Pflichten |
| `ai-act` | ai-components (`ai_agent`-Typ + Patterns), high-risk-ai-context (Annex III, gated) | Risikoklasse je System |
| `data-act` | connected-products (device/equipment + IoT-Patterns), cloud-services (Art. 23 ff.) | |
| `nis2` | critical-sector (Annex I/II), cloud-services, security-baseline | Größenschwellen national |
| `dora` | financial-sector | Cloud allein triggert NICHT |
| `lksg` | supply-chain | ≥1000 MA, sonst via Verträge |
| `iso27001` | security-baseline, personal-data, critical-sector | freiwillig; `uploadTitlePatterns` erkennt hochgeladene Standards als referenced |

## Artefakte

| Datei | Was |
|---|---|
| `shared/src/types/applicability.types.ts` | Report-/Assessment-/Signal-Kontrakt + `verdictFromScore` |
| `server/src/data/applicability-rules.ts` | SIGNAL_DEFS + APPLICABILITY_RULES als Daten |
| `server/src/services/regulationApplicability.service.ts` | Fakten laden, pure Auswertung, Norm-Welt-Anreicherung |
| `server/src/routes/norms.routes.ts` | `GET /:projectId/norms/applicability` |
| `client/src/services/api.ts` | `normsAPI.applicability` |
| `client/src/components/compliance/ApplicabilityCheck.tsx` | Radar-Panel (Standards-Sektion, über RegulationsPanel): Verdict-Badges, Score-Bar, Evidenz-Chips (✨ = AI Wizard), Add-to-pipeline, Disclaimer |
| `server/src/__tests__/regulationApplicability.test.ts` | 23 Tests (Registry-Kontrakt, noisy-OR, Signale, Gates, Schwellen, Regeln) |
| `client/src/components/compliance/ApplicabilityCheck.test.tsx` | 5 Tests (Render, Evidenz, Add-to-pipeline, Empty, Error) |

## Tests / Verifikation

- Registry-Kontrakt: jede Regel referenziert nur Ontologie-Quellen; jede Contribution ein definiertes Signal.
- Kern-Szenarien: PII-Architektur → DSGVO applicable · AI-Agent im HR-Kontext → AI Act applicable · reine CRM-Architektur → AI Act not_indicated · IoT → Data Act · Bank → DORA, Cloud allein nicht · leeres Modell → alles not_indicated mit ehrlicher Begründung.
- E2E gegen laufende Neo4j/Mongo steht aus (Umgebung ohne DBs); Route ist dünn über den getesteten Services.
