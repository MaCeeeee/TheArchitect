# THE-538 — die Meldepflicht-Stelle, gegen die DORA-Level-2-Rechtsakte geprüft

**Datum:** 2026-08-01 · **Vorlauf:** SCF-Durchrechnung + ENISA-Gegenprobe (beide 2026-08-01)

Die ENISA-Gegenprobe hatte die Negativ-Kontrolle als schwächste Stelle der Kette markiert: dünne
DORA-Abdeckung im SCF (eine Kontrolle) und eine Divergenz zwischen den Häusern genau auf der
Meldepflicht-Achse. Diese Stelle ist jetzt gegen die Primärquellen geprüft.

## Quellen

| Rechtsakt | Rolle |
| -- | -- |
| Verordnung (EU) 2022/2554 (DORA), Art. 1(2), 19 | Level 1 — Meldepflicht und Verhältnis zu NIS2 |
| Richtlinie (EU) 2022/2555 (NIS2), Art. 4, 23, ErwG 28, 102 | Level 1 — Meldepflicht und Sektor-Vorrang |
| Delegierte VO (EU) 2025/301, Art. 5 | RTS — Inhalt und Fristen der DORA-Meldungen |
| Durchführungs-VO (EU) 2025/302 | ITS — Formulare, Templates, XML-Verfahren |
| Delegierte VO (EU) 2024/1772 | RTS — Klassifizierung „schwerwiegender" Vorfälle |

## Befund 1: Die beiden Pflichten schließen einander aus

**DORA Art. 1(2)** sagt wörtlich, die Verordnung sei *lex specialis* zur NIS2-Richtlinie (ErwG 16).

**NIS2 Art. 4** und **ErwG 28** ziehen die Konsequenz: Enthält ein sektorspezifischer Unionsrechtsakt
mindestens gleichwertige Bestimmungen, gelten die NIS2-Vorschriften zu Risikomanagement und
Meldepflichten **nicht**. ErwG 28 nennt DORA ausdrücklich und stellt fest, die Mitgliedstaaten sollten
diese NIS2-Bestimmungen auf Finanzunternehmen unter DORA **nicht anwenden**.

> Für ein und denselben Adressaten können NIS2 Art. 23 und DORA Art. 19 **nie gleichzeitig gelten**.

Das ist eine stärkere Aussage als die des LLM-Richters („verschiedene Adressaten, Fristen, Schutzgüter").
Es sind nicht zwei Pflichten, die sich unterscheiden — es ist **eine Pflicht in zwei einander
ausschließenden Regimen**, je nachdem, in welchen Sektor der Adressat fällt.

Die Frage „erfüllt eine Umsetzung beide?" ist damit für diese Paarung nicht *falsch*, sondern
**gegenstandslos**.

## Befund 2: Auch die Mechanik unterscheidet sich, nicht nur das Regime

| | NIS2 Art. 23 | DORA Art. 19 + RTS 2025/301 Art. 5 |
| -- | -- | -- |
| Empfänger | CSIRT bzw. zuständige Behörde, plus zentrale Anlaufstelle | zuständige Finanzaufsicht; bei bedeutenden Instituten Weiterleitung an die EZB |
| Auslöser | „erheblicher Sicherheitsvorfall" | „schwerwiegender IKT-Vorfall" nach Klassifizierung gem. DelVO 2024/1772 |
| Stufe 1 | Frühwarnung ≤ **24 h** ab Kenntnis | Erstmeldung ≤ **4 h** ab Einstufung als schwerwiegend, spätestens ≤ 24 h ab Kenntnis |
| Stufe 2 | Meldung ≤ **72 h ab Kenntnis** | Zwischenbericht ≤ **72 h ab Erstmeldung** |
| Stufe 3 | Abschlussbericht ≤ **1 Monat ab Meldung** | Abschlussbericht ≤ **1 Monat ab (letztem) Zwischenbericht** |
| Format | national geregelt | XML-Templates nach ITS 2025/302 über das Portal der Behörde |

Die Fristen sehen ähnlich aus und sind es nicht: NIS2 zählt durchgehend **ab Kenntnis**, DORA ab der
**jeweils vorangegangenen Meldung**. Ein System, das eine Frist für beide berechnet, rechnet für eine
der beiden falsch.

## Befund 3: Der Katalog fällt an dieser Stelle durch — schwerer als gedacht

`IRO-10 Incident Stakeholder Reporting` war die einzige Kollision zwischen NIS2 Art. 23 und DORA Art. 19.
Ein Blick in die Zelle zeigt, dass dort **drei** Meldepflichten zusammenliegen:

| Zitiert in IRO-10 | Meldung an | |
| -- | -- | -- |
| NIS2 Art. 23.1–23.4 | CSIRT / zuständige Behörde | Behörde |
| DORA Art. 14, 19.1–19.5, 45.3 | Finanzaufsicht → EZB | andere Behörde |
| **DSGVO Art. 34.1, 34.2** | **die betroffene Person** | **keine Behörde** |

DSGVO Art. 34 ist die Benachrichtigung der *betroffenen Person* — kein Aufsichtsweg, sondern ein
Individualrecht. Der Katalog verdichtet damit drei Pflichten mit drei verschiedenen Empfängerklassen
zu einer Fähigkeit.

Für einen Produkt-Katalog ist das legitim: „Vorfall an Stakeholder melden" ist eine Fähigkeit, die man
einmal baut. **Für Harmonisierung im Sinne von THE-438 ist es falsch** — „einmal erfüllt, mehrfach
nachgewiesen" gilt hier gerade nicht.

Die Negativ-Kontrolle ist damit **nicht bestanden**. Der grobe Test (7 Kontrollen gegen 1, eine Kollision,
Jaccard 0,143) hatte sie durchgewinkt; die eine Kollision ist die falsche.

## Befund 4: Die Wert-Zahl schrumpft von 16 auf 6

Wenn NIS2 und DORA beim selben Adressaten nie zusammentreffen, ist jede Kontrolle, die **nur** diese
beiden trägt, als Harmonisierungs-Kandidat gegenstandslos.

| | |
| -- | --: |
| gesetzesübergreifende Kontrollen im Messumfang | 16 |
| davon **nur** NIS2 × DORA → durch lex specialis gegenstandslos | **10** |
| **echte Kandidaten** | **6** |

Die gegenstandslosen zehn: CFG-02, CPL-01, GOV-01, GOV-01.1, GOV-15, IAC-01, IRO-01, IRO-02, SEA-01, VPM-01.

Die sechs echten — und **alle** enthalten die DSGVO, also das Regelwerk, das *zusätzlich* gilt statt
verdrängt zu werden:

| SCF | Kontrolle | Gesetze | echte Paare |
| -- | -- | -- | -- |
| BCD-01 | Business Continuity Management System | DSGVO 32 + NIS2 21 | DSGVO×NIS2 |
| CRY-01 | Use of Cryptographic Controls | DSGVO 32 + NIS2 21 | DSGVO×NIS2 |
| GOV-02 | Publishing Security, Compliance & Resilience Doc. | DORA 6,9 + DSGVO 24 + NIS2 21 | DORA×DSGVO, DSGVO×NIS2 |
| HRS-03 | Defined Roles & Responsibilities | DORA 5 + DSGVO 32 | DORA×DSGVO |
| IRO-10 | Incident Stakeholder Reporting | DORA 19 + DSGVO 34 + NIS2 23 | (siehe Befund 3 — untauglich) |
| RSK-01 | Risk Management Program | DORA 6 + DSGVO 32 + NIS2 21 | DORA×DSGVO, DSGVO×NIS2 |

Zieht man IRO-10 als widerlegt ab, bleiben **fünf**.

## Was das für die Entscheidung heißt

- **Der Katalog bleibt der richtige Träger**, aber er ist **adressaten-blind**. Ein Kontroll-Katalog kennt
  Fähigkeiten, keine Anwendungsbereiche. Genau daran scheitert die Negativ-Kontrolle.
- **Neue Pflicht-Anforderung für THE-438:** `legalBases[]` braucht zwei Dimensionen, die im Ticket bisher
  fehlen — **(a) Adressatenkreis** (auf wen die Norm anwendbar ist) und **(b) Ausschluss-Relation**
  (lex specialis / Verdrängung). Ohne sie erzeugt „eine Pflicht, N Rechtsgrundlagen, 1× erfüllt"
  rechtlich falsche Aussagen, und zwar systematisch: bei 10 von 16 Kandidaten.
- **Die Wert-Zahl für THE-438 ist 5 bis 6, nicht 16 und nicht 41.** Sie liegt damit wieder in der
  Größenordnung, die der paarweise Vergleich nahegelegt hatte — nur mit belastbarer Herleitung statt
  mit einem Zufallstreffer.
- **Nicht geprüft:** ob dieselbe Verdrängungslogik zwischen DSGVO und den beiden anderen greift. Nach
  DORA ErwG 16 und NIS2 Art. 4 spricht nichts dafür — die DSGVO wird nicht verdrängt, sie gilt daneben.
  Das ist der Grund, warum ausgerechnet die DSGVO-Paarungen übrig bleiben.

## Artefakte

`scratchpad/scf/` — Auszählung unter Lex-specialis-Filter. Primärquellen über EUR-Lex
(CELEX 32022R2554, 32022L2555, 32025R0301, 32025R0302, 32024R1772).
