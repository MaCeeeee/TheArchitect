# RVTM — Slice 1 Paar-Richter-Validierung (THE-382)

**Plan:** docs/superpowers/plans/2026-08-01-the382-slice1-pair-judge-validation.md
**Epic:** THE-378 (aus „Done" zurückgeholt) · **REQ:** THE-382, Score 85,7
**Datum:** 2026-08-01 · **Basis:** `master` nach Merge von PR #112

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

## Akzeptanzkriterien aus THE-382 Slice 1

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **S1.1** | Menschliches Gold auf einer Stichprobe aus `actions.v1` (40 Paare, quer über T und K, blind gezogen), adjudiziert von einem EA | Task 1, 2, 3 | `actions.human.v1.json` existiert, Schema-valide, `annotator` + `blinded` gesetzt | ⬜ |
| **S1.2** | Judge-vs-Mensch-Übereinstimmung gemessen, **≥ 0,7 Kappa** | Task 5, 7 | `pairs:agreement` gibt κ + Rohübereinstimmung + Abweichungsliste aus | ⬜ |
| **S1.3** | Die 35 % werden bestätigt, korrigiert oder **zurückgezogen** | Task 7 | Kommentar an THE-438 + Abschnitt in `action-release-gates.md` | ⬜ |
| **S1.4** | Canary-Injektion, **Catch-Rate ≥ 90 % als Tor** | Task 4, 6 | Unit: Tor kippt den Lauf; Harness weist Rate aus | ⬜ |
| **S1.5** | Verdikt-Verteilung je Lauf geloggt, Kollaps-Alarm | Task 5, 6 | Unit: `collapseSignal`; Bericht zeigt Ablehnungsquote | ⬜ |
| **S1.6** | Richter zitiert die tragende Textstelle beider Pflichten | Task 6 | Review: `PAIR_JUDGE_SYSTEM` verlangt Zitat; Stichprobe im Lauf | ⬜ |

## Messvalidität — die Punkte, an denen dieser Slice selbst scheitern kann

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **MV-1** | **Mensch sieht dieselbe geblendete Darstellung wie der Richter** — sonst ist eine Abweichung doppeldeutig (Urteil vs. Informationsvorsprung) | Task 2 | Unit: Arbeitsblatt enthält keinen Gesetzesnamen; `blinded: true` im Gold | ⬜ |
| **MV-2** | **Kein Maschinenurteil im Arbeitsblatt** — ein vorbelegter Wert misst Zustimmung, nicht Urteil | Task 2 | Unit: HTML enthält keinen Vorschlag, keine Arm-Kennzeichnung, keine Katalog-Handlung | ⬜ |
| **MV-3** | **„Unsicher" ist ein zulässiges Urteil** und wird aus dem Kappa ausgeschlossen, nicht als Dissens gezählt | Task 1, 5 | Unit: `same: null` schema-valide; `judgeHumanAgreement` überspringt sie | ⬜ |
| **MV-4** | **Stichprobe deterministisch** — der Anker darf zwischen Läufen nicht wackeln | Task 1 | Unit: zweimal gezogen = identisch, arm-proportional | ⬜ |
| **MV-5** | **Kanarienvögel mechanisch konstruiert, nicht generiert** — ein Modell erbte seine eigenen blinden Flecken | Task 4 | Unit: kein LLM-Aufruf; deterministisch; beide Hälften aus Arm T | ⬜ |
| **MV-6** | **Leere Canary-Menge ≠ bestanden** (`null` statt 100 %) und **fehlende Antwort ≠ gefangen** | Task 4, 5 | Unit: `canaryCatchRate([])` ist `null`; `null`-Votum zählt nicht als gefangen | ⬜ |
| **MV-7** | **Kanarienvögel erreichen nie die Stufen oder Arm-Quoten** | Task 6 | Unit: kein `canary__`-Eintrag in `tiers` | ⬜ |
| **MV-8** | **Kanarienvögel gemischt, nicht als Block** — sonst erkennt ein Modell das Muster | Task 6 | Review der Reihenfolge im Harness | ⬜ |
| **ADD-1** | Rein additiv: `canaryCatchRate` optional, bestehende Aufrufe unverändert gültig | Task 5 | Bestands-Suiten grün ohne Anpassung | ⬜ |

## Menschliche Tore

| Tor | Wo | Entscheid |
|---|---|---|
| 🧑 1 | Task 7 Step 2 | **Adjudikation von 40 Paaren** durch einen Enterprise Architekten über das blinde Arbeitsblatt |
| 🧑 2 | Task 7 Step 3 | **Verdikt über die 35 %** — bestätigen, korrigieren oder zurückziehen, abhängig von κ |

## Offene Punkte

- **O-1 Adjudikator-Frage entschieden, nicht vertagt:** Der Paar-Richter fragt nach *Umsetzbarkeit* („erfüllt ein betriebener Prozess beide?") — das ist EA-adjudizierbar. Das Mapping-Gold fragt nach *Betroffenheit* und braucht ein Fachurteil (Präzedenz THE-434). Deshalb Paar-Richter zuerst.
- **O-2 Statistische Grenze:** 40 Paare, ein Adjudikator. Das reicht für einen groben Dissens, nicht für die Verteidigung eines knappen κ auf zwei Stellen. Gehört so in den Report.
- **O-3 Obergrenze unbekannt:** Ohne einen zweiten Menschen kennen wir das Mensch↔Mensch-Kappa nicht — also nicht, was der Richter überhaupt erreichen *könnte*. Ein κ von 0,65 wäre bei einer menschlichen Obergrenze von 0,70 ein gutes Ergebnis und bei 0,95 ein schlechtes.
- **O-4 Reihenfolge-Risiko:** Fällt S1.2 durch, sind die veröffentlichten Zahlen zurückzuziehen — auch gegenüber Alex, der den Bericht bereits hat. Das ist der Preis dafür, vorher veröffentlicht zu haben.
