# THE-538 — die vier DoD-Punkte gegen einen fertigen Kontroll-Katalog gerechnet

**Datum:** 2026-08-01 · **Ticket:** THE-538 · **Vorlauf:** THE-539 (Zero-Shot-Gegenprobe)

## Warum ohne Eigenbau

Das Ticket wollte einen gesetzesneutralen Kontroll-Katalog *auswählen oder verwerfen*. Es gibt einen,
der frei, maschinenlesbar und für genau unsere drei Rechtsakte gepflegt ist:

**Secure Controls Framework (SCF) 2026.2** — 1.534 Kontrollen, 372 Mapping-Spalten,
je Kontrolle die zitierten Artikel aus DSGVO, NIS2, DORA, ISO 27001/27002 und ~200 weiteren.
Bezug: GitHub-Release, ohne Formular. Lizenz **CC BY-ND 4.0** (Namensnennung ja, keine Derivate).
Mapping-Methodik seit 2024: NIST IR 8477 Set Theory Relationship Mapping.
SHA-256 der geprüften Datei: `9e0a4df4993726c95e636f04b3028d8b5edeba2bda45d16ed6722b13540e6835`.

Abdeckung im Messumfang: **alle 21 Artikel** der Erstmessung sind im SCF zitiert, keine Lücke.
Kontrollen mit mindestens einem Zitat: DSGVO 42 · NIS2 68 · DORA 102.

## Punkt 2 — Positiv-Kontrolle: **bestanden**

> Bilden DSGVO Art. 32 und NIS2 Art. 21 auf denselben Katalog-Eintrag ab?

**Ja, auf drei Kontrollen** — und zwar auf Unterabsatz-Ebene, nicht auf Artikel-Ebene:

| SCF-Kontrolle | DSGVO | NIS2 |
| -- | -- | -- |
| **BCD-01** Business Continuity Management System | Art. 32.1(c) | Art. 21.2(c) |
| **CRY-01** Use of Cryptographic Controls | Art. 32.1(a) | Art. 21.2(h) |
| **RSK-01** Risk Management Program | Art. 32.2 | Art. 21.1, 21.2(a)(d)(f) |

BCD-01 ist exakt das bekannte Positiv-Paar (Backup/Wiederherstellung). **CRY-01 und RSK-01 sind neu** —
sie standen in keinem Top-30 von Jaccard oder der Encoder aus THE-539.

Das ist das Kriterium, an dem der Katalog sich messen lassen musste: Er findet nicht nur den bekannten
Fall wieder, er **erhöht die Menge**.

## Punkt 3 — Negativ-Kontrolle: **bestanden, mit einer Einschränkung**

> Landen NIS2 Art. 23 und DORA Art. 19 (Meldepflichten) auf verschiedenen Einträgen?

| | |
| -- | -- |
| Kontrollen mit NIS2 Art. 23 | 7 |
| Kontrollen mit DORA Art. 19 | 1 |
| **Kollisionen** | **1** — `IRO-10 Incident Stakeholder Reporting` |
| Jaccard der Kontroll-Mengen | 0,143 |

Der Katalog legt die beiden **nicht** zusammen. Er sagt: eine geteilte Mechanik (Meldung an Stakeholder),
sechs weitere NIS2-Kontrollen ohne DORA-Entsprechung. Das ist die differenzierte Antwort, die **kein**
Ähnlichkeitsmaß geliefert hat — bei Jaccard *und* beim Encoder stand dieses Paar auf Rang 1, als wäre es
identisch.

**Einschränkung:** DORA Art. 19 ist auf nur *eine* Kontrolle gemappt. Der Test ist auf der DORA-Seite
also dünn — er kann eine unvollständige Pflege nicht von einer semantischen Aussage unterscheiden.

## Punkt 4 — Wert-Zahl

Kontrollen, die Artikel aus **mehr als einem** der drei Rechtsakte tragen:

| Ausschnitt | Kontrollen mit ≥1 Gesetz | davon gesetzesübergreifend | alle drei |
| -- | --: | --: | --: |
| Artikel der Erstmessung (21 Artikel) | 111 | **16 (14,4 %)** | 3 |
| alle im SCF zitierten Artikel | 167 | **41 (24,6 %)** | 4 |

Die 16 im Messumfang:

| SCF | Kontrolle | Gesetze |
| -- | -- | -- |
| GOV-02 | Publishing Security, Compliance & Resilience Documentation | DORA 6,9 · DSGVO 24 · NIS2 21 |
| IRO-10 | Incident Stakeholder Reporting | DORA 19 · DSGVO 34 · NIS2 23 |
| RSK-01 | Risk Management Program | DORA 6 · DSGVO 32 · NIS2 21 |
| GOV-01 | Security, Compliance & Resilience Program | DORA 5,9 · NIS2 21 |
| GOV-01.1 | Steering Committee & Program Oversight | DORA 5 · NIS2 21 |
| GOV-15 | Operationalizing Security, Compliance & Resilience | DORA 9 · NIS2 21 |
| BCD-01 | Business Continuity Management System | DSGVO 32 · NIS2 21 |
| CPL-01 | Statutory, Regulatory & Contractual Compliance | DORA 5 · NIS2 21 |
| CFG-02 | Secure Baseline Configurations | DORA 9 · NIS2 21 |
| CRY-01 | Use of Cryptographic Controls | DSGVO 32 · NIS2 21 |
| HRS-03 | Defined Roles & Responsibilities | DORA 5 · DSGVO 32 |
| IAC-01 | Identity & Access Management | DORA 9 · NIS2 21 |
| IRO-01 | Incident Response Operations | DORA 9,17 · NIS2 21,23 |
| IRO-02 | Incident Handling | DORA 9 · NIS2 21,23 |
| SEA-01 | Secure Engineering Principles | DORA 9 · NIS2 21 |
| VPM-01 | Vulnerability & Patch Management Program | DORA 9 · NIS2 21 |

## Der eigentliche Befund

Der paarweise Vergleich fand **1** harmonisierbares Paar in 11.430 Paaren. Der Katalog liefert im selben
Artikel-Ausschnitt **16 Konvergenzpunkte**, über alle Artikel 41.

Wichtig für die Ehrlichkeit der Zahl: **ein Konvergenzpunkt ist kein verifiziertes Pflichtenpaar.**
IRO-10 beweist es — der Richter hat NIS2 Art. 23 ≙ DORA Art. 19 korrekt abgelehnt, obwohl beide auf
IRO-10 zeigen. Die 16 sind **Kandidaten**, keine Treffer.

Genau das ist aber der Wert: Die Aufgabe wechselt von *„eine Nadel in 11.430 Paaren finden"* zu
*„16 Kandidaten adjudizieren"*. Das ist menschenmögliche Arbeit — und der LLM-Richter kann davor
noch aussieben.

## Warum der Katalog kann, was der Encoder nicht kann

Der Katalog zitiert **Unterabsätze** (Art. 32.1(c) ↔ Art. 21.2(c)). Seine Einheit ist die *Maßnahme*.
REQGENs Einheit ist *Artikel ÷ feste 10* — sie entsteht aus der Gliederung des Quellartikels und der
Extraktionsquote, nicht aus der Maßnahme. Beide Granularitäten sind artikel-verankert, die des Katalogs
ist es nicht.

Das löst die Frage aus THE-539 Schritt 2 auf, ohne sie zu messen: Nicht das Ranking war das Problem,
sondern die **Einheit**, die verglichen wurde.

## Konsequenz

- **Katalog-Kandidat gewählt: SCF.** Positiv- und Negativ-Kontrolle bestanden, Abdeckung vollständig,
  Bezug ohne Vertrag, Pflege quartalsweise durch Dritte.
- **Lizenz ist die offene Frage, nicht die Eignung.** CC BY-ND erlaubt Nutzung und Namensnennung, aber
  keine Derivate. Als Evaluations-Gold und interne Referenz unproblematisch; ein abgeleiteter Katalog
  im ausgelieferten Produkt braucht eine Klärung mit der SCF-Organisation. **Das gehört entschieden,
  bevor jemand baut.**
- **THE-438 lebt wieder**, aber mit anderem Zuschnitt: nicht Cluster über Ähnlichkeit, sondern
  Klassifikation Pflicht → Katalog-Eintrag, mit `legalBases[]` als Nebenprodukt. REQ-REQHARM-001.2
  wird ersetzt, nicht behalten — anders als nach THE-539 allein noch angenommen.
- **Zweitquelle für die NIS2-Seite:** ENISA Technical Implementation Guidance (Mapping-Tabelle v1.2,
  09/2025) mappt NIS2 auf ISO 27001:2022 / 27002 / NIST CSF 2.0. Noch nicht gegengeprüft.

## Artefakte

`scratchpad/scf/` — `scf-2026-2.xlsx` (Original), `scf_rows.json` (1.534 Kontrollen, extrahiert),
`analyse.py`, `scf_result.json`. Scratchpad ist flüchtig; die Zahlen oben sind der dauerhafte Beleg.
