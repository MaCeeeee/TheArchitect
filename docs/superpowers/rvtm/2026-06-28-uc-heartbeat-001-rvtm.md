# RVTM — UC-HEARTBEAT-001 Backlog Heartbeat (Self-Audit gegen die Realität)

**Spec / Linear UC:** [THE-371 — UC-HEARTBEAT-001](https://linear.app/thearchitect/issue/THE-371)
**Created:** 2026-06-28 · **Status:** Backlog — **plan-for-review** (Child-REQs nach Freigabe anlegen)
**Quelle:** Strategie-Gespräch 2026-06-28 (LinkedIn C. Greyling, „prompt→fleet engineering"); manueller PoC-Sweep am selben Tag.
**Memory:** `feedback_backlog_rescore_trigger`, `feedback_asilomar_ai_principles`
**Verwandt:** UC-CRIT/UC-RED (Drift-Detection auf ArchiMate-Graph — Heartbeat = selbe Engine auf Planungs-Graph), UC-MCP-001 (THE-339, Self-Dogfooding-Kanal), Trust-Spine (THE-320/321/322, Human-Gate-Vorbild)

> Scoring-Modell wie bestehende RVTMs: 7 Kriterien je 0–5, **Score = Σ/35·100**.

## These (Root Cause)

Backlog-Scores werden **einmalig bei Issue-Erstellung** berechnet und nie aktualisiert — obwohl Feasibility/Relations/Urgency **dynamisch** sind. Dependencies leben in Prosa (RVTM-Docs), nicht als strukturierte `blockedBy`-Relation → kein Event, kein Re-Score. Folge: stille Drift. Erster manueller Sweep (2026-06-28) fand **9 fehlplatzierte Issues von 109**, davon 5 mit ~6 Wochen altem Produktiv-Code als „Backlog" gelistet.

## Scoring

| BizValue | BizRisk | Feasibility | Success | Compliance | Relations | Urgency | **Score** |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 4 | 3 | 4 | 4 | 2 | 4 | 3 | **68,6** |

Begründung: BizValue 4 (demonstrierte Hebelwirkung + „Vertrauen in eigene Daten" = Trust-Spine nach innen). BizRisk 3 (ohne: Doppelarbeit, verlorene reife Features). Feasibility 4 (manueller Lauf = bewiesener PoC, kein neues Infra). Compliance 2 (indirekt: Audit-Spur + erzwingt Human-Gate). Relations 4 (Reuse: Linear-MCP, UC-CRIT/UC-RED-Muster, MCP-Dogfooding). Urgency 3 (real + laufend, aber nicht deadline-kritisch).

## Drei Staleness-Typen = drei Datenquellen

| Typ | Signal | Datenquelle | PoC-Beleg 2026-06-28 |
|--|--|--|--|
| **A „Tracker lügt"** | Issue Backlog, aber Code/Tests im Repo | Code/Git-Abgleich | THE-238/239/240/241/242 (Similarity live seit ~6 Wo.) |
| **B born-ready / Stale Parent** | Blocker/Geschwister Done, Issue Backlog | Linear-Graph | THE-307, THE-305, THE-301 (Parent) |
| **C ungescheduled** | nie blockiert, Fundamente da | RVTM-Prosa + Foundation-Status | THE-190 (CHOICE-003) |
| **D Bug** | born-ready per Klasse | trivial | THE-370 |

## Human-Gate (Asilomar #16 — nicht verhandelbar)

Heartbeat setzt **niemals selbst `Done`**. Routing: Typ A → **In Review** (+ Test-Checkliste), Typ B/D → **Todo**, Typ C → **nur flaggen**. Mensch testet + beglaubigt → Done. Spiegelbild der Trust-Spine (`certifiedBy`). Mitigation gegen die „File existiert ≠ Feature funktioniert"-Heuristik.

## Traceability Matrix (REQs — Sub-Issues von THE-371 nach Plan-Approval)

| REQ | Requirement | Verification | Status |
|--|--|--|--|
| **REQ-HEARTBEAT-001.1** | Linear-Graph-Signal: Stale-Parent (Kinder Done ∧ Parent Backlog) + born-ready (alle `blockedBy` Done) | Test: Fixture-Issues → korrekte Klassifikation | Pending |
| **REQ-HEARTBEAT-001.2** | Code/Git-Abgleich (Typ A): Heuristik File/Test/Endpoint vorhanden → „shipped-Kandidat" pro Backlog-Issue | Test: bekannte Shipped-Issues (SIM) erkannt, echte Backlog-Issues nicht | Pending |
| **REQ-HEARTBEAT-001.3** | Prose-Dependency/Foundation-Abgleich (Typ C) + Dependencies als `blockedBy` strukturieren (Pre-Flight-Pflicht) | Inspection: bekannte prose-Deps gefunden + als Relation gesetzt | Pending |
| **REQ-HEARTBEAT-001.4** | Human-Gate-Routing + Report/Kommentare; **kein Auto-Done**; Typ-A→In Review mit Test-Checkliste | Inspection: kein Codepfad setzt `Done`; Routing-Tabelle erzwungen | Pending |
| **REQ-HEARTBEAT-001.5** | Scheduled Loop (`/schedule` wöchentlich) → später event-driven Linear-Webhook on `issue→Done` | Demo: Routine läuft, Digest erscheint | Pending |

## Komplexität (Ousterhout)

- **Change Amplification:** niedrig (additiv; kein Produktcode außer opt. `blockedBy`-Strukturierung).
- **Cognitive Load:** niedrig–mittel.
- **Unknown Unknowns:** mittel — „File existiert" → „Feature done" ist Heuristik (false positives) → **Human-Gate ist die Mitigation**.

## Offene Punkte vor Implementierung

1. Plan-Review durch Matze (dieses Dokument).
2. REQ-Sub-Issues (5) unter THE-371 anlegen.
3. Reifegrad-Entscheidung: erst REQ-.1/.2 als manuell-getriggerter Sweep härten, dann .5 (Loop) automatisieren.
4. Produkt-Variante prüfen: Heartbeat als kundenfähiges Feature („Roadmap-/Backlog-Drift-Detection") separat scoren — höherer BizValue, eigener UC.
