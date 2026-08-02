# Senkrechter Schnitt — Klausel → Anforderung → Systemanforderung → Maßnahme (THE-545)

**Verdikt: ✅ trägt** — Alle Kontrollen bestanden.

## 1. Positiv-Kontrolle gegen das externe SCF-Gold

| SCF | Gesetze | wiedergefunden durch |
| --- | --- | --- |
| BCD-01 | dsgvo + nis2 | pair__dsgvo:art32:c04:q1s1__nis2:art21:c01:q2s1 |
| CRY-01 | dsgvo + nis2 | pair__dsgvo:art24:c01:q1s1__nis2:art21:c01:q1s2 |
| GOV-02 | dora + dsgvo *oder* dsgvo + nis2 | measure__dora:art19:c11:q1s1 |
| HRS-03 | dora + dsgvo | — |
| RSK-01 | dora + dsgvo *oder* dsgvo + nis2 | measure__dsgvo:art32:c06:q1s1 |

**4 von 5** (Schwelle 3).
Keine Maßnahme trifft mehrere Gold-Einträge.

## 2. Negativ-Kontrollen

| Kontrolle | Ergebnis |
| --- | --- |
| mechanisch — NIS2 Art. 23 × DORA Art. 19 durch Verdrängung ausgeschlossen, **bevor** ein Modell befragt wurde | ✅ |
| semantisch — keine Maßnahme vereint verschiedene kanonische Handlungen | ✅ |
| Kanarienvogel — dieselbe Anforderung zweimal ergibt eine Maßnahme | ✅ |

Durch Verdrängung ausgeschlossen: 1077 Paar(e). Vom Richter geurteilt: 762.

## 3. Kalibrierung der Extraktion

| Größe | Wert | Referenz |
| --- | --- | --- |
| Artikel · Klauseln | 9 · 143 | — |
| Klauseln je Artikel | 15.9 | Reg2Req ≈ 4,0 (Schnitt über alle DSGVO-Artikel) |
| **Anforderungen je Klausel** | **2,03** | **Reg2Req ≈ 1,1** (448 aus 398 Klauseln) |
| Klauseln ohne Anforderung | 42 | — |
| unlesbare Extraktionen | 1 | — |
| aufgeteilt (nicht singulär) | 63 | — |
| nach dem Schnitt weiterhin nicht singulär | 78 | — |
| Systemanforderungen | 290 | — |
| davon nicht implementierungsfrei | 20 | — |

## 4. Maßnahmen

- `measure__dora:art19:c01:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c02:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c03:q1s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c03:q1s5` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c04:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c05:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c05:q1s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c08:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c11:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c04:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c07:q2s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c07:q3s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c07:q5s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c05:q3s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c11:q1s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c13:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c13:q1s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c13:q1s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c14:q1s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c16:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c05:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c05:q1s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c05:q1s4` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c06:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c06:q1s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c06:q1s5` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c07:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c10:q2s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c11:q1s1` — dora + dsgvo · 2 Anforderungen
- `measure__dsgvo:art32:c05:q1s1` — dsgvo + nis2 · 2 Anforderungen
- `measure__dsgvo:art32:c06:q1s1` — dsgvo + nis2 · 2 Anforderungen
- `measure__dsgvo:art33:c07:q2s2` — dsgvo + nis2 · 2 Anforderungen

Paarweise Kandidaten („gemeinsamer Kern", NICHT verkettet): 512.

Zusammenfall auf Anforderungsebene: 0 (erwartete Häufigkeit nahe null — `equal` kam im Experiment vom 2026-08-01 in 120 Fällen null Mal vor).

## Grenzen dieses Laufs

- **Eingefrorenes Fixture statt Live-Korpus.** Neun Artikel, deutscher Wortlaut, aus dem kanonischen Korpus exportiert und eingefroren. Der Adressatenkreis je Artikel ist von Hand mit Zitat erfasst, nicht aus der Typisierung gejoint.
- **Die Zuordnung Handlung → SCF ist unsere Setzung**, nicht die Behauptung des SCF. Sie entscheidet mit, was als wiedergefunden zählt.
- **Ein Adjudikator, wenige Fälle.** Das reicht für einen Entscheid, nicht für ein Produktversprechen.
- **Geurteilt wird Umsetzbarkeit, nicht Rechtmäßigkeit.** Eine gemeinsame Maßnahme entbindet von keiner Rechtsgrundlage.
- Ein negatives Verdikt ist ein **gültiges Ergebnis**. Nachgebessert wird nur, was als Harness-Fehler belegt ist.
