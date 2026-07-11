# UC-LAW-001: Regulatory Applicability Check — welche Gesetze gelten für diese Architektur?

> **Retro-Spec** (2026-07-11): NACH der Implementierung angelegt. Die Kennung UC-LAW-001 wurde
> während der Umsetzung geprägt und aus Code/Docs referenziert; dieses Dokument heilt die fehlende
> Spec-Ebene. Bestimmt zur Übernahme als Linear-Feature-Ticket (Team TheArchitect, Label Feature,
> State In Review, related: THE-309, THE-390) — der MCP-Schreibzugriff war in der Session gesperrt.
>
> **Scoring: pending** — Scoring-Block (BizV/BizR/Feas/Succ/Comp/Rel/Urg) bewusst offen, gehört dem
> Owner. · Modus: additiv (kein Refactor, keine bestehenden Endpunkte verändert)

## Kontext

Ausgangsfrage: *„Könnte TheArchitect prüfen, auf Basis der Elemente bzw. der Informationen aus dem
AI Wizard, welche Gesetze für diese Art der Unternehmensarchitektur gelten sollen?"*

Die Bausteine existierten bereits getrennt: Elemente (inkl. Blueprint-/AI-Wizard-Provenienz
`source='blueprint'`), der Regulierungs-Korpus (UC-ICM-001), die Norm-Facade (UC-NORM-001/THE-390)
und der Add-to-pipeline-Adapter (THE-390 P4b). Was fehlte: die **Anwendbarkeits-Brücke** — vom
Architektur-Modell zur Menge der einschlägigen Gesetze.

## Was (implementiert)

Deterministischer Signal-Check, **kein LLM im Pfad** (reproduzierbar, erklärbar, läuft ohne API-Keys):

1. **Fakten:** Neo4j-Elemente (Name/Typ/Beschreibung/`metadata.sensitivity`/Wizard-Provenienz) +
   Projekt-Kontext (Name, Beschreibung, Vision, Tags, Stakeholder).
2. **12 Signale** (Daten, nicht Code): personal-data, pii-classified, customer-facing, health-data,
   ai-components, high-risk-ai-context (gated), connected-products, cloud-services, critical-sector,
   financial-sector, supply-chain, security-baseline (≥3 Tech-Elemente).
3. **7 Regeln** → Normen aus `NORM_ONTOLOGY.normSources` (Test erzwingt Registry-Membership):
   **DSGVO, EU AI Act, Data Act, NIS2, DORA, LkSG, ISO 27001**. Score per noisy-OR `1−Π(1−w)`,
   Verdicts: applicable ≥0.75 · likely ≥0.45 · possible ≥0.2 · not_indicated.
4. **Evidenz statt Orakel:** Jedes Urteil listet die auslösenden Elemente (✨-Markierung =
   AI-Wizard-generiert) + `baselineNote` für das, was die Heuristik nicht prüfen kann
   (NIS2-Größenschwellen, LkSG ≥1000 MA, Rollen Controller/Processor bzw. Provider/Deployer).
5. **Operationalisierung:** „Add to pipeline" direkt aus dem Panel (THE-390-P4b-Adapter).
   Hochgeladene ISO-27001-Standards werden als referenced erkannt.

API: `GET /api/projects/:projectId/norms/applicability` · UI: Panel „Which laws apply to this
architecture?" (Compliance → Standards, über dem RegulationsPanel) · Permanenter Disclaimer:
Entscheidungsunterstützung, keine Rechtsberatung.

## Bewusste Grenzen (benannt, nicht versteckt)

- **Blinder Fleck = die kuratierte Regel-Tabelle, nicht der Korpus.** Nur die 7 Regeln werden
  geprüft; CRA, ePrivacy, MDR, PSD2, eIDAS, BDSG etc. existieren für den Check nicht — auch wenn
  sie im Korpus lägen. Neue Norm = neue Datenzeile.
- Der Disclaimer sagt aktuell noch nicht explizit „Liste nicht abschließend" (Folgearbeit F1).
- WFCOMP-Philosophie: bewusst großzügig — False Negative gefährlicher als ein zu viel geprüftes Gesetz.

## Abgrenzung

- **UC-RADAR-001 (THE-309, Backlog):** UC-LAW-001 ist die *statische Vorstufe* („was gilt jetzt?")
  des temporalen Radars („was ändert sich?"). Kein Overlap; Promotion-Pfad dokumentiert in
  `docs/superpowers/2026-07-11-uc-law-001-radar-reconciliation.md` (Baseline-Scope für
  Impact-Matcher, Signal-Kind `applicability`, blinder Fleck = RADAR-UC1-Territorium).
- **THE-390 P3 „Applicability":** meint dort Norm-interne Geltung (Reach/Derogation/Bitemporalität)
  — eine andere Frage.

## Artefakte

| Datei | Was |
|---|---|
| `shared/src/types/applicability.types.ts` | Kontrakt + `verdictFromScore` |
| `server/src/data/applicability-rules.ts` | Signale + Regeln als DATA (THE-413-Geist) |
| `server/src/services/regulationApplicability.service.ts` | Fakten laden, pure Auswertung, Norm-Welt-Anreicherung |
| `server/src/routes/norms.routes.ts` | GET-Route |
| `client/.../ApplicabilityCheck.tsx` (+ CompliancePage, api.ts) | Panel |
| `docs/superpowers/plans/2026-07-11-uc-law-001-applicability-radar.md` | Plan/Design |
| `docs/superpowers/2026-07-11-uc-law-001-radar-reconciliation.md` | Einordnung zu THE-309 |

## Verifikation

23 Server-Tests (pure, DB-frei) + 5 Client-Tests grün · TSC strict + Builds (shared/server/client)
sauber · Commits `315f7e0` + `a6c48d2` auf Branch `claude/enterprise-architecture-legal-r3tenn`
(gepusht, ungemergt). Offen: E2E gegen laufende Neo4j/Mongo (Sandbox ohne DBs); DB-gestützte
Alt-Suiten scheitern dort nur am mongodb-memory-server-Download (umgebungsbedingt, vorbestehend).

## Folgearbeiten (Kandidaten, nicht gescoped)

- **F1 — Deckungs-Transparenz:** Disclaimer + UI explizit „geprüft gegen N kuratierte Normen —
  nicht abschließend" + geprüfte Liste anzeigen.
- **F2 — Ungenutzte Signale surfacen:** Signal erkannt, aber keine Regel konsumiert es → Hinweis
  auf mögliche weitere Gesetze außerhalb des Sets.
- **F3 — Regel-Tabelle erweitern** (CRA, ePrivacy, MDR, PSD2, eIDAS, BDSG …) — je Norm eine Datenzeile.
- **F4 — Radar-Promotion** bei Zug von THE-309 (Signal-Kind `applicability`, Baseline-Scope).
- Scoring + Sign-off durch Owner; PR + Merge.
