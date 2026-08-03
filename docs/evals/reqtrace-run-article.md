# Senkrechter Schnitt — Klausel → Anforderung → Systemanforderung → Maßnahme (THE-545)

**Verdikt: ❌ trägt nicht** — Positiv-Kontrolle: nur 0 von 5 SCF-Kandidaten wiedergefunden (< 3).

## 1. Positiv-Kontrolle gegen das externe SCF-Gold

| SCF | Gesetze | wiedergefunden durch |
| --- | --- | --- |
| BCD-01 | dsgvo + nis2 | — |
| CRY-01 | dsgvo + nis2 | — |
| GOV-02 | dora + dsgvo *oder* dsgvo + nis2 | — |
| HRS-03 | dora + dsgvo | — |
| RSK-01 | dora + dsgvo *oder* dsgvo + nis2 | — |

**0 von 5** (Schwelle 3).
Keine Maßnahme trifft mehrere Gold-Einträge.

## 2. Negativ-Kontrollen

| Kontrolle | Ergebnis |
| --- | --- |
| mechanisch — NIS2 Art. 23 × DORA Art. 19 durch Verdrängung ausgeschlossen, **bevor** ein Modell befragt wurde | ✅ |
| semantisch — keine Maßnahme vereint verschiedene kanonische Handlungen | ✅ |
| Kanarienvogel — dieselbe Anforderung zweimal ergibt eine Maßnahme | ✅ |

Durch Verdrängung ausgeschlossen: 0 Paar(e). Vom Richter geurteilt: 0.

## 3. Kalibrierung der Extraktion

| Größe | Wert | Referenz |
| --- | --- | --- |
| Artikel · Klauseln | 9 · 9 | — |
| Klauseln je Artikel | 1.0 | Reg2Req ≈ 4,0 (Schnitt über alle DSGVO-Artikel) |
| **Anforderungen je Klausel** | **0,67** | **Reg2Req ≈ 1,1** (448 aus 398 Klauseln) |
| Klauseln ohne Anforderung | 0 | — |
| unlesbare Extraktionen | 8 | — |
| aufgeteilt (nicht singulär) | 2 | — |
| nach dem Schnitt weiterhin nicht singulär | 2 | — |
| Systemanforderungen | 6 | — |
| davon nicht implementierungsfrei | 0 | — |

## 4. Maßnahmen

- keine geteilte Maßnahme entstanden

Paarweise Kandidaten („gemeinsamer Kern", NICHT verkettet): 0.

Zusammenfall auf Anforderungsebene: 0 (erwartete Häufigkeit nahe null — `equal` kam im Experiment vom 2026-08-01 in 120 Fällen null Mal vor).

## Grenzen dieses Laufs

- **Eingefrorenes Fixture statt Live-Korpus.** Neun Artikel, deutscher Wortlaut, aus dem kanonischen Korpus exportiert und eingefroren. Der Adressatenkreis je Artikel ist von Hand mit Zitat erfasst, nicht aus der Typisierung gejoint.
- **Die Zuordnung Handlung → SCF ist unsere Setzung**, nicht die Behauptung des SCF. Sie entscheidet mit, was als wiedergefunden zählt.
- **Ein Adjudikator, wenige Fälle.** Das reicht für einen Entscheid, nicht für ein Produktversprechen.
- **Geurteilt wird Umsetzbarkeit, nicht Rechtmäßigkeit.** Eine gemeinsame Maßnahme entbindet von keiner Rechtsgrundlage.
- Ein negatives Verdikt ist ein **gültiges Ergebnis**. Nachgebessert wird nur, was als Harness-Fehler belegt ist.
