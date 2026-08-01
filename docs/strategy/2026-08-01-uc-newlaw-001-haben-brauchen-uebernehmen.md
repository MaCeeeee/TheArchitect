# UC-NEWLAW-001 — Haben · Brauchen · Übernehmen

**Datum:** 2026-08-01
**Abgleich dreier Quellen:** TheArchitect (Stand heute, nach PR #111 + Folge-Commits) ↔ n8n-Workflow *„Cognitive Compliance Engine (FIXED LOOP)"* (Export vom 2026-08-01) ↔ sieben arXiv-Papers.
**Zweck:** Arbeitsgrundlage für die **Kriterien-Vereinbarung** (Scorecard-Dimension 1) und die Reihenfolge danach. Dieses Dokument ist der Vorschlag — **vereinbart ist erst, was Alex/ein Nutzer abgenommen hat.**

> **Die eine Erkenntnis:** Der Workflow ist die **hintere Hälfte** des Use Case (Pflicht → testbares Ticket → Feedback), TheArchitect die **vordere** (Gesetz → gemessene Pflichten → Bericht). Der Workflow hat keinen Bericht und keine einzige Messung; wir haben keine Tore hinter dem Bericht und keine Rückkopplung. Zusammen sind sie die Kette aus dem Use-Case-Satz: *„innerhalb eines Tages: betroffen? Pflichten? erfüllt? Lücken?"* — plus das, was danach kommt.

---

## 1. Die Referenzkette

Der Workflow liefert das Phasen-Rückgrat. Je Phase: was er vorsieht, was wir haben, Verdikt.

| # | Phase | Workflow | TheArchitect heute | Verdikt |
|---|---|---|---|---|
| 0 | Eingang + Volltext | `manualTrigger` + hartkodierter Text | Crawler, Korpus **1640 §§ / 13 Rechtsakte**, versionsverankert (`versionHash`), ganze Gesetze | ✅ **wir, besser** |
| 1 | Strategische Triage | Agent 1 + **Gate PROCEED/DISCARD**, Märkte, Produktlinien, `compliance_urgency_days` | Betroffenheits-Ableitung aus dem Architekturmodell (Bericht §1), Scope-Priorisierung (`provisionKinds`) — aber **kein DISCARD-Tor, keine Dringlichkeit** | 🟡 **Tor übernehmen** |
| 2 | Pflichten-Extraktion | Agent 2 „Jurist", Deontik-Klassen | REQGEN (Done) mit Konfidenz + Rationale je Pflicht; Verbots-Kette gemessen (THE-543) — aber **kein Klausel-Filter** vor der Extraktion | 🟡 **Filter fehlt** |
| 3 | Technischer Kontext | **Mock**-RAG (Pinecone simuliert, `rag_verified` dekorativ) | Echtes RAG: Qdrant + HyDE (**+56 pp Recall**), Kandidaten-Mapping gegen die Landschaft | ✅ **wir, echt statt Mock** |
| 3.5 | Harmonisierung | Agent 3.5: MERGE/UPDATE/CREATE + **Strenge-Regel** — *im Export nie verbunden, nie gelaufen* | Katalog 26 kanonische Handlungen (E6 1.8.0), Stufen A/B/C, Kontrollversuch (P 15/15 ×3 · K 0/60 ×3) | 🟡 **beidseitig ergänzen** |
| 3b | PMT-Zerlegung | Agent 3: PROCESS/METHOD/TOOL je Requirement, Akzeptanzkriterium, „nicht Testbares → Prozess-Ticket" | REQ-REQHARM-001.7 spezifiziert, **ungebaut**; REQPROJ-Andockpunkt (THE-315) existiert | ⛔ **übernehmen** |
| 4a | WSJF-Priorisierung | Agent 4 je Requirement, Sprint/PI-Zuweisung | WSJF als **Prozess** etabliert (8 Kriterien); im Produkt je Pflicht: nein | 🟡 später |
| 4b | Testbarkeits-Tor | Agent 5 **PASS/FAIL** (Software → Gherkin, Prozess → Nachweis-Artefakt) + Refiner-Schleife | **fehlt** | ⛔ **übernehmen** |
| 5 | Dispatch + Traceability | Agent 6: **Traceability-Fußzeile in jedem Ticket** (Origin, Obligation, Agent-Kette), Jira-Export | Provenance vollständig **in der DB** (`modelId`, `promptVersion`, `ontologyVersion`, `versionHash`) — aber nicht **am Artefakt**; kein Export | 🟡 **Fußzeile übernehmen** |
| 6 | **Bericht** | — **fehlt im Workflow** (er springt direkt zu Jira) | 5-Abschnitte-Bericht, heute gefüllt (22 Maßnahmen, 6 gesetzesübergreifend, Herkunft + Grenzen) | ✅ **nur wir** |
| 7 | Feedback-Schleife | Webhook + Agent 7: Ablehnungs-Klassifikation (`SYSTEM_ERROR` / `IMPOSSIBLE_CONSTRAINT` / `CLARIFICATION_NEEDED`) → **Prompt-Verbesserungs-Vorschlag** | **fehlt** — Scorecard-Dimension 7 = 1 | ⛔ **übernehmen** |

---

## 2. Was wir HABEN (Inventar, mit Zahlen)

Das ist zugleich das, was dem Workflow vollständig fehlt: **Messung.** Er hat Tore, aber keinen Beleg, dass die Tore richtig entscheiden.

| Baustein | Beleg |
|---|---|
| Versionierter Korpus | 1640 §§, 13 Rechtsakte, `versionHash`-Anker, Regel „ganze Gesetze" |
| Typisierung (5 Achsen) | 1640 §§ gelabelt; `partyRole` macro-F1 **0,883**; Stale-Regel + Konsum-Hausregel |
| Retrieval | HyDE **+56 pp Recall**, Qdrant, Judge verlustfrei |
| REQGEN | Done, je Pflicht Konfidenz + Rationale; Verbots-Verhalten gemessen (kein Blindfleck, aber Umformulierung — THE-543) |
| Maßnahmen-Katalog | 26 kanonische Handlungen, **aus dem Korpus abgeleitet** (nicht ISO/NIST); out-of-sample (AI Act): 168/176 zuordenbar, „keine"-Quote 4,5 % |
| Kontroll-Disziplin | Drei-Häuser-Richter, geblendete Prompts, Positiv-/Negativ-Kontrolle als Vorbedingung, eingefrorener Prüfsatz `actions.v1` (120 Fälle) |
| Slot-Zerlegung | ⟨Handlung · **Empfänger** · Modalität · Bedingung⟩; Empfänger 100 % bei Meldepflichten; Adressat aus Typisierung 100 % |
| Mechanische Relationen | INTERPRETS parser-first, 16/16 in Prod, 0 Fehlalarme — von ComplianceNLP unabhängig bestätigt (*strukturell > Embedding, +16,8 F1*) |
| Bericht | 5 Abschnitte, gefüllt, mit „was wir NICHT behaupten" |
| Selbstbild | Scorecard **13/24**, dokumentiert mit Ableitung |

## 3. Was wir ÜBERNEHMEN

### 3.1 Aus dem Workflow — sieben Elemente, je mit Landeplatz

| # | Element | Landeplatz | Bedingung aus unserer Disziplin |
|---|---|---|---|
| Ü1 | **Triage-Tor** PROCEED/DISCARD mit Dringlichkeit (`compliance_urgency_days`) und betroffenen Bereichen | neues REQ vor REQGEN; nutzt Scope-Provisions + Architekturmodell | kleines Golden-Set aus je 5 klaren PROCEED/DISCARD-Fällen; **falscher DISCARD ist die gefährliche Richtung** (verpasstes Gesetz) → Asymmetrie im Kriterium K1 |
| Ü2 | **Testbarkeits-Tor** PASS/FAIL: Software → Gherkin formulierbar, Prozess → Nachweis-Artefakt benennbar; bei FAIL → Refiner-Schleife | nach REQGEN, vor Bericht/Dispatch | PASS/FAIL-Golden (20 Fälle); Refiner max. 1 Runde, dann Mensch |
| Ü3 | **Feedback-Klassifikation** (3 Klassen) mit Prompt-Verbesserungs-**Vorschlag** | Ablehnungs-Erfassung am Requirement → Klassifikator → Eintrag ins Golden-Set | Vorschlag wird nie automatisch übernommen (Asilomar #16); jede Ablehnung wird Golden-Fall (ComplianceNLP-Muster: *production failures flow back*) |
| Ü4 | **Traceability-Fußzeile am Artefakt** (Origin-ID, Norm-Stelle, Obligation, Kette, Versionen) | Bericht §5 je Pflicht + späterer Export | Daten existieren vollständig — nur rendern |
| Ü5 | **PMT-Zerlegung** je Requirement + die Regel *„nicht Testbares → Prozess-Ticket"* (GRC-Serientermin-Beispiel wörtlich gut) | REQ-REQHARM-001.7 | Layer-Zuweisung gegen `realizes`-Andockpunkt (THE-315) |
| Ü6 | **MERGE/UPDATE/CREATE + Strenge-Regel** (*„Text nicht ändern, wenn nicht strenger"*) | THE-541 (Delta-Regel) + Konfidenzstufen: A → MERGE-Vorschlag vorausgewählt | Strenge-Vergleich ist ein neues Urteil → braucht eigene Kontrolle, bevor er entscheidet |
| Ü7 | **Case-File + Audit-Log-Rückgrat** (eine Akte je Gesetzes-Ereignis, Eintrag je Phase) | an bestehende contextTrace (THE-384) anlehnen | — |

### 3.2 Aus den Papers — auf unsere Lücken abgebildet

| Paper | Was übernehmen | Wo | Aufwand |
|---|---|---|---|
| **Reg2Req** (2607.04448) | (a) **Klausel-Filter** vor der Extraktion (dort F1 0,82/0,78) — bei uns fast frei über `provisionKinds`; (b) **Klartext-Erklärung je Pflicht sichtbar machen** (dort Clarity 4,92/5; `extractionRationale` existiert, wird nur nicht gezeigt); (c) **Judge-Validierung gegen Menschen** (ρ 0,77–0,85) — *haben wir nie getan*; (d) Nutzerstudien-Format (n=25, Verständnis/Vertrauen) als Vorlage fürs Alex-Gespräch | Pipeline vor REQGEN; Bericht §2; Eval-Vorbedingung | klein / klein / mittel / Gespräch |
| **Rice_LRT** (2502.04916) | **Few-Shot-Beispiele in die drei Prompts** (`SLOT_SYSTEM`, `CLASSIFY_SYSTEM`, `PAIR_JUDGE_SYSTEM`) — Rice-Gerüst hat Rolle · Anleitung · Kontext · Constraints · **Beispiele**; uns fehlt der fünfte Baustein komplett. Dort: 84 % vs. 15 % | shared/obligations/prompt.ts, **gemessen** gegen die eingefrorenen Sets | klein — **billigster Hebel** |
| **ComplianceNLP** (2604.23585) | (a) **Zeit pro Regulierungs-Update** als Kennzahl (dort 47→15 min); (b) Produktions-Fehler → Golden-Set als stehende Schleife | Kriterium K5; Feedback-Pfad Ü3 | Messung / mit Ü3 |
| **SecMapping** (2506.11051) | **Zweite Katalog-Ebene**: je Maßnahme 3–5 Operationen (dort 99 → 424). Löst den gemessenen Schwachpunkt `vorfall-melden-behoerde` (9/26) — Früh-/Zwischen-/Abschlussmeldung als Operationen unter einer Maßnahme | `canonicalActions` 1.9.0, additiv | mittel |
| **ASSERT** (2607.08292) | Bestätigung, keine Änderung: „keine passende Handlung" als Erstklasse-Antwort + Trennung probabilistische Extraktion / deterministische Prüfung — **haben wir beides** | — | — |

### 3.3 Ausdrücklich NICHT (mit Grund)

- **Conductor / Trinity** (Orchestrierungs-RL): optimieren Denkleistung von Ensembles. Unser Engpass ist nie als Modell-Leistung gemessen worden — Anwendung wäre Optimierung einer unvermessenen Komponente. **Parken.**
- **OSCAL-Export** (SecMapping): richtig für später, kein Kunde verlangt es heute. **Parken.**
- **Sprint-/PI-Zuweisung** (Agent 4): Portfolio-Automatik ohne Portfolio-Nutzer. **Parken.**
- **Workflow-Mocks** (Pinecone, Jira-Endpunkt mit Platzhalter-Token): werden nicht übernommen — wir haben die echten Gegenstücke.

## 4. Was wir BRAUCHEN (hat keine der drei Quellen fertig)

1. **Vereinbarte Erfolgskriterien** — §5 ist der Vorschlag; die *Vereinbarung* mit Alex/einem Nutzer ist der eigentliche Akt (Scorecard Dim. 1: „agreed across … the people who actually use it").
2. **Judge-Validierung gegen Menschen** — Vorbedingung, bevor irgendein K-Kriterium per LLM-Richter gemessen wird. ≥ 30 Fälle doppelt geurteilt, Ziel ρ ≥ 0,7 (Reg2Req: 0,77–0,85). **Nie getan.**
3. **Feedback-Erfassungsfläche** — minimal: Ablehnen + Pflicht-Kommentar am Requirement. Ohne sie bleibt Ü3 Theorie und Dim. 7 bei 1.
4. **A/B-Gestell auf den eingefrorenen Sets** (Dim. 6) — nötig, um den Few-Shot-Hebel ehrlich zu messen statt zu glauben; heute Handarbeit.
5. **Trockenlauf-Protokoll** — ein frisches Gesetz (Kandidat: **CRA** oder **MDR**, beide im Quellen-Register, nie durch REQGEN), volle Kette, Uhr läuft, gemessen gegen §5. *Erst nach* Vereinbarung der Kriterien — sonst Demo statt Test.

## 5. Erfolgskriterien-Vorschlag (menschlich verankert)

Nach dem Muster der Papers: **Menschen-Zustimmung und Menschen-Zeit, nicht F1.** Interne F1/κ-Tore bleiben als Ingenieurs-Tore bestehen — sie sind Voraussetzung, nicht Erfolg.

**Vorbedingung für alle K mit LLM-Richter:** Judge-Validierung (Punkt 4.2) bestanden.

| K | Tor | Kriterium | Anker |
|---|---|---|---|
| **K0** | Gesamtdurchlauf | Frisches Gesetz → Bericht in **≤ 1 Arbeitstag**, ohne Handeingriff außer den definierten Toren | UC-NEWLAW-Satz |
| **K1** | Triage (Ü1) | Auf ≥ 10 Rechtsakten: **0 falsche DISCARDs** (asymmetrisch — verpasstes Gesetz ist der gefährliche Fehler); PROCEED-Übereinstimmung mit Fachurteil ≥ 8/10 | Reg2Req-Klauselfilter-Logik |
| **K2** | Pflichten | Fachlicher Prüfer bewertet Vollständigkeit ≥ 4/5 auf 20er-Stichprobe | Reg2Req 4,45–4,60 |
| **K3** | Verständlichkeit | Jede Pflicht trägt Klartext-Erklärung; Bewertung ≥ 4,5/5 | Reg2Req 4,92 |
| **K4** | Zuordnung | Prüfer muss ≤ **15 %** der Zuordnungen korrigieren | Rice_LRT 9,5 % als Nordstern |
| **K5** | Zeit | Minuten pro Regulierungs-Update gemessen; erste Messung = Baseline, kein Pass/Fail | ComplianceNLP 47→15 |
| **K6** | Tickets (nach Ü2/Ü5) | Ablehnungsquote < 20 %; **jede** Ablehnung klassifiziert und als Golden-Fall erfasst | Workflow Agent 7 + ComplianceNLP |

## 6. Reihenfolge

1. **Dieses Dokument an Alex** → Kriterien vereinbaren (ggf. Zahlen ändern — das ist erwünscht, genau das ist die Vereinbarung). *Dim. 1: 2→3.*
2. **Judge-Validierung** (4.2) — Vorbedingung für alles Weitere mit Richter.
3. **Hebel-Paket klein**, jeweils gegen eingefrorene Sets gemessen: Few-Shot-Beispiele (Rice) · Klausel-Filter (Reg2Req a) · Erklärungen in den Bericht (Reg2Req b). Dafür minimales A/B-Gestell (4.4). *Dim. 6: 1→2.*
4. **Zwei Tore nachbauen** (Ü1 Triage, Ü2 Testbarkeit) mit ihren kleinen Golden-Sets.
5. **Trockenlauf** CRA oder MDR gegen K0–K5, mit Uhr.
6. **Feedback-Fläche + Ü3** nach dem ersten echten Nutzerkontakt. *Dim. 7: 1→2.*

## 7. Reparaturen am n8n-Workflow (falls er wieder laufen soll)

1. **`Agent 5: QA Tester` prüft immer Index 0** — er referenziert `pmt_requirements[0]` und `prioritized_requirements[0]` statt des aktuellen Loop-Items. In der Schleife wird jedes Mal dasselbe erste Requirement geprüft.
2. **`Agent 3.5: Req Harmonization` hängt in der Luft** — keine Verbindungen; sein Prompt erwartet `summary`/`similar_requirements_from_db`, die User-Nachricht liefert `artifacts.legal`. Der Knoten ist nie gelaufen.
3. Mocks als solche kennzeichnen oder gegen die echten TheArchitect-Endpunkte tauschen (RAG, Jira-Platzhalter-Token).

---

**Verwandt:** [`2026-07-31-uc-newlaw-001-use-case-definition.md`](2026-07-31-uc-newlaw-001-use-case-definition.md) · [`2026-08-01-agent-evaluation-scorecard.md`](2026-08-01-agent-evaluation-scorecard.md) · `docs/evals/action-release-gates.md` · THE-438 / THE-540 / THE-541 / THE-543
