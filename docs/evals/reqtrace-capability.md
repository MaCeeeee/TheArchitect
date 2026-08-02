# THE-547 — Ist der Gegenstand die fehlende Achse der Harmonisierung?

**Verdikt: ❌ trägt nicht** — 19 von 22 Annahmen verloren (zulässig ≤ 3) — über-segmentiert. Gold-Quote auf 2/5 gefallen (verlangt ≥ 4).

Grundlage ist Lauf 4 aus THE-545. Segmentierung, Extraktion, Transformation, Paarurteile
und Verdrängung sind **unverändert übernommen**; neu ist allein der Gegenstands-Filter.
Er sitzt vor dem Richter und kann Paare nur wegnehmen — es gibt keinen Pfad, auf dem hier
eine Maßnahme entstünde, die es in Lauf 4 nicht gab.

Gegenstands-Werteraum: **kanonischer Katalog** aus `reqtrace-object-catalog-clusters.json` (30 Klassen)

## Die drei vorab gesetzten Schwellen

| Kontrolle | Schwelle | Ergebnis | |
| --- | --- | --- | --- |
| Ablehnungen aufgelöst | ≥ 8 | **10 von 10** | ✅ |
| Annahmen verloren | ≤ 3 | **19 von 22** | ❌ |
| Gold-Quote gehalten | ≥ 4/5 | **2/5** | ❌ |

**Übereinstimmung mit dem menschlichen Urteil: 40,6 %** (vorher 68,8 %).

## Wirkung auf die Kandidaten

| Größe | vorher | nachher |
| --- | --- | --- |
| geteilte Maßnahmen | 32 | 3 |
| paarweise Kandidaten | 512 | 44 |

Jede beurteilte Anforderung hat einen bestimmbaren Gegenstand.

## Gold gegen das SCF

| SCF | akzeptierte Gesetzes-Mengen | wiedergefunden durch |
| --- | --- | --- |
| BCD-01 | dsgvo + nis2 | — |
| CRY-01 | dsgvo + nis2 | pair__dsgvo:art32:c01:q1s1__nis2:art21:c01:q1s2 |
| GOV-02 | dora + dsgvo *oder* dsgvo + nis2 | — |
| HRS-03 | dora + dsgvo | — |
| RSK-01 | dora + dsgvo *oder* dsgvo + nis2 | measure__dsgvo:art32:c06:q1s1 |

## Diagnose — nachgetragen, ohne das Verdikt anzutasten

**Die Achse ist nicht widerlegt. Die REGEL ist es.**

Der Filter verlangt **Gleichheit** des Gegenstands. Damit löst er zwar alle zehn
Ablehnungen auf — aber er löst auch fast alles andere auf. Er ist nicht
trennscharf, er ist nur streng.

Was der Mensch angenommen und der Filter zerschlagen hat:

| Gegenstand A | Gegenstand B | Fälle |
| --- | --- | --- |
| `sicherheitsvorfall` / `sicherheitsvorfall-meldung` | `datenschutzverletzung` | 4 |
| `informationssicherheit` | `datenverfuegbarkeit-integritaet-vertraulichkeit` | 2 |
| `ikt-revision` | `ikt-governance` | 1 |
| `zugriffskontrolle` | `personenbezogene-daten` | 1 |
| … + 7 Fälle mit unbestimmbarem Gegenstand (konservative Regel) | | 7 |

Das sind **benachbarte** Gegenstände, keine beliebigen. Der Katalog hat
„IKT-Vorfall" und „Datenschutzverletzung" blind getrennt — fachlich korrekt, es
sind verschiedene Rechtsgüter —, und der Adjudikator hat sie für die
Maßnahmenfrage zusammengezogen. Beide Urteile sind vertretbar; sie liegen auf
verschiedenen Granularitätsebenen.

**Wie viel Signal trägt das Gegenstands-Paar überhaupt?** Über die 32 Fälle
treten **26 verschiedene** Gegenstands-Paare auf. Genau **eines** davon
(`datenschutzverletzung | sicherheitsmassnahme`) trägt beide Urteile — die
Achse widerspricht sich also fast nie.

> **Diese Zahl ist fast nichts wert, und das muss dabeistehen.** 26 Paare auf 32
> Fälle heißt: fast jedes Paar kommt genau einmal vor. Eine Regel, die auf diesen
> Paaren angepasst würde, hätte 26 freie Parameter für 32 Datenpunkte — sie würde
> auswendig lernen, nicht verallgemeinern. Die Widerspruchsfreiheit ist eine
> **notwendige, keine hinreichende** Bedingung: sie hält die Achse als Kandidatin
> am Leben, mehr nicht.

**Die Form, die zu prüfen wäre** — und die auffällig bekannt aussieht: nicht
Gleichheit, sondern eine **typisierte Beziehung** zwischen Gegenständen, wie sie
zwischen Anforderungen längst gemessen wird (NIST IR 8477: `equal` · `subset` ·
`intersects` · `unrelated`). Dort war der Befund vom 2026-08-01: `equal` kam in
120 Fällen **null Mal** vor, `intersects` dominierte. Dass eine Gleichheitsregel
eine Ebene tiefer ebenfalls scheitert, passt in dieses Bild — ist aber damit
nicht belegt, sondern nur plausibel.

**Was nicht passiert ist:** keine Schwelle gesenkt, kein Katalog nachjustiert,
kein zweiter Werteraum probiert, bis die Zahl stimmt. Das Verdikt bleibt
❌ trägt nicht.

## Grenzen

- **Dieselben 32 Fälle wie THE-545.** Der Mensch hat sie beurteilt, bevor der Gegenstand im Spiel war — insofern ist das Urteil unbeeinflusst. Aber es sind **keine neuen Fälle**: gemessen wird, ob die Achse die bekannten Ablehnungen erklärt, nicht ob sie auf unbekannten trägt.
- **Der Gegenstand kommt aus einem Modell.** Ohne Doppelkodierung ist seine eigene Zuverlässigkeit unbekannt.
- Ein negatives Ergebnis ist ein **gültiges Ergebnis**.
