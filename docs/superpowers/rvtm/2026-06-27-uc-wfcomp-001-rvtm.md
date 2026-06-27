# RVTM: UC-WFCOMP-001 — Workflow-Compliance-Assessment (DSGVO Art. 30 VVT) — WSJF Scoring

**Erstellt:** 2026-06-27
**Quelle:** Design-Session 2026-06-27 (claude.ai-Chat „DSGVO Art. 30" → Claude-Code Pre-Flight + Repo-Verifikation via 3 Explore-Agenten)
**Parent-UC:** THE-351 · **Slices:** 6 (THE-352..357)

> Scoring-Modell wie bestehende RVTMs (2026-06-24 MCP-UCs): 7 Kriterien je 1–5, **Score = Σ/35·100**.
> Linear = Status, diese RVTM = Source-of-Truth fürs Scoring (per `feedback_requirement_scoring.md`).

## Kriterien

BizValue · BizRisk · Feasibility (5 = leicht baubar) · Success · Compliance · Relations · Urgency

## Scoring

| Linear | UC/REQ | Modus | BizV | BizR | Feas | Succ | Comp | Rel | Urg | **Score** | Status |
|--------|--------|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|--------|
| THE-351 | UC-WFCOMP-001 (Parent) | write | 5 | 4 | 3 | 4 | 5 | 5 | 3 | **82,9** | Backlog |

**82,9 = neuer Backlog-#1** (über UC-0/THE-340 mit 80,0). Differenz sauber begründet: Compliance 5 statt 3 (echtes VVT-Artefakt vs. Vision), minus Urgency (keine Eingangstür, kein fixes Datum).

### Begründung je Kriterium

- **BizValue 5** — Produkt-These wörtlich: „Workflow rein → Compliance-Verdikt raus". Wedge in unbedienten Automation-Compliance-Markt (n8n/Copilot).
- **BizRisk 4** — DSGVO bis 4 % Umsatz, Art. 30 direkt auditierbar; plus adressiertes Rubber-Stamping-Eigenrisiko (THE-210).
- **Feasibility 3** — Spine verifiziert vorhanden (Connector, IR, Provenance, Write-Path, REQGEN). Neu: Semantik-Lift (bewährtes Muster), Trace-Cypher-Rewrite, Ask/Confirm-UX. Höher als UC-8 (2), weil kein unverifiziertes Fundament.
- **Success 4** — Mechanismus degradiert ehrlich (Rechtsfelder erfragt statt geraten). Spannung: wirkt weniger „magisch" als fakende Wettbewerber.
- **Compliance 5** — erzeugt wörtliches VVT, höchstmögliche Relevanz.
- **Relations 5** — Capstone auf UC-PROV-001/002 + UC-CERT-001 + UC-REQGEN-001 + THE-349 + UC-8; generalisiert auf DORA/NIS2.
- **Urgency 3** — aktiver strategischer Thread, kein fixes Demo-Datum.

## Komplexitätsbewertung (Ousterhout — Pre-Flight-Pflicht)

| Dimension | Rating | Begründung / Mitigation |
|---|---|---|
| Ausweiten v. Änderungen | NIEDRIG–MITTEL | Reuse Spine; `traceTarget` als Daten → neue Regulation ≠ neue Query. Watch: 7 traceTargets koppeln an `ConnectionType`-Enum |
| Kognitive Last | MITTEL | Entwickler braucht: Provenance-Spine, Zwei-Schienen, Trace-DSL, Kritikalität. Gemildert: bekannte Muster (REQGEN/TrustSummary) wiederverwendet, nicht neu erfunden |
| Unbekannte Unbekannte | NIEDRIG (aktiv gesenkt) | Pre-Flight WAR Unknown-Unknown-Reduktion: 3-Agenten-Repo-Verifikation, Schema-Erdung, OJ-Verifikation, Zwei-Schienen-Fund. Residual als known-unknowns geflaggt (n8n-Varianten, Matrix-Semantik, Copilot) |
| Abhängigkeiten | NIEDRIG | Lift = 2. Pass (Connector untouched), Felder additiv, .0 blockt .2/.3 explizit |
| Unklarheiten | NIEDRIG | Self-contained Specs + Verbatim gepinnt + Zwei-Schienen dokumentiert |

**Verdikt:** komplexitäts-arm — weil der Pre-Flight bereits viel Unknown-Unknown-Reduktion geleistet hat. **Einziger Watch-Point:** kognitive Last des Trace-DSL → Mitigation = gut dokumentieren + Beispiele (die 3 strukturierten traceTargets in THE-352 tun das).

## Slices (Bau-Reihenfolge = Nummerierung, risikoärmstes zuerst)

| Linear | REQ | Inhalt | Reuse | Risiko |
|--------|-----|--------|-------|--------|
| THE-358 | .0 | Privacy-by-Design-Adaptergrenze (Datenminimierung, Sanitize vor Persistenz) — **blockt .2/.3** | upload/parser-Pipeline | mittel (Selbstabsicherung gg. Art.-28-Processor-Rolle) |
| THE-352 | .1 | Art.-30-Anforderungssatz als Daten (7 Felder + HART/BEDINGT/WEICH + Trace-Target-Spec) — **Verbatim amtlich verifiziert** | `Regulation`/`ComplianceRequirement` | minimal (reine Daten) |
| THE-353 | .2 | Compliance-Lift-Pass — deterministische GDPR-Semantik (Empfänger/Drittland-Kandidat/Storage), `provenance:'import'` | n8n-Graph, `deriveSourceFromFormat` | mittel (Connector unangetastet) |
| THE-354 | .3 | LLM-Inferenz nicht-extrahierbarer Felder (Zweck/Betroffenenkat./TOM-Adäquanz), `ai_generated`+confidence | `requirementGenerator`-Muster | mittel (Halluzination → Ask-Gating) |
| THE-355 | .4 | Trace-Check-Cypher (single-label/typed-property!) + Kritikalitäts-Gruppierung → Gap-Liste | xray/policy-graph Cypher-Vorlagen | mittel (Multi-DataObject-Bug vermeiden) |
| THE-356 | .5 | Ask-vs-Confirm-Erweiterung der Notar-Queue + Recompute-Loop | `CertificationQueue.tsx`, `certify`-Endpoint | mittel (UX-Erweiterung) |
| THE-357 | .6 | Drei-Listen-Verdikt-View (grün/gelb/rot, provenance-gebunden) | `TrustSummaryWidget`-Muster | klein |

## Scope-Entscheidung (fixiert)

- **Statisch**, nicht Laufzeit (Auftragsverarbeiter-Risiko Art. 28; Laufzeit füllt teure Rechtsfelder ohnehin nicht). 4. Provenance-Stufe `machine-observed` für Runtime-Phase **reserviert**.
- **n8n + DSGVO Art. 30** zuerst. Make = später (gleiche Graph-Form). Copilot Studio = unverifiziert (Power-Automate-Schicht) → erst nach MS-API-Doc-Check.

## Schlüssel-Befund (Repo-Verifikation 2026-06-27)

- Kein Greenfield: ~70 % der Pipeline existiert (Connector, IR, Provenance-Spine THE-320/321/333, REQGEN THE-301).
- **Feld = ArchiMate-Element ⇒ Element-Provenance = Feld-Provenance.** Keine field-level-Erweiterung nötig. Mapping: `import`=extracted, `ai_generated`+confidence=inferred, `certifiedBy`=human-confirmed.
- Reales Graphmodell: single-label `:ArchitectureElement{type}` + `:CONNECTS_TO{type}` — Trace-Cypher anders als der Multi-Label-Pseudocode aus dem Design-Chat.

## Abgrenzung

- THE-349 (UC-2 n8n-Import): struktureller Ingest, andere Höhe → `related`. Wir konsumieren dessen Output.
- THE-345 (UC-8 NIS2-Check): modellweit, NIS2/DORA, kein Workflow/Trace → `related`, Schwester. Art.-30-Trace = spätere Generalisierungs-Basis für UC-8.
- THE-237 (REQ-DATA-009): Art. 5/6/9 PII-Auto-Mapping, element-getrieben — anderer Artikel/Trigger.

## Offene Verifikationspunkte (vor MVP-Zusage)

- LLM-Semantik-Hebung-Qualität (Zweck/Betroffenenkategorie) — Halluzinationsrisiko, deshalb Ask statt Predict.
- „Success"-Spannung (konservativ-ehrlich vs. fakende Wettbewerber).
- Copilot-Studio-Export (Power-Automate-Schicht) vor Adapter-Bau prüfen.
- **NÄCHSTE ENTSCHEIDUNG (offen):** Wie kommt der Gesetzestext (Art. 30) verlässlich gechunkt in The Architect? — EUR-Lex WAF-Problem (vgl. THE-285/OPS-CRAWL-001), Chunk-Granularität lit. a–g.
