# ADR-0003: Conformance-Informationsarchitektur — eine Sektion, nach Subjekt getrennt

- **Status:** Accepted — Oberfläche verlagert durch ADR-0005 (2026-07-15)
- **Datum:** 2026-06-30
- **Entscheider:** Matthias Ganzmann (Enterprise Architect)
- **Addendum (2026-07-15, ADR-0005):** Die hier entschiedene Struktur bleibt gültig, wandert aber in die räumliche Journey: Der **Conformance Hub** wird ein **Sheet** (Einstieg/Scoping, Subjekt×Norm), die **World** ergänzt den Ergebnis-Layer (wo die Gaps sind), ein **Matrix-Sheet** hält das Detail. Ein einziger Hub, erreichbar aus den Phasen E/G/H. „Conformance" ist damit kein Top-Level-Nav mehr, sondern lebt in den Stationen.
- **Baut auf:** `docs/strategy/2026-06-28-conformance-three-gates.md` (die Landkarte) · [[strategy_conformance_three_gates]] · [[strategy_complexity_comprehension_ux]] · [[strategy_trust_spine]]

## Kontext

Mit der „Assess Workflow"-Seite (UC-WFCOMP-001) existiert ein **drittes** Konformitäts-Tor. Alle drei lagen unter „Comply" und hießen sinngemäß „assess/check compliance" → weder Nutzer noch Team konnten sie auseinanderhalten („App zu komplex"). Das Strategy-Doc hat das vereinheitlichende Modell geliefert — **jedes Tor fragt: erfüllt ein `SUBJECT` eine `NORM`? → wo sind die Lücken?** — und es auf zwei Achsen reduziert:

- **Subjekt** (*was* wird bewertet): das **Modell** vs. ein **importiertes Artefakt**.
- **Richtung** (*wie* gegen die Norm): Norm **finden** (COVER) · **durchsetzen** (ENFORCE) · **bezeugen** (ATTEST).

|  | COVER | ENFORCE | ATTEST |
|---|---|---|---|
| Pfad | Requirements → Architektur | Architektur → Policy | Workflow → Regulation |
| Subjekt | EA-Modell | EA-Graph (Neo4j) | Importierter Workflow (n8n) |
| Norm | Externer Standard | Interne Policies | Pflichtfelder eines Gesetzes |

Das Doc ließ fünf IA-Fragen offen. Diese ADR entscheidet sie.

## Entscheidung

**Q1 + Q4 — Struktur:** Eine gemeinsame **„Conformance"-Sektion**, getrennt nach **Subjekt**:
- **Architecture Conformance** → COVER + ENFORCE (operieren auf dem Modell)
- **Workflow Conformance** → ATTEST (operiert auf importierten Artefakten)

ATTEST lebt damit unter „Workflow Conformance" — **nicht** als loser vierter Reiter unter „Comply", **nicht** als komplett entkoppelter Top-Level. Die Klammer macht die Verwandtschaft sichtbar, die Subjekt-Trennung die echte Naht.

**Q2 — Einstieg:** Ein schlanker **Conformance Hub** als Router — fragt in Alltagssprache „Was willst du prüfen? (Modell gegen Standard · Modell gegen Policy · Workflow gegen Gesetz)". Progressive Disclosure statt drei gleich aussehender „assess"-Reiter.

**Q3 — Vokabular:** Cover/Enforce/Attest bleiben **internes Denkmodell**; die UI nutzt **sprechende englische Namen** (Verb höchstens als Untertitel/Badge). Plain language vor Konsistenz-Jargon.

**Q5 — Konvergenz:** Subjekte werden **separierbar** gehalten. Wenn ein Workflow später selbst zum EA-Element wird, verschmelzen die Subjekte — die Trennung wird so gebaut, dass das möglich bleibt, ohne jetzt darauf zu optimieren. Keine Akut-Entscheidung.

## Betrachtete Optionen (Q1)

| | Option | Bewertung |
|---|---|---|
| A | Eine **„Conformance"-Sektion**, nach Subjekt getrennt | **gewählt** — Verwandtschaft + Naht beide sichtbar; spiegelt Subjekt×Norm-Modell in der IA |
| B | „Comply" (Modell) bleibt, „Workflows" als eigener Top-Level | verworfen: stärkere Trennung, aber die gemeinsame Klammer („alles fragt Subject vs. Norm") geht verloren |
| C | Status quo unter „Comply", nur umbenennen | verworfen: minimal-invasiv, aber der Subjekt-Unterschied (Modell vs. Artefakt) bleibt unsichtbar — löst das Kernproblem nicht |

## Konsequenzen

**Positiv**
- Der Subjekt-Unterschied wird zum ersten Mal in der Navigation sichtbar → adressiert direkt das „App überfordert"-Feedback ([[feedback_ux_simplicity]]).
- ATTEST als Vertrauens-Achse ([[strategy_trust_spine]]) wird sichtbar von COVER/ENFORCE getrennt → schärft das USP statt es zu verwässern.
- Der Hub gibt Neu-Nutzern eine Orientierungs-Eingangstür ohne Funktions-Verlust für Power-User.

**Negativ / Aufwand**
- Navigations-Refactor: „Comply" → „Conformance" mit zwei Subjekt-Unterbereichen + Hub-Seite. Bestehende Routen/Deeplinks müssen umgebogen werden.
- Jede Ansicht muss Subjekt + Norm explizit im Kopf zeigen („Subject: your model · Norm: ISO 27001") — zusätzlicher UI-Aufwand pro Tor.

**Nicht-Ziele (aus dem Strategy-Doc übernommen)**
- Keine Zusammenlegung der drei *Funktionen* — sie sind bewusst verschieden.
- Kein Refactor der Pipeline/Governance-Logik in diesem Schritt — erst Sprache + Platzierung.

## Auswirkung auf Tickets

- **THE-305 Fläche B/C** (globale Anforderungs-Liste + Dashboard): jetzt **entblockt** — leben unter „Architecture Conformance" (COVER-Subjekt). Platzierung entschieden.
- **THE-307 (UC-GAP-001)**: ebenfalls unter „Architecture Conformance" → Gap-Sicht ist die negative Polarität von COVER.
- **Neu nötig:** ein Nav-/IA-Refactor-Ticket (Conformance-Sektion + Hub + sprechende Labels) als Voraussetzung vor B/C.
- **UC-WFCOMP-001 (THE-351/360)**: „Workflow Compliance" → umbenennen/umhängen nach „Workflow Conformance".

## Verwandt

`docs/strategy/2026-06-28-conformance-three-gates.md` · `docs/handoff/2026-06-28-wfcomp-recursive-modeling.md` · ADR-0001/0002 (Korpus) · THE-305 · THE-307 · THE-351/360
