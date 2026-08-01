# RVTM — Slice 1 Typisierter Paar-Richter, gegen Menschen validiert (THE-382)

**Plan:** docs/superpowers/plans/2026-08-01-the382-slice1-pair-judge-validation.md
**Epic:** THE-378 (aus „Done" zurückgeholt) · **REQ:** THE-382, Score 85,7
**Datum:** 2026-08-01 · **Basis:** `master` nach Merge von PR #112
**Umgeschrieben** nach dem Typisierungs-Experiment ([`docs/evals/typed-relation-experiment.md`](../../evals/typed-relation-experiment.md)): κ 0,308 → 0,681 allein durch vier Antworten statt zwei; `equal` kam in 120 Fällen **null** Mal vor.

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

## Akzeptanzkriterien aus THE-382 Slice 1

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **S1.1** | Menschliches Gold auf einer Stichprobe aus `actions.v1` (40 Paare, quer über T und K, blind gezogen), adjudiziert von einem EA | Task 3, 4, 5 | `actions.human.v1.json` existiert, Schema-valide, `annotator` + `blinded` gesetzt | ⬜ |
| **S1.2** | Judge-vs-Mensch-Übereinstimmung gemessen, **≥ 0,7 Kappa** — auf den **vier Typen**, nicht binär | Task 2, 8 | `pairs:agreement` gibt κ + Konfusionsmatrix + Typ-Verteilung aus | ⬜ |
| **S1.3** | Die 35 % werden **umgedeutet**: nicht „eine Maßnahme erfüllt beide" (`equal`, 0/120), sondern „gemeinsamer Kern, ausgewiesene Zusätze" (`intersects`) | Task 8 | Kommentar an THE-438 + Abschnitt in `action-release-gates.md` + Korrektur im Bericht | ⬜ |
| **S1.7** | Rubrik typisiert **vor** dem menschlichen Gold — ein binäres Gold wäre teuer erhobener Müll | Task 1 | `PAIR_RELATION_SYSTEM` existiert; `equal`-Definition wortgleich zur binären Vorgängerin | ⬜ |
| **S1.8** | Konfidenzstufen auf Typen umgestellt: A = `equal`/`subset`, B = `intersects`, C = uneins | Task 7 | Unit: Stufe B ist mit zwei Häusern erreichbar (vorher arithmetisch unmöglich) | ⬜ |
| **S1.4** | Canary-Injektion, **Catch-Rate ≥ 90 % als Tor** | Task 6, 7 | Unit: Tor kippt den Lauf; Harness weist Rate aus | ⬜ |
| **S1.5** | Verdikt-Verteilung + Typ-Verteilung je Arm geloggt, Kollaps-Alarm | Task 2, 7 | Unit: `collapseSignal`; Bericht zeigt Ablehnungsquote | ⬜ |
| **S1.6** | Richter zitiert die tragende Textstelle beider Pflichten | Task 1 | Review: `PAIR_RELATION_SYSTEM` verlangt Begründung; Stichprobe im Lauf | ⬜ |

## Messvalidität — die Punkte, an denen dieser Slice selbst scheitern kann

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **MV-1** | **Mensch sieht dieselbe geblendete Darstellung wie der Richter** — sonst ist eine Abweichung doppeldeutig (Urteil vs. Informationsvorsprung) | Task 4 | Unit: Arbeitsblatt enthält keinen Gesetzesnamen; `blinded: true` im Gold | ⬜ |
| **MV-2** | **Kein Maschinenurteil im Arbeitsblatt** — ein vorbelegter Wert misst Zustimmung, nicht Urteil | Task 4 | Unit: HTML enthält keinen Vorschlag, keine Arm-Kennzeichnung, keine Katalog-Handlung | ⬜ |
| **MV-3** | **„Unsicher" ist ein zulässiges Urteil** und wird aus dem Kappa ausgeschlossen, nicht als Dissens gezählt | Task 3, 8 | Unit: `relation: null` schema-valide; Vergleich überspringt sie | ⬜ |
| **MV-9** | **`intersects` wird NICHT mit `equal` verrechnet.** Wo eine binäre Sicht nötig ist, wird die Faltung ausdrücklich benannt | Task 1, 2, 7 | Unit: `foldRelation('intersects') === false`; Report nennt die Faltung | ⬜ |
| **MV-10** | **Mensch und Richter bekommen dieselbe Rubrik** — sonst misst der Kappa die Differenz der Rubriken statt der Urteile | Task 4 | Unit: Arbeitsblatt enthält die vier Definitionen wörtlich | ⬜ |
| **MV-11** | **Binäre Vorgängerfassung bleibt erhalten** — der eingefrorene Vergleichslauf muss reproduzierbar bleiben | Task 1 | `PAIR_JUDGE_SYSTEM` weiterhin exportiert, als historisch gekennzeichnet | ⬜ |
| **MV-4** | **Stichprobe deterministisch** — der Anker darf zwischen Läufen nicht wackeln | Task 3 | Unit: zweimal gezogen = identisch, arm-proportional | ⬜ |
| **MV-5** | **Kanarienvögel mechanisch konstruiert, nicht generiert** — ein Modell erbte seine eigenen blinden Flecken | Task 6 | Unit: kein LLM-Aufruf; deterministisch; beide Hälften aus Arm T | ⬜ |
| **MV-6** | **Leere Canary-Menge ≠ bestanden** (`null` statt 100 %) und **fehlende Antwort ≠ gefangen** | Task 6 | Unit: `canaryCatchRate([])` ist `null`; `null`-Votum zählt nicht als gefangen | ⬜ |
| **MV-7** | **Kanarienvögel erreichen nie die Stufen oder Arm-Quoten** | Task 7 | Unit: kein `canary__`-Eintrag in `tiers` | ⬜ |
| **MV-8** | **Kanarienvögel gemischt, nicht als Block** — sonst erkennt ein Modell das Muster | Task 7 | Review der Reihenfolge im Harness | ⬜ |
| **ADD-1** | Rein additiv: binäre Fassung bleibt exportiert, bestehende Aufrufe unverändert gültig | Task 1, 2 | Bestands-Suiten grün ohne Anpassung | ⬜ |

## Menschliche Tore

| Tor | Wo | Entscheid |
|---|---|---|
| 🧑 1 | Task 8 Step 2 | **Adjudikation von 40 Paaren** durch einen Enterprise Architekten über das blinde Arbeitsblatt — mit **vier** Optionen plus „unsicher" |
| 🧑 2 | Task 8 Step 3 | **Verdikt über die Aussage** — trägt „gemeinsamer Kern, ausgewiesene Zusätze"? Abhängig von κ und davon, ob der Mensch `equal` vergibt |

## Offene Punkte

- **O-1 Adjudikator-Frage entschieden, nicht vertagt:** Der Paar-Richter fragt nach *Umsetzbarkeit* („erfüllt ein betriebener Prozess beide?") — das ist EA-adjudizierbar. Das Mapping-Gold fragt nach *Betroffenheit* und braucht ein Fachurteil (Präzedenz THE-434). Deshalb Paar-Richter zuerst.
- **O-2 Statistische Grenze:** 40 Paare, ein Adjudikator. Das reicht für einen groben Dissens, nicht für die Verteidigung eines knappen κ auf zwei Stellen. Gehört so in den Report.
- **O-5 Gegenprobe zum Experiment:** Vergibt der **Mensch** häufig `equal`, widerspricht das Ergebnis 2 des Experiments (0/120 bei den Modellen). Dann liegt eine Rubrik-Differenz Mensch/Maschine vor, die **vor** jeder Veröffentlichung zu klären ist.
- **O-6 SCF/ENISA als externes Gold:** CC BY-ND — intern nutzbar, nicht auslieferbar. Die Transitivität „gleiche Kontrolle ⇒ harmonisierbar" ist **unsere** Folgerung, nicht die Behauptung des SCF, und selbst zu prüfen. Eigener Vorlauf, blockiert diesen Slice nicht.
- **O-3 Obergrenze unbekannt:** Ohne einen zweiten Menschen kennen wir das Mensch↔Mensch-Kappa nicht — also nicht, was der Richter überhaupt erreichen *könnte*. Ein κ von 0,65 wäre bei einer menschlichen Obergrenze von 0,70 ein gutes Ergebnis und bei 0,95 ein schlechtes.
- **O-4 Reihenfolge-Risiko:** Der Bericht bei Alex trägt bereits die Formulierung „Wer die Maßnahme einmal umsetzt, erfüllt beide" — das ist `equal` und nicht belegt. Die Korrektur läuft unabhängig von diesem Slice und ist bereits angestoßen; das ist der Preis dafür, vor der Validierung veröffentlicht zu haben.
