# UC-LAW-001 — Regulatory Applicability Check (Vollspezifikation)

**Titel:** „Welche Gesetze gelten für diese Architektur?"
**Created:** 2026-07-11 · **Status:** Implementiert (In Review) — Branch `claude/enterprise-architecture-legal-r3tenn`, Commits `315f7e0` (Feature), `a6c48d2` (Reconciliation), `97c3980` (Spec)
**RVTM:** `docs/superpowers/rvtm/2026-07-11-uc-law-001-rvtm.md`
**Plan/Design:** `docs/superpowers/plans/2026-07-11-uc-law-001-applicability-radar.md`
**Linear:** pending — MCP-Schreibzugriff in der Session gesperrt; dieses Dokument ist 1:1 als Feature-Ticket übernehmbar (Team TheArchitect · Label Feature · State In Review · related THE-309, THE-390)

> ⚠️ **Retro-Spec:** NACH der Implementierung angelegt (Kennung UC-LAW-001 wurde während der
> Umsetzung geprägt; dieses Dokument heilt die fehlende Spec-Ebene).
> **Scoring: pending** — Scoring-Block (BizV/BizR/Feas/Succ/Comp/Rel/Urg) bewusst offen, gehört dem Owner.
> **Modus:** additiv (kein Refactor, keine bestehenden Endpunkte verändert).

---

## 1. Kontext & Problem

Ausgangsfrage (Owner, 2026-07-11): *„Könnte TheArchitect prüfen, auf Basis der Elemente bzw. der
Informationen aus dem AI Wizard, welche Gesetze für diese Art der Unternehmensarchitektur gelten
sollen?"*

Vor UC-LAW-001 existierten alle Bausteine getrennt, aber keine Brücke:

| Baustein | Existierte als | Lücke |
|---|---|---|
| Architektur-Modell inkl. AI-Wizard-Elemente | Neo4j `ArchitectureElement`, Provenienz `source='blueprint'` | wusste nicht, *welche Gesetze* es berührt |
| Regulierungs-Korpus (DSGVO, AI Act, Data Act, NIS2, DORA, LkSG, ISO 27001) | UC-ICM-001 Crawler + UC-NORM-001 Facade | wusste nicht, *für wen* er einschlägig ist |
| Compliance-Pipeline (Mapping → Policies → Roadmap → Tracking) | THE-390 P4b „Add to pipeline" | Einstieg erforderte manuelle Gesetzes-Auswahl |

Der Nutzer musste selbst wissen, welche Gesetze für seine Architektur gelten — genau das Wissen,
das ein EAM-Tool mit Compliance-Anspruch liefern sollte. Der Blueprint-Fragebogen fragt zwar
Regulierungen ab (`regulations[]`), wird aber nicht persistiert; seine dauerhafte Spur sind die
importierten Elemente.

## 2. Größter Mehrwert

1. **Time-to-Compliance-Scope: Minuten statt Tage.** Die Erst-Einschätzung „was ist für uns
   einschlägig?" entsteht heute in Workshops mit Legal/Compliance. Der Check liefert sie
   on-demand aus dem Modell — als Startpunkt, nicht als Ersatz (Disclaimer).
2. **Der AI Wizard bekommt eine Compliance-Konsequenz.** Wizard → Elemente → „diese Gesetze
   gelten wahrscheinlich" → ein Klick in die Pipeline. Schließt die Kette von der ersten
   Architektur-Skizze bis zum Audit-Trail.
3. **Der Korpus wird auffindbar.** Gecrawlte Gesetze lagen bisher passiv im Browse; jetzt werden
   sie aktiv vorgeschlagen, wenn die Architektur Signale zeigt.
4. **Differenzierung:** LeanIX/Ardoq haben Compliance-Kataloge, aber keine element-abgeleitete
   Anwendbarkeits-Einschätzung mit Evidenz. Deterministisch + erklärbar = auditor-tauglich.

## 3. Personas & Stakeholder

| Persona | Interesse am Check |
|---|---|
| **Chief Architect** | Scope früh kennen; Wizard-Ergebnis auf regulatorische Konsequenzen prüfen |
| **Compliance Officer** | Deckungs-Überblick; Einstieg in Mapping/Requirements pro Gesetz |
| **CISO** | NIS2-/ISO-27001-Exposure aus dem Technologie-Bestand |
| **Auditor** (mittelbar) | Nachvollziehbare Evidenz statt Bauchgefühl — warum wurde ein Gesetz (nicht) betrachtet |

## 4. Goal & Erfolgskriterien

**Goal:** Für jedes Projekt jederzeit eine gerankte, evidenz-belegte Einschätzung liefern, welche
Normen der kuratierten Regel-Tabelle auf die modellierte Architektur anwendbar sind — und den
direkten Übergang in die Compliance-Pipeline anbieten.

Messbare Erfolgskriterien:

- **G1:** Report in < 2 s für Modelle bis 500 Elemente (eine Neo4j-Query + eine Mongo-Query).
- **G2:** Jedes Urteil ≠ not_indicated trägt ≥ 1 Evidenz-Eintrag (Element oder Projekt-Feld).
- **G3:** 0 LLM-Kosten, 0 externe Calls — läuft ohne API-Keys, deterministisch reproduzierbar.
- **G4:** Identisches Modell ⇒ identischer Report (bis auf `generatedAt`).
- **G5:** Add-to-pipeline aus dem Panel nutzt den bestehenden THE-390-P4b-Adapter unverändert.

## 5. Scope — Teil-Use-Cases

| # | Teil-UC | Beschreibung | Status |
|---|---|---|---|
| UC1 | **Check on demand** | Panel lädt Report automatisch; Re-Check-Button | ✅ implementiert |
| UC2 | **Evidenz-Drilldown** | Urteil expandieren → Beiträge (Gewicht, Begründung) + Evidenz-Chips (✨ = AI-Wizard-Element), baselineNote | ✅ implementiert |
| UC3 | **Pipeline-Handoff** | „Add to pipeline" pro Gesetz (Korpus-verfügbar & noch nicht drin) | ✅ implementiert |
| UC4 | **Deckungs-Transparenz** | „geprüft gegen N kuratierte Normen — nicht abschließend" + Liste | ⏳ F1 (Folgearbeit) |
| UC5 | **Ungenutzte Signale** | Signal ohne konsumierende Regel → Hinweis auf Gesetze außerhalb des Sets | ⏳ F2 (Folgearbeit) |

## 6. Hauptablauf (UC1–UC3)

1. Architekt öffnet **Compliance → Standards**; das Panel „Which laws apply to this architecture?"
   lädt automatisch (`GET /api/projects/:projectId/norms/applicability`).
2. Server lädt **Fakten**: alle `ArchitectureElement`-Knoten des Projekts aus Neo4j (Name, Typ,
   Beschreibung, `metadata.sensitivity`, Provenienz) + Projekt-Kontext aus Mongo (Name,
   Beschreibung, Vision, Tags, Stakeholder).
3. Server wertet die **12 Signale** aus (§ 8.1) — jedes mit Evidenzliste (gekappt auf 8, ehrlicher
   `matchCount`) und Wizard-Markierung pro Element.
4. Server bewertet die **7 Regeln** (§ 8.2): noisy-OR über die Gewichte der erkannten Signale →
   Score → Verdict; Sortierung Score absteigend, bei Gleichstand bindende Gesetze vor freiwilligen
   Standards.
5. Server reichert mit **Norm-Welt-Zustand** an: bereits referenziert? in der Pipeline? im Korpus
   verfügbar? → `workId` für die Aktion.
6. UI rendert die Urteile: Verdict-Badge (Applies / Likely / Possible), Score-Bar, Meta-Zeile
   (Kind · Jurisdiktion · Bindingness); Footer mit Element-Zählern („X elements analyzed · ✨ Y from
   AI wizard"), Jurisdiktions-Annahme (EU, DE) und permanentem Disclaimer.
7. Architekt expandiert ein Urteil (UC2) und prüft die Evidenz.
8. Architekt klickt **„Add to pipeline"** (UC3) → `POST /norms/:workId/pipeline` → Gesetz läuft ab
   sofort durch Mapping → Policies → Roadmap → Tracking; Panel und Pipeline-Status refreshen.
9. Nach Modell-Änderungen (z. B. neuem Wizard-Import) stößt **Re-Check** die Neubewertung an.

## 7. Alternativabläufe & Randfälle

| # | Fall | Verhalten |
|---|---|---|
| A1 | Leeres Modell (0 Elemente) | Alle Urteile not_indicated; Hinweis „run the AI wizard (Blueprint) or model elements first" |
| A2 | Korpus nicht konfiguriert | Urteile erscheinen trotzdem (Regel-Tabelle ≠ Korpus); Add-to-pipeline nur für bereits referenzierte Gesetze |
| A3 | Gesetz bereits in Pipeline | Status „In pipeline" statt Button |
| A4 | `projectId` keine gültige ObjectId | Elemente-only-Auswertung; Projekt-Kontext & Pipeline-State werden übersprungen statt zu werfen |
| A5 | `metadataJson` defekt | Element ohne Sensitivity weiterverarbeitet (kein Abbruch) |
| A6 | Gate zu (z. B. HR-Kontext ohne AI-Komponente) | Signal bleibt `detected=false`, Evidenz + matchCount bleiben sichtbar — Transparenz statt stillem Verwerfen |
| A7 | API-/Server-Fehler | Error-State „Failed to assess applicability" mit Re-Check-Möglichkeit; Server loggt `[norms.applicability] failed` |
| A8 | ISO 27001 als Upload-Standard vorhanden | Titel-Match (`uploadTitlePatterns`) ⇒ „referenced" statt Doppel-Vorschlag |

## 8. Fachliche Regeln (normativ)

### 8.1 Signale (gesetzes-unabhängig, DATA in `applicability-rules.ts`)

| Signal | Quelle(n) | Besonderheit |
|---|---|---|
| `personal-data` | PII-Patterns auf Element-Name/-Beschreibung (Superset der wfcomp-Keys); Sensitivity `PII` | |
| `pii-classified` | ausschließlich `metadata.sensitivity='PII'` (X-Ray) | stärkste DSGVO-Evidenz |
| `customer-facing` | Actor-/Role-/Stakeholder-Typen × Personen-Patterns | typ-beschränkt |
| `health-data` | Patient/Diagnose/Gesundheits-Patterns, auch Projekt-Text | DSGVO Art. 9, NIS2-Sektor |
| `ai-components` | Typ `ai_agent` ODER AI/ML/LLM-Patterns, auch Projekt-Text | |
| `high-risk-ai-context` | Annex-III-Domänen-Patterns | **gated:** `requiresSignals: [ai-components]` |
| `connected-products` | Typen `device`/`equipment` ODER IoT-Patterns | facility/material bewusst NICHT |
| `cloud-services` | Cloud/SaaS/Datacenter-Patterns | |
| `critical-sector` | NIS2-Annex-I/II-Sektor-Patterns, auch Projekt-Text | |
| `financial-sector` | Bank/Payment/Versicherung/Krypto-Patterns | |
| `supply-chain` | Lieferant/Beschaffung/Fertigung-Patterns | |
| `security-baseline` | Security-Patterns ODER ≥ 3 Technology-Typ-Elemente | `minTypeMatches: 3` |

Auswertungs-Invarianten: Pattern-/Sensitivity-Treffer zählen immer; reine Typ-Treffer erst ab
`minTypeMatches`; ein Element liefert pro Signal max. einen Evidenz-Eintrag; Evidenz gekappt auf 8
bei ehrlichem `matchCount`; Philosophie **bewusst großzügig** (WFCOMP: False Negative gefährlicher).

### 8.2 Regeln (Signal → Norm)

| Regel | Beiträge (Gewicht) | baselineNote (Kurzform) |
|---|---|---|
| `dsgvo` (EU, binding) | personal-data 0.7 · pii-classified 0.75 · customer-facing 0.35 · health-data 0.3 | Rolle (Controller/Processor) bestimmt Pflichten |
| `ai-act` (EU, binding) | ai-components 0.65 · high-risk-ai-context 0.5 | Rolle + Risikoklasse je System |
| `data-act` (EU, binding) | connected-products 0.6 · cloud-services 0.3 | |
| `nis2` (EU, binding) | critical-sector 0.55 · cloud-services 0.25 · security-baseline 0.15 | Größenschwellen + nationale Umsetzung |
| `dora` (EU, binding) | financial-sector 0.7 | Cloud allein triggert NICHT |
| `lksg` (DE, binding) | supply-chain 0.45 | ≥ 1000 MA; sonst mittelbar via Verträge |
| `iso27001` (voluntary) | security-baseline 0.4 · personal-data 0.2 · critical-sector 0.2 | kein Gesetz; Nachweis-Baseline; `uploadTitlePatterns` |

**Scoring:** noisy-OR `score = 1 − Π(1 − wᵢ)` über erkannte Beiträge, gerundet auf 2 Stellen.
**Verdicts:** `applicable` ≥ 0.75 · `likely` ≥ 0.45 · `possible` ≥ 0.2 · sonst `not_indicated`
(eine Stelle: `verdictFromScore`, shared). **Kontrakt:** `corpusSourceIds` müssen in
`NORM_ONTOLOGY.normSources` existieren (test-erzwungen); neue Norm = Datenzeile (+ ggf.
Ontologie-Zeile per E6-Contract), kein Code-Umbau.

## 9. Nicht-Ziele & bewusste Grenzen

- **Keine Rechtsberatung** — permanenter Disclaimer; Schwellenwerte/Rollen als `baselineNote`.
- **Kein LLM im Pfad** — Determinismus ist Feature (Audit, Kosten, Offline). LLM-Verfeinerung wäre
  ein separater, human-confirmed Layer (Muster UC-ICM-002).
- **Blinder Fleck = kuratierte Regel-Tabelle, nicht der Korpus.** Nur die 7 Regeln werden geprüft;
  CRA, ePrivacy, MDR, PSD2, eIDAS, BDSG etc. existieren für den Check nicht — auch wenn sie im
  Korpus lägen (→ F1/F2/F3).
- **Keine Persistenz/Historie** der Reports (on-demand, `generatedAt`).
- **Keine Jurisdiktions-Auswahl** — Annahme EU/DE, im Report ausgewiesen.
- **Keine Nutzer-Abfragen** (Mitarbeiterzahl, Umsatz) zur Schwellenwert-Klärung — v1 bleibt
  modell-getrieben.
- **Sprach-Bias:** Patterns sind DE/EN; anderssprachige Modelle werden schlechter erkannt.

## 10. Anforderungen (REQ-Breakdown)

> Linear-REQs pending (MCP gesperrt) — Nummerierung nach Haus-Schema, Verifikation in der RVTM.

- **REQ-LAW-001.1 — Shared-Kontrakt:** Typen (`ApplicabilityReport/…Assessment/…Signal/…Evidence`,
  Verdict-Union) + `verdictFromScore` in `@thearchitect/shared`; Schwellen 0.75/0.45/0.2. ✅
- **REQ-LAW-001.2 — Regel-/Signal-Daten:** 12 Signale + 7 Regeln als Daten; Registry-Membership
  test-erzwungen; Gewichte ∈ (0,1]; baselineNotes; `minTypeMatches`; `uploadTitlePatterns`. ✅
- **REQ-LAW-001.3 — Service:** `loadProjectFacts` (Neo4j + Mongo, tolerant: A4/A5), pure
  `evaluateSignals`/`assessRules` (Gating, Kappung, noisy-OR, Sortierung), `buildApplicabilityReport`
  mit Norm-Welt-Anreicherung (referenced/inPipeline/availableInCorpus/workId). ✅
- **REQ-LAW-001.4 — API:** `GET /api/projects/:projectId/norms/applicability` (authenticate),
  Envelope `{success, data}`, 500 + Log bei Fehler, vor den `:workId`-Routen registriert. ✅
- **REQ-LAW-001.5 — UI:** Panel in Compliance → Standards über RegulationsPanel; Verdict-Badges,
  Score-Bar, Meta-Zeile, Drilldown mit Gewicht/matchCount/Evidenz-Chips (✨-Wizard), einklappbare
  not_indicated-Gruppe, Add-to-pipeline, Empty-/Error-State, Re-Check, Footer-Zähler + Disclaimer. ✅
- **REQ-LAW-001.6 — Verifikation:** 23 Server-Tests (pure, DB-frei) + 5 Client-Tests grün; TSC
  strict + Builds shared/server/client sauber. ✅
- **REQ-LAW-001.7 (F1) — Deckungs-Transparenz:** Disclaimer + UI „geprüft gegen N kuratierte
  Normen — nicht abschließend" + Liste der geprüften Normen. ⏳
- **REQ-LAW-001.8 (F2) — Ungenutzte Signale:** erkanntes Signal ohne konsumierende Regel ⇒ Hinweis
  auf mögliche Gesetze außerhalb des Sets. ⏳
- **REQ-LAW-001.9 (F3) — Regel-Erweiterung:** CRA, ePrivacy, MDR, PSD2, eIDAS, BDSG … als
  Datenzeilen inkl. Signal-Ergänzungen. ⏳
- **REQ-LAW-001.10 (F4) — Radar-Promotion:** Signal-Kind `applicability` + Baseline-Scope für den
  Impact-Matcher. ⏳ **blocked by THE-309**

## 11. Architektur-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Deterministisch statt LLM | Audit-Fähigkeit, Reproduzierbarkeit (G4), 0 Kosten (G3), Offline-Betrieb; Vorbild WFCOMP-Lift |
| Regeln/Signale als DATA | THE-413/ADR-0004-E6-Geist: neue Norm = Zeile, kein Enum/Code-Edit; test-erzwungener Ontologie-Kontrakt |
| noisy-OR statt Summe/Max | unabhängige Evidenz verstärkt sich, überstimmt nie; Gewichte bleiben einzeln interpretierbar |
| Gating (`requiresSignals`) mit sichtbarer Evidenz | verhindert AI-Act-Fehlalarm durch bloße HR-Prozesse, ohne Kontext-Funde zu verstecken (A6) |
| Pure Auswertung / dünne IO-Schicht | DB-freie Tests; Neo4j/Mongo nur in `loadProjectFacts`/`loadNormWorldState` |
| Evidenz-Kappung (8) + matchCount | Payload-Disziplin ohne Ehrlichkeitsverlust |
| Familien-Regeln über Sprach-Splits | `ai-act-de`/`-en` = eine Regel `ai-act`; Präferenz referenziert > verfügbar |

## 12. Abhängigkeiten

| Abhängigkeit | Nutzung |
|---|---|
| UC-ICM-001 (THE-272) Korpus | Quelle für Add-to-pipeline-Verfügbarkeit |
| UC-NORM-001 (THE-390) Facade + P4b-Adapter | `listNorms`/`listAvailableCorpusNorms`; Pipeline-Einstieg |
| THE-429/THE-413 Norm-Ontologie (ADR-0004 E6) | `normSources`-Registry als Kontrakt der `corpusSourceIds` |
| Blueprint/AI Wizard | Element-Provenienz `source='blueprint'` → ✨-Evidenz + Zähler |
| X-Ray Sensitivity (Sprint 2 Track B) | `metadata.sensitivity='PII'` als stärkste DSGVO-Evidenz |

## 13. Abgrenzung

- **UC-RADAR-001 (THE-309, Backlog):** UC-LAW-001 = statische Vorstufe („was gilt jetzt?") des
  temporalen Radars („was ändert sich?"). Kein Overlap; Promotion-Pfad in
  `docs/superpowers/2026-07-11-uc-law-001-radar-reconciliation.md`. Produkt-Begriff „Radar" bleibt
  für THE-309 reserviert; UI-Name hier: „Which laws apply to this architecture?".
- **THE-390 P3 „Applicability":** dort Norm-interne Geltung (Reach/Derogation/Bitemporalität) —
  eine andere Frage als Architektur-Anwendbarkeit.

## 14. Risiko-Register

| Risiko | Mitigation | Owner |
|---|---|---|
| Falsch-Vollständigkeits-Eindruck („nur DSGVO gilt") | F1 Deckungs-Transparenz; Disclaimer heute schon „not legal advice" | Product |
| Pattern-Over-Triggering (Alert-Fatigue) | Evidenz sichtbar ⇒ falsifizierbar; Gewichte/Verdicts konservativ gestuft; Gating | Engineering |
| Pattern-Under-Triggering (Lücke) | Großzügigkeits-Philosophie; F2 macht konsumlose Signale sichtbar | Engineering |
| Regel-Tabelle veraltet (Gesetzeslage) | Quartals-Review der Daten-Datei; langfristig RADAR-UC1 (Crawl) | Legal/Product |
| Sprach-Bias DE/EN | dokumentiert (§ 9); Erweiterung = Pattern-Zeilen | Engineering |
| Begriffs-Kollision mit THE-309 „Radar" | Naming-Klärung in Reconciliation-Doc + § 13 | Product |

## 15. Out-of-Scope (V2/V3 — separat zu promoten)

- LLM-gestützte Verfeinerung/Begründung (human-confirmed, Muster UC-ICM-002)
- Jurisdiktions-/Firmenprofil-Abfragen (Mitarbeiterzahl, Umsatz, Sitz) zur Schwellenwert-Klärung
- Report-Historie/Trending („seit Import X ist AI Act dazugekommen") → gehört zum Radar (F4)
- Automatische Pipeline-Übernahme ohne Nutzer-Klick
- Nicht-EU-Jurisdiktionen (US/CCPA, UK, CH-spezifisch) — erst mit F3-Erweiterung sinnvoll

## 16. Verifikation & Abnahme

Traceability vollständig in der **RVTM** (`docs/superpowers/rvtm/2026-07-11-uc-law-001-rvtm.md`):
28 automatisierte Tests (23 Server pure + 5 Client) — alle grün; TSC strict + Builds sauber.
**Offen:** E2E-Demo gegen laufende Neo4j/Mongo (Sandbox ohne DBs — auf VPS nachholen), Linear-Ticket
+ Scoring, PR/Merge.

## Sign-off

| Rolle | Abnahme | Datum |
|---|---|---|
| Product/Owner | Scoring vergeben, Retro-Spec akzeptiert oder korrigiert | — |
| Engineering | RVTM-Status Passing bestätigt; E2E-Demo auf VPS | — |
| Compliance | Regel-Gewichte + baselineNotes fachlich plausibilisiert | — |
