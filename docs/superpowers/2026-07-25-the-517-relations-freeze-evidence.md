# Nachweis — Cross-Norm-Relationen-Golden EINGEFROREN (THE-517 / THE-433)

**Stand:** 2026-07-25 · **Frozen:** `packages/server/src/evals/golden/relations.v4.json` (175 Fälle)
**Prompt:** rp-2 (C5a-Präzedenzen) · **Ontologie:** E7 1.7.0

> **Ergebnis: Das Kappa-Tor ist erfüllt und das Golden ist eingefroren.** Die C5a-Präzedenzen im
> Rater-Prompt hoben die Cross-House-Übereinstimmung von **0,397 (rp-1) auf 0,866 (rp-2)** — der Beweis,
> dass die frühere Uneinigkeit eine Prompt-Lücke war, keine Aufgaben-Unklarheit.

## 1. Der Weg zum Freeze

| Schritt | Ergebnis |
|---|---|
| v3-Adjudikation (16 Streitfälle, 4 Regeln + 2 Ermessen) | RUBRIC C5a-Präzedenzkatalog |
| Verweis-Muster für 6 Korpus-Gesetze (THE-517 AC-1) | Data Act, PSD2, MDR, ePrivacy, eIDAS, UNECE |
| Pool-Export Voll-Korpus (Server B) | **1532/1532 Provisions + Qdrant-Vektoren, Abdeckung vollständig** |
| Verweis-Mining über 6 neue Adern | 80 frische Fälle (nach v3-Dedupe), ~40 Pinpoint-Positive |
| Rater-Prompt rp-2 (C5a in den Prompt) | „in substance" entfernt (Architekten-Grundsatz D1) |
| Cross-House-Messung v4 (Opus vs. GPT-5) | **Kappa 0,866 · 97,5 % · 2 Abweichungen** (von 16 auf 2) |

## 2. Die zwei letzten Abweichungen — und ein Korpus-Fund

Die genaue Text-Gegenüberstellung (auf Architekten-Wunsch, „hier keinen Fehler machen") deckte einen
**isolierten Korpus-Datenfehler** auf:

- **`dora-3 ↔ psd2-4`: AUSGESCHLOSSEN.** `psd2-de Art. 4` ist fehl-gescrapt (einziger Provision im
  1532-Korpus mit generischem „Article 4"-Titel; Inhalt = Änderungs-Text einer fremden Richtlinie statt
  PSD2s Definitions-Artikel). DORA zitiert im Gesetz korrekt „Zahlungsinstitut im Sinne von Art. 4 Nr. 4
  PSD2" (echtes INTERPRETS), aber das Korpus-Ziel trägt den falschen Text → die Uneinigkeit war ein
  **Daten-Artefakt** (Opus las den Text und sagte zu Recht „none"). Fall raus; nach Korpus-Fix wieder
  aufnehmbar. Defekt in THE-517 protokolliert.
- **`dora-3 ↔ psd2-32`: INTERPRETS b→a** (Architekten-Entscheid, saubere Daten). Neuer Sub-Präzedenz:
  ein durch Verweis auf einen **Sach-**(Nicht-Definitions-)Artikel geprägter Begriff („ausgenommenes
  Zahlungsinstitut … für das eine Ausnahme nach Artikel 32 Absatz 1 gilt") ist INTERPRETS, weil die
  Bedeutung vollständig aus der anderen Norm importiert ist.

## 3. Der frozen Satz

| Klasse | n | n ≥ 10 (AC-3) |
|---|---|---|
| keine Beziehung (`null`) | 155 | — (Negativ-Klasse) |
| **INTERPRETS** | **10** | ✅ trägt |
| CONCRETIZES | 5 | ❌ dünn |
| RECOGNIZES_EQUIVALENCE | 3 | ❌ dünn |
| PREVAILS_OVER | 1 | ❌ strukturell selten |
| SETS_PARAMETER | 1 | ❌ strukturell selten |

**175 Fälle** (v3 96 architekten-adjudiziert + v4 79 rp-2-validiert). Negativ-Anteil 88,6 % — im Cross-
Norm-Recht strukturell erwartbar (die meisten Artikel-Paare haben keine getypte Beziehung; C6).

## 4. Ehrliche Einordnung

- **Aufgabe validiert, Freeze berechtigt:** Die Wahrheiten sind architekten-adjudiziert; die
  *Aufgaben-Klarheit* ist durch die v4-Cross-House-Messung unter rp-2 belegt (0,866). Das ist dieselbe
  Logik wie bei der Typisierung: die Rubrik gehört in den Prompt, bevor eine niedrige Zahl als
  Aufgaben-Problem gelesen werden darf.
- **AC-3 teilweise:** Nur INTERPRETS erreicht n ≥ 10. Das Verweis-Mining war definitions-lastig (DORA/
  Data-Act-Begriffsanleihen); die gleichwertigkeits-/konkretisierungs-reichen Adern (CRA↔KI-VO „gilt als
  konform", MDR-Konkretisierungen) wurden noch nicht gemint. → **dokumentierte Grenze**, nicht forciert:
  die selteneren Klassen künstlich auf 10 zu treiben würde den Satz verzerren.
- **THE-433 entblockt für die Haupt-Fälle:** `none` + `INTERPRETS` tragen einen belastbaren Baseline;
  die selteneren Beziehungsarten sind als dünn ausgewiesen und Kandidat für einen gezielten zweiten
  Mining-Lauf (CRA↔KI-VO, CRA↔MDR, KI-VO↔MDR).

## 5. Offen

- Korpus-Fix `psd2-de Art. 4` (Server B) → Fall `dora-3↔psd2-4` als sauberes INTERPRETS nachtragen.
- Optionaler zweiter Mining-Lauf auf gleichwertigkeits-reiche Paare, um CONCRETIZES/EQUIVALENCE über
  n ≥ 10 zu heben (falls THE-433 belastbare Per-Typ-Zahlen für diese Arten braucht).
