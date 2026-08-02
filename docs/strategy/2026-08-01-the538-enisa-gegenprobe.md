# THE-538 — ENISA als unabhängige Gegenprobe zum SCF

**Datum:** 2026-08-01 · **Vorlauf:** `2026-08-01-the538-scf-durchrechnung.md`

## Erst eine Korrektur

Ich hatte ENISA als Zweitquelle „insbesondere für die dünne DORA-Art.-19-Stelle" vorgeschlagen.
**Das war falsch.** Die ENISA-Mapping-Tabelle enthält keine DORA-Spalte. Ihre Achsen sind
ISO 27001:2022, NIST CSF 2.0, ETSI EN 319 401, CEN/TS 18026:2024 sowie nationale Rahmenwerke
(BE, FI, EL, ES, FR). **Die dünne DORA-Stelle bleibt ungeprüft** — dafür braucht es eine andere Quelle.

Was ENISA sehr wohl kann: die **NIS2-Seite** des SCF unabhängig bestätigen oder widerlegen.

## Der Vergleichsweg

Beide Häuser mappen dieselbe Zwischengröße — die Punkte des **CIR-Annex (EU) 2024/2690**, des
Durchführungsrechts zu NIS2 Art. 21/23:

```
ENISA:  CIR-Punkt  ──────────────────→  ISO 27001:2022 (Klauseln + Annex A)
SCF:    SCF-Kontrolle ──→ CIR-Punkt,  SCF-Kontrolle ──→ ISO 27002:2022
```

Annex A von ISO 27001:2022 ist nummerngleich mit ISO 27002:2022 — die Kontroll-Ebene ist damit direkt
vergleichbar. ISO-27001-Klauseln 4–10 (Managementsystem) bleiben außen vor.

Datei: `ENISA_Technical_Implementation_Guidance_Mapping_table_version_1.2.xlsx` (09/2025),
SHA-256 `b34ce42c46bd643dd3e5bc4aa03c2704fa006fc798946e36753914521d2be59b`, 49 CIR-Punkte.
Im SCF sind 53 CIR-Punkte belegt; **47 Punkte sind beidseitig vergleichbar.**

## Gesamtbild

| | |
| -- | --: |
| vergleichbare CIR-Punkte | 47 |
| **volle Deckung** (SCF enthält alle von ENISA genannten Kontrollen) | **23** |
| teilweise Deckung | 16 |
| keine Deckung | 8 |
| mittlerer Recall auf ENISA | **0,653** |
| mittlerer Jaccard | 0,22 |

Der niedrige Jaccard bei hohem Recall hat einen harmlosen Grund: **das SCF ist breiter.** Wo ENISA für
„Backup management" zwei ISO-Kontrollen nennt, nennt das SCF sieben. Für die Frage „stimmt das SCF mit
einer amtlichen Quelle überein?" ist der Recall die richtige Zahl, nicht der Jaccard.

Punkte ohne jede Deckung: 2.2 Compliance monitoring · **3.3 Event reporting** · 5.2 Directory of
suppliers · 6.1 Security in acquisition · 10.1 Human resources security · 11.4 Administration systems ·
11.7 Multi-factor authentication · 12.5 Deposit/return/deletion of assets.

## Positiv-Kontrolle: **unabhängig bestätigt**

| CIR-Punkt | ENISA (ISO Annex A) | SCF (ISO 27002) | Recall |
| -- | -- | -- | --: |
| **4.1** Business continuity and disaster recovery plan | 5.29, 5.30 | 5.29, 5.30, 8.13, 8.14 | **1,00** |
| **4.2** Backup management | 8.13, 8.14 | 5.2, 5.29, 5.30, 5.33, 8.10, 8.13, 8.14 | **1,00** |

Beide Punkte sind genau das Terrain von NIS2 Art. 21.2(c) — und **BCD-01**, die SCF-Kontrolle, auf der
sich DSGVO Art. 32.1(c) und NIS2 Art. 21.2(c) treffen, sitzt auf beiden.

Damit hat das Positiv-Paar aus THE-438 jetzt **zwei voneinander unabhängige Belege**: das SCF und eine
EU-Agentur, die dieselben ISO-Kontrollen benennt.

## Negativ-Kontrolle: **nicht bestätigt — hier liegt eine echte Divergenz**

| CIR-Punkt | ENISA | SCF | Recall |
| -- | -- | -- | --: |
| 3.5 Incident response | 5.26 | 5.24, 5.25, 5.26, 5.30, 6.8 | 1,00 |
| **3.3 Event reporting** | **6.8** | 5.19, 5.20, 5.21, 5.31, 6.6, 8.21, 8.30 | **0,00** |

ENISA verankert **ISO 6.8 („Information security event reporting") bei CIR 3.3**. Das SCF hat 6.8 zwar —
aber **einen Punkt weiter, bei 3.5 (Incident response)**. Auf 3.3 selbst gibt es keine Überschneidung.

Das trifft ausgerechnet die Achse der Negativ-Kontrolle. `IRO-10 Incident Stakeholder Reporting` — die
**einzige** Kollision zwischen NIS2 Art. 23 und DORA Art. 19 — liegt in genau dieser Region. Das Ergebnis
„nur eine Kollision, Jaccard 0,143" steht damit **auf der Lesart des SCF und ist von ENISA nicht
gestützt**. Es ist nicht widerlegt — ENISA sagt nichts über DORA —, aber es ist auch nicht bestätigt.

## Die beiden Zusatzfunde

| SCF-Kontrolle | CIR-Punkt | ENISA | geteilt | Recall |
| -- | -- | -- | -- | --: |
| **CRY-01** Use of Cryptographic Controls | 9.1 Cryptography | 5.31, 8.24 | 8.24 | 0,50 |
| **RSK-01** Risk Management Program | 2.1 Risk management framework | 5.7, 5.19, 5.20, 5.21 | 5.19 | 0,25 |

CRY-01 ist über ISO 8.24 (Verwendung von Kryptografie) halb bestätigt — der zweite Fund aus dem
SCF-Lauf hält also stand.

RSK-01 ist schwach gedeckt, und der Grund ist bemerkenswert: ENISA belegt „Risk management framework"
mit **Lieferketten- und Threat-Intelligence-Kontrollen** (5.7, 5.19–5.21), das SCF mit risiko-nativen
Kontrollen (5.12, 5.2, 5.8, 5.9, 7.5). Das ist keine Rundungsdifferenz, sondern ein unterschiedliches
Verständnis desselben CIR-Punkts. Für den dritten Fund (DSGVO Art. 32.2 ≙ NIS2 Art. 21.1) heißt das:
**mit Vorbehalt führen.**

## Was das für die Entscheidung ändert

- **Der Katalog-Kandidat SCF hält.** Zwei Drittel Recall gegen eine amtliche Quelle, volle Deckung auf
  der Hälfte aller Punkte, und volle Deckung genau dort, wo der Positiv-Fall liegt.
- **Die Wert-Zahl (16 gesetzesübergreifende Kontrollen) bleibt eine SCF-Zahl.** ENISA kann sie nicht
  stützen, weil ihr die DORA- und DSGVO-Achsen fehlen. Sie ist damit belastbar für die NIS2-Seite und
  unbelegt für den Rest.
- **Zwei der drei Positiv-Funde sind extern gestützt** (BCD-01 voll, CRY-01 halb), einer nicht (RSK-01).
- **Die Negativ-Kontrolle ist der schwächste Punkt der ganzen Kette:** dünne DORA-Abdeckung im SCF
  (eine Kontrolle) und eine Divergenz zwischen den Häusern genau auf der Meldepflicht-Achse. Wenn eine
  Stelle noch geprüft gehört, bevor gebaut wird, dann diese.
- **Offen für die DORA-Seite:** ENISA scheidet aus. Kandidaten wären die ESAs (EBA/ESMA/EIOPA) mit ihren
  RTS zu DORA, oder eine dritte Crosswalk-Quelle. Nicht geprüft.

## Artefakte

`scratchpad/enisa/` — `enisa-mapping-1.2.xlsx`, `enisa_rows.json` (49 CIR-Punkte),
`crosscheck.py`, `enisa_result.json` (alle 47 Punktvergleiche).
