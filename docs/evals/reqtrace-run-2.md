# Senkrechter Schnitt — Klausel → Anforderung → Systemanforderung → Maßnahme (THE-545)

**Verdikt: ❌ trägt nicht** — Negativ-Kontrolle semantisch GERISSEN: eine Maßnahme vereint verschiedene Handlungen.

## 1. Positiv-Kontrolle gegen das externe SCF-Gold

| SCF | Gesetze | wiedergefunden durch |
| --- | --- | --- |
| BCD-01 | dsgvo + nis2 | pair__dsgvo:art24:c01:s1__nis2:art21:c01:s1 |
| CRY-01 | dsgvo + nis2 | pair__dsgvo:art24:c01:s1__nis2:art21:c02:s1 |
| GOV-02 | dora + dsgvo + nis2 | — |
| HRS-03 | dora + dsgvo | measure__dora:art6:c02:s4 |
| RSK-01 | dora + dsgvo + nis2 | — |

**3 von 5** (Schwelle 3).
Keine Maßnahme trifft mehrere Gold-Einträge.

## 2. Negativ-Kontrollen

| Kontrolle | Ergebnis |
| --- | --- |
| mechanisch — NIS2 Art. 23 × DORA Art. 19 durch Verdrängung ausgeschlossen, **bevor** ein Modell befragt wurde | ✅ |
| semantisch — keine Maßnahme vereint verschiedene kanonische Handlungen | ❌ |
| Kanarienvogel — dieselbe Anforderung zweimal ergibt eine Maßnahme | ✅ |

Durch Verdrängung ausgeschlossen: 1144 Paar(e). Vom Richter geurteilt: 980.

## 3. Kalibrierung der Extraktion

| Größe | Wert | Referenz |
| --- | --- | --- |
| Artikel · Klauseln | 9 · 143 | — |
| Klauseln je Artikel | 15.9 | Reg2Req ≈ 4,0 (Schnitt über alle DSGVO-Artikel) |
| **Anforderungen je Klausel** | **2,13** | **Reg2Req ≈ 1,1** (448 aus 398 Klauseln) |
| Klauseln ohne Anforderung | 42 | — |
| unlesbare Extraktionen | 1 | — |
| aufgeteilt (nicht singulär) | 67 | — |
| nach dem Schnitt weiterhin nicht singulär | 73 | — |
| Systemanforderungen | 304 | — |
| davon nicht implementierungsfrei | 23 | — |

## 4. Maßnahmen

- `measure__dora:art19:c01:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c02:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c03:s1` — dora + dsgvo · 3 Anforderungen
- `measure__dora:art19:c03:s4` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c04:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c04:s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c05:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c05:s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art19:c08:s1` — dora · 2 Anforderungen
- `measure__dora:art19:c10:s1` — dora + dsgvo · 3 Anforderungen
- `measure__dora:art19:c13:s1` — dora · 4 Anforderungen
- `measure__dora:art19:c15:s1` — dora · 2 Anforderungen
- `measure__dora:art5:c02:s1` — dora · 4 Anforderungen
- `measure__dora:art5:c04:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c04:s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c04:s4` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art5:c05:s1` — dora · 2 Anforderungen
- `measure__dora:art5:c07:s1` — dora + dsgvo · 7 Anforderungen
- `measure__dora:art5:c08:s1` — dora · 4 Anforderungen
- `measure__dora:art5:c09:s1` — dora · 5 Anforderungen
- `measure__dora:art5:c10:s1` — dora · 2 Anforderungen
- `measure__dora:art5:c11:s1` — dora · 4 Anforderungen
- `measure__dora:art5:c11:s2` — dora · 2 Anforderungen
- `measure__dora:art5:c12:s1` — dora · 2 Anforderungen
- `measure__dora:art6:c01:s1` — dora · 3 Anforderungen
- `measure__dora:art6:c02:s1` — dora · 4 Anforderungen
- `measure__dora:art6:c02:s2` — dora · 4 Anforderungen
- `measure__dora:art6:c02:s3` — dora · 4 Anforderungen
- `measure__dora:art6:c02:s4` — dora + dsgvo · 3 Anforderungen
- `measure__dora:art6:c03:s1` — dora · 2 Anforderungen
- `measure__dora:art6:c04:s1` — dora · 3 Anforderungen
- `measure__dora:art6:c04:s2` — dora · 2 Anforderungen
- `measure__dora:art6:c05:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c06:s1` — dora · 3 Anforderungen
- `measure__dora:art6:c06:s2` — dora · 2 Anforderungen
- `measure__dora:art6:c10:s1` — dora + dsgvo · 3 Anforderungen
- `measure__dora:art6:c13:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c13:s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c13:s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c14:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c14:s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art6:c14:s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c01:s1` — dora + dsgvo · 3 Anforderungen
- `measure__dora:art9:c05:s1` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c05:s2` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c05:s4` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c06:s3` — dora + dsgvo · 2 Anforderungen
- `measure__dora:art9:c10:s1` — dora + dsgvo · 3 Anforderungen
- `measure__dora:art9:c11:s1` — dora + dsgvo · 4 Anforderungen
- `measure__dora:art9:c11:s2` — dora · 2 Anforderungen
- `measure__dora:art9:c11:s3` — dora · 2 Anforderungen
- `measure__dora:art9:c13:s2` — dora · 3 Anforderungen
- `measure__dora:art9:c13:s3` — dora · 3 Anforderungen
- `measure__dsgvo:art32:c05:s5` — dsgvo + nis2 · 2 Anforderungen
- `measure__dsgvo:art33:c09:s3` — dsgvo + nis2 · 2 Anforderungen
- `measure__nis2:art21:c01:s1` — nis2 · 2 Anforderungen
- `measure__nis2:art21:c14:s1` — nis2 · 3 Anforderungen
- `measure__nis2:art21:c14:s2` — nis2 · 2 Anforderungen
- `measure__nis2:art23:c07:s1` — nis2 · 2 Anforderungen
- `measure__nis2:art23:c16:s1` — nis2 · 2 Anforderungen
- `measure__nis2:art23:c17:s1` — nis2 · 3 Anforderungen
- `measure__nis2:art23:c21:s1` — nis2 · 3 Anforderungen
- `measure__nis2:art23:c21:s2` — nis2 · 2 Anforderungen
- `measure__nis2:art23:c22:s1` — nis2 · 2 Anforderungen

Paarweise Kandidaten („gemeinsamer Kern", NICHT verkettet): 675.

Zusammenfall auf Anforderungsebene: 0 (erwartete Häufigkeit nahe null — `equal` kam im Experiment vom 2026-08-01 in 120 Fällen null Mal vor).

## Grenzen dieses Laufs

- **Eingefrorenes Fixture statt Live-Korpus.** Neun Artikel, deutscher Wortlaut, aus dem kanonischen Korpus exportiert und eingefroren. Der Adressatenkreis je Artikel ist von Hand mit Zitat erfasst, nicht aus der Typisierung gejoint.
- **Die Zuordnung Handlung → SCF ist unsere Setzung**, nicht die Behauptung des SCF. Sie entscheidet mit, was als wiedergefunden zählt.
- **Ein Adjudikator, wenige Fälle.** Das reicht für einen Entscheid, nicht für ein Produktversprechen.
- **Geurteilt wird Umsetzbarkeit, nicht Rechtmäßigkeit.** Eine gemeinsame Maßnahme entbindet von keiner Rechtsgrundlage.
- Ein negatives Verdikt ist ein **gültiges Ergebnis**. Nachgebessert wird nur, was als Harness-Fehler belegt ist.
