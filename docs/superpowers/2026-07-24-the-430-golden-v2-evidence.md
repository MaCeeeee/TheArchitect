# Golden v2 — Out-of-Sample-Nachweis + Audit (THE-430)

**Stand:** 2026-07-24 · **Branch:** `mganzmanninfo/the-430-golden-v2`
**Frozen:** `typing.gv2.json` (70 Fälle, frisch/out-of-sample) · `typing.gv2-audit.json` (22 Verdachtsfälle)
**Prompt:** tp-2 (eingefroren bis zur Messung — Ratsche gegen In-Sample-Argumente)

> **Kurzfassung:** Der In-Sample-Vorbehalt der Gate-2-Zahlen ist aufgelöst — ehrlich. Auf einem frischen
> Prüfsatz, zu 47 % aus Gesetzen, die weder v1 noch die Adjudikation je sahen, hält die Klasse, an der
> der Discovery-Nutzen hängt (`scope-applicability`, F1 0,90 ≥ 0,80), und `provisionKind` generalisiert
> fast verlustfrei. `partyRole` bricht wie vorhergesagt ein (0,845 → 0,668) — der Out-of-Sample-Test hat
> die Rollenraum-Lücke gemessen statt vermutet. Getrennt davon: der Audit beziffert Haikus normKind/
> bindingness-Genauigkeit auf 98,96 % / 99,61 % mit einem eng umrissenen Fehlermuster.

---

## 1. Aufbau (warum diese Zahl ehrlich ist)

**Zwei Töpfe, getrennt:**
- **Frisch (`typing.gv2.json`, 70 Fälle):** disjunkt zu v1 UND zu den 22 Verdachtsfällen, gestreut über
  alle 21 Quellen. **33 der 70 Fälle stammen aus MDR/PSD2/eIDAS/ePrivacy/Data Act** — Gesetzen, die im
  gesamten v1-/Adjudikations-Prozess nie vorkamen.
- **Audit (`typing.gv2-audit.json`, 22 Fälle):** die 22 §§, die Haiku im Voll-Korpus-Lauf als
  Nicht-`legislation`/Nicht-`binding` gelabelt hatte (über die Modell-Ausgabe selektiert → eigener Topf,
  darf die Generalisierungs-Zahl nicht verunreinigen).

**Prompt-Freeze-Ratsche:** `TYPING_PROMPT_VERSION` blieb während des ganzen v2-Baus auf **tp-2** — genau
der Prompt, dessen Regeln aus den v1-Fällen stammen. Weil v2 aus *anderen* Paragraphen besteht, misst
Haiku-tp-2 gegen v2 echte Generalisierung, nicht Wiedererkennung. Neue Präzedenzen aus der v2-Adjudikation
fließen erst in ein künftiges tp-3 (gemessen an v3).

**Prüfer:** Opus + GPT-5 (Cross-House, 0 Ausfälle nach einem gezielt nachgeholten GPT-5-Einzelaussetzer),
Architekten-Adjudikation der 42 Abweichungen am 2026-07-24.

## 2. Die Generalisierungs-Zahl (Haiku tp-2 vs frozen v2)

| Achse | in-sample (v1) | **out-of-sample (v2)** | Deutung |
|---|---|---|---|
| `bindingness` | 97,5 % / 0,987 | **100 % / 1,000** | stabil |
| `normKind` | 100 % / 1,000 | **98,6 % / 0,993** | 1 Fehler (Ermächtigungs-Falle, 23. Instanz) |
| `provisionKind` | 87,5 % / 0,883 | **85,7 % / 0,873** | **generalisiert** |
| `obligationKind` | 88,8 % / 0,869 | **80,0 % / 0,689** | Abfall, über 0,6 |
| `partyRole` | 95,0 % / 0,845 | **72,9 % / 0,668** | **erwarteter Einbruch** |
| **`scope-applicability`** (Klasse) | F1 0,92 | **F1 0,90 · Recall 1,00** | **hält über Gate-2-Tor 0,80** |

**Auslegung:** Der Vorbehalt ist beantwortet, ohne zu schönen. Auf ungesehenen Gesetzen fallen die
Zahlen — genau das soll ein ehrlicher Test zeigen. Entscheidend:
1. Die **Discovery-Konsumklasse `scope-applicability` hält** (F1 0,90) — der Hebel ist auch
   out-of-sample abgesichert.
2. `provisionKind` generalisiert fast verlustfrei.
3. `obligationKind` fällt (v. a. `prohibition` F1 0,40 bei n=3, `n/a`-Recall 0,57) — dünn besetzte
   Klassen auf schrägen neuen Artikeln; kein Gate-relevanter Konsument hängt daran.

## 3. partyRole — der belegte Erweiterungs-Auftrag

Der Einbruch (0,845 → 0,668) ist **vorhergesagt und lokalisiert**: `financial_entity` Recall 0,40,
`provider` Precision 0,44. Ursache sind die neuen Adressaten-Typen, für die der Rollenraum keinen Wert
hat. Architekten-Entscheid in der Adjudikation:

- **PSD2-Zahlungsinstitute → `financial_entity`** (kein neuer Wert nötig — DORA Art. 2 zählt
  Zahlungsinstitute ausdrücklich als Finanzunternehmen; sauberer Gegenbeleg, dass nicht jedes neue
  Gesetz eine neue Rolle braucht).
- **Data-Act-Dateninhaber → `n/a`**, erster dokumentierter **1.7.0-Kandidat `data_holder`**.
- **ePrivacy-Kommunikationsdienste-Anbieter → `n/a`**, zweiter 1.7.0-Kandidat.

Der Out-of-Sample-Test hat den nächsten Ontologie-Schritt damit **gemessen**, nicht geraten — dasselbe
Muster wie bei der Gate-1-Facetten-Erweiterung: erst messen, dann erweitern.

## 4. Audit — Haikus normKind/bindingness-Fehlerquote

22 Verdachtsfälle, **Opus + GPT-5 einstimmig `legislation`/`binding` auf allen 22**, Architekt bestätigt.
Damit sind Haikus 22 Abweichungen belegte Fehler:

| Achse | Fehler im Korpus | Genauigkeit | Fehlermuster |
|---|---|---|---|
| `normKind` | 16 / 1532 | **98,96 %** | Ermächtigungs-Artikel (→ „delegated_act") · Änderungs-Artikel (→ „implementing_act") |
| `bindingness` | 6 / 1532 | **99,61 %** | Leitlinien-/Kodex-Artikel (Verbindlichkeit des beschriebenen Instruments verwechselt) |

**Folge:** Diese zwei Achsen brauchen **keine** Reparatur — weder Facette noch Rubrik. Genauigkeit ~99 %,
Fehler in einem eng umrissenen, benannten Muster. Der voreilige „Korpus-Varianz"-Befund vom 24.07.
(Nebenbefund A im Gate-2-Nachweis) ist damit korrigiert und belegt: es war Modell-Fehler, keine Varianz.

## 5. Konsequenzen

- **In-Sample-Vorbehalt der release-gates → aufgelöst** (mit ehrlicher Out-of-Sample-Tabelle statt einer
  geschönten Einzahl). Gate-2-Kriterium `scope-applicability` F1 ≥ 0,80 hält auch out-of-sample.
- **partyRole 1.7.0** als eigenes, belegtes Ticket: Rollen `data_holder` + ECS-Anbieter prüfen; danach
  tp-3 + Re-Messung an v3.
- **`normKind`/`bindingness`** geschlossen — keine Aktion.
- v1 und die Gate-1/Gate-2-Artefakte bleiben unangetastet (DD-7). `DEFAULT_TYPING_GOLDEN_PATH` bleibt v1;
  v2 wird per `--golden` gemessen.

## 6. Artefakte

| | Pfad |
|---|---|
| Frisch (frozen) | `packages/server/src/evals/golden/typing.gv2.json` |
| Audit (frozen) | `packages/server/src/evals/golden/typing.gv2-audit.json` |
| Prüfer-Läufe | `typing.gv2.rater-a.json` (Opus) · `typing.gv2.rater-b-gpt5.json` (GPT-5) · Audit-Pendants |
| Adjudikations-Pakete | `docs/superpowers/2026-07-24-golden-v2-adjudication-fresh.md` · `…-audit.md` |
| Eval-Report | `packages/server/src/evals/reports/typing-gv2.md` |
