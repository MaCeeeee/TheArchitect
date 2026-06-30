# Conformance — drei Tore, ein Modell

**Datum:** 2026-06-28
**Status:** Entschieden 2026-06-30 → siehe **ADR-0003** (`docs/adr/0003-conformance-information-architecture.md`). Diese Landkarte bleibt die Analyse-Grundlage; die getroffene IA-Entscheidung steht in der ADR.
**Auslöser:** Mit der neuen „Assess Workflow"-Seite (UC-WFCOMP-001) existiert ein **drittes** Konformitäts-Tor. Im UI liegen alle drei unter „Comply" und heißen alle sinngemäß „assess/check compliance" → niemand (Nutzer *und* Team) kann sie noch auseinanderhalten.
**Verwandt:** [[strategy_complexity_comprehension_ux]] (Hebel: Struktur sichtbar machen), [[strategy_trust_spine]] (ATTEST = Vertrauens-Achse), UC-WFCOMP-001, UC-GOV-001 (Policy-as-Data), Compliance-Pipeline/Matrix.

> **Diese Doku trifft keine Entscheidung. Sie schafft die gemeinsame Landkarte, auf der wir die IA-Entscheidung dann fällen.**

---

## 1. Das Problem

Drei Funktionen prüfen „Compliance", sind aber **drei verschiedene Dinge**:

1. **Requirements → Architektur** (bestehend): Standards-Pipeline / Matrix.
2. **Architektur → Policy** (bestehend): Architektur ins Neo4j laden, gegen Policies testen (PolicyBoard / Governance).
3. **Workflow → Regulation** (NEU): Workflow rein, gegen die Pflichtfelder eines Gesetzes (DSGVO Art. 30) prüfen.

Sie sind **kein Doppelbau** — sie beantworten echte, verschiedene Fragen. Aber das UI macht die Unterschiede unsichtbar. Ergebnis: kognitive Überlast, „App zu komplex".

---

## 2. Das vereinheitlichende Modell

> **Jedes Tor fragt dasselbe: Erfüllt ein `SUBJECT` eine `NORM`? → Wo sind die Lücken?**
> Sie unterscheiden sich nur in **zwei Achsen**:

- **Achse 1 — Subjekt** (*was* wird bewertet): das **Modell** (Tor 1+2) vs. ein **importiertes Artefakt** (Tor 3).
- **Achse 2 — Richtung** (*wie* gegen die Norm): Norm **finden** · Norm **durchsetzen** · Norm **bezeugen**.

Drei klar getrennte **Verben** statt dreimal „assess":

| | **COVER** | **ENFORCE** | **ATTEST** |
|---|---|---|---|
| **Pfad** | Requirements → Architektur | Architektur → Policy | Workflow → Regulation |
| **Subjekt** | Dein EA-Modell | Dein EA-Graph (Neo4j) | Importierter Workflow (n8n) — **nicht** das Modell |
| **Norm** | Externer Standard (TOGAF/ISO/Reg) | Interne Policies (rules-as-data) | Pflichtfelder eines Gesetzes (Art. 30) |
| **Frage** | „Was deckt meine Architektur ab?" | „Wo bricht sie meine Regeln?" | „Ist der Nachweis vollständig? Wer unterschreibt?" |
| **Polarität** | positiv: was ist erfüllt | negativ: was ist verletzt | Vollständigkeit + Provenance |
| **Output** | Coverage-Matrix → Remediation | Violation-Heatmap (PolicyBoard) | Drei-Listen-Verdikt + Sign-off |
| **Heute im UI** | Comply › Standards · Matrix | Comply › Governance · Policy | Comply › Workflow Compliance |

---

## 3. Die echte Naht (warum Tor 3 sich „fremd" anfühlt)

**Tor 1 & 2 bewerten dein Modell. Tor 3 bewertet ein importiertes Artefakt — einen anderen Gegenstandstyp.**

Das ist der härteste Unterscheider und gleichzeitig die Quelle der Verwirrung:
- Tor 1+2 operieren auf dem, was der Architekt *selbst modelliert* hat (Elemente, Graph).
- Tor 3 nimmt etwas *von außen* (eine Automatisierung), liftet es in einen eigenen Compliance-Graph (`source:'wfcomp'`) und beurteilt es. Der Architekt hat dieses Subjekt nicht gebaut — er *zertifiziert* es.

Zweiter Unterscheider — **nur Tor 3 hat eine Vertrauens-/Provenance-Dimension**: „die Maschine kann X sicher sagen, hier muss ein Mensch unterschreiben" (`provenance:'user'`). Das ist die Trust-Spine-These und existiert in Tor 1+2 nicht.

---

## 4. Woher die Verwirrung kommt (IA-Diagnose)

1. **Gleiches Wort, andere Bedeutung.** „Assess / Check / Compliance" überall → semantische Trennung unsichtbar.
2. **Subjekt unsichtbar in der Navigation.** Modell vs. Artefakt steht nirgends; alle drei sehen wie Geschwister aus.
3. **Drei verschiedene Ergebnis-UIs** (Matrix / Heatmap / Drei-Listen) ohne gemeinsame Klammer.

**Fazit: reines Vokabular- + Platzierungs-Problem, kein Funktions-Problem.**

---

## 5. Empfehlung (zur Entscheidung, nicht beschlossen)

Eine gemeinsame Klammer **„Conformance"**, die die zwei Achsen in Sprache + IA spiegelt:

- **Oberkategorie nach Subjekt trennen:**
  - **Architecture Conformance** → COVER + ENFORCE (operieren auf dem Modell)
  - **Workflow Conformance** → ATTEST (operiert auf importierten Artefakten)
- **Drei distinkte Verben** statt dreimal „assess": *Cover · Enforce · Attest*.
- Jede Ansicht macht **Subjekt und Norm explizit** im Kopf („Subject: your model · Norm: ISO 27001").

Die Subjekt-Trennung wurde mit der Gruppe „Workflow Compliance" bereits instinktiv begonnen — sie gehört sauber durchdekliniert, **nicht** als vierter Reiter drangehängt.

**Begründung über bestehende Strategie:**
- `strategy_complexity_comprehension_ux`: Hebel „Struktur/Automation sichtbar machen" statt verstecken — exakt dieser Fall.
- `strategy_trust_spine`: ATTEST ist die Vertrauens-Achse; sie sichtbar von COVER/ENFORCE zu trennen schärft das USP statt es zu verwässern.

---

## 6. Offene Fragen (für die IA-Entscheidung)

1. **Granularität der Oberkategorie:** Eine „Conformance"-Sektion mit zwei Subjekt-Unterbereichen — oder bleiben „Comply" (Modell) und ein neues „Workflows" getrennt?
2. **Einstieg:** Braucht es einen „Conformance Hub" („Was willst du prüfen? Modell gegen Standard · Modell gegen Policy · Workflow gegen Gesetz") als Router?
3. **Verben im UI verbindlich?** Cover/Enforce/Attest als feste Labels — oder nur intern als Denkmodell, UI bleibt bei sprechenden Namen?
4. **Wo lebt ATTEST künftig?** Aktuell unter Comply › Workflow Compliance (Übergangslösung). Nach Subjekt-Logik evtl. eigener Top-Level-Bereich „Workflows".
5. **Konvergenz später:** Wird ein Workflow irgendwann selbst zu einem EA-Element (dann verschmelzen die Subjekte)? Falls ja, beeinflusst das die Trennung.

---

## 7. Nicht-Ziele

- Keine Zusammenlegung der drei *Funktionen* — sie sind bewusst verschieden.
- Kein Refactor der bestehenden Pipeline/Governance in diesem Schritt — erst Sprache + Platzierung.
