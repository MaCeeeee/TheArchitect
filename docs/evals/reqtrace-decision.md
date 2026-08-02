# THE-545 — Entscheidung: trägt die Anforderungskette?

**Datum:** 2026-08-02 · **Adjudikator:** Matthias Ganzmann (Systems Engineer / Enterprise Architect)
**Rahmen:** ADR-0007 · **Belege:** `reqtrace-run-4.md/.json`, `reqtrace-run-3-rescore.md`, `reqtrace-human-adjudication.json`

---

## Verdikt: **trägt — mit einer benannten Auflage**

Die Kette Klausel → Stakeholder-Anforderung → Systemanforderung → Maßnahme funktioniert.
Der **Schlüssel, auf dem harmonisiert wird, ist unvollständig** — und zwar um einen Teil, den
die Enterprise-Architektur seit Jahrzehnten benennt und den unser Datenmodell nicht führt.

| Tor | Ergebnis |
| --- | --- |
| **Tor 1 — maschinell** (Lauf 4) | ✅ 4/5 Gold, alle drei Kontrollen, Granularität im Fenster |
| **Tor 2 — menschlich** (32 Maßnahmen, Capability-Linse) | **22 ja / 10 nein / 0 unsicher = 68,8 %** |

---

## 1. Was die Maschine sagt (Lauf 4)

| Größe | Wert |
| --- | --- |
| Positiv-Kontrolle gegen das externe SCF-Gold | **4 von 5** (Schwelle 3) — offen: HRS-03 |
| Negativ mechanisch — DORA verdrängt NIS2 vor jedem Modellaufruf | ✅ 1077 Paare ausgeschlossen |
| Negativ semantisch — keine Maßnahme vereint zwei Handlungen | ✅ |
| Kanarienvogel | ✅ |
| Anforderungen je Klausel | 2,03 (Fenster 0,5–3; Reg2Req ≈ 1,1) |
| Integrität | 0 Id-Kollisionen (290/290), 0 gedeckelte Paare, größte Maßnahme 2 |

**Konvergenz aus zwei unabhängigen Durchgängen:** Die Nachrechnung von Lauf 3 (fremde
Gruppierung, zweite Klassifikation) und Lauf 4 (alles frisch) kommen beide auf 4/5 und
verfehlen beide HRS-03 — bei unterschiedlichen Treffer-Kandidaten im Detail. Die Quote ist
stabiler als die einzelne Zuordnung.

---

## 2. Was der Mensch sagt — und mit welcher Linse

Der Adjudikator hat die Frage *„Ist das eine Maßnahme, die man einmal baut?"* nach
**Business Capabilities** beantwortet. Das war nicht abgesprochen, und es ist die schärfere
Lesart: sie deckt sich mit dem, was die Literatur unter einer Capability versteht —

> „A capability is a composition of elements … to be managed and developed together as a
> **single, autonomous unit**."
> — Hosiaisluoma, *ArchiMate Cookbook* §8.2.9

> „a capability is **unambiguous (no overlaps)**, and relatively stable by its nature"
> — ebd. §2.2.4

Die Frage im Arbeitsblatt war damit, ohne dass wir es so genannt hätten, ein
**Capability-Test**. Ergebnis: **22 von 32 (68,8 %)**.

Aufteilung nach Gesetzespaar: `dora+dsgvo` 19 ja / 10 nein · `dsgvo+nis2` 3 ja / 0 nein.

---

## 3. Der Befund: unser Schlüssel ist ein Verb, eine Capability ist Substantiv + Verb

**Alle zehn Ablehnungen teilen ein Merkmal.** Sie paaren dieselbe kanonische **Handlung**
mit einem **anderen Gegenstand**:

| Maßnahme | Anforderung A | Anforderung B | Handlung (identisch) |
| --- | --- | --- | --- |
| `dora:art19:c02` | IKT-Vorfall der Behörde melden | Begründung der Fristüberschreitung dokumentieren | `vorfall-melden-behoerde` |
| `dora:art19:c05:q1s2` | Erst-/Folgemeldungen bereitstellen | Behebungsmaßnahmen beschreiben | `vorfall-melden-behoerde` |
| `dora:art19:c08` | Cyberbedrohung melden | Behebungs-Dokumentation bereitstellen | `vorfall-melden-behoerde` |
| `dora:art5:c07:q2s1` | Geschäftsfortführungs-Maßnahmen überprüfen | personenbezogene Daten wiederherstellen | `betriebskontinuitaet` |
| `dora:art9:c05:q1s3` | kritische Daten und Systeme schützen | Rechte und Freiheiten betroffener Personen schützen | `technisch-organisatorische-massnahmen` |
| … 5 weitere mit demselben Muster | | | |

Der Kontrast zu den angenommenen Fällen ist scharf: `dora:art19:c01` paart
„IKT-Vorfälle melden" mit „Datenschutzverletzungen melden" — verschiedene Rechtsakte,
**derselbe Gegenstand** (ein meldepflichtiger Vorfall). Angenommen.

Die Enterprise-Architektur benennt genau diese Struktur:

> „The naming convention involves expressing the business capability in a **noun-verb**
> format … The noun part of the business capability is a unique **business object** — a
> single, persistent thing that is of interest to the business."
> — TOGAF® Series Guide *Business Capability Planning* (G233, 2023) §6.1.1

**Unser Slot-Modell führt keinen Gegenstand.** [`packages/shared/src/obligations/slots.ts:90`](../../packages/shared/src/obligations/slots.ts#L90):

```
handlung    — das Verb
empfaenger  — an WEN zu leisten ist (Behörde, betroffene Person) …
modalitaet  — … NICHT, woran gehandelt wird
bedingung   — Frist, Schwelle, Auslöser
```

`empfaenger` ist der Adressat der Leistung, nicht ihr Objekt. Der Harmonisierungs-Schlüssel
besteht damit aus der **Hälfte** eines Capability-Namens — dem Verb. Dass er über-verschmilzt,
ist keine Modell-Schwäche im Urteil, sondern eine **fehlende Dimension im Datenmodell**.

### Ehrlichkeit zur Herkunft dieses Befunds

Diese Erklärung ist **nach** Kenntnis der zehn Ablehnungen entstanden. Sie erklärt alle zehn,
aber sie ist damit **nicht geprüft** — eine Hypothese, die zu den Daten passt, aus denen sie
stammt, belegt nichts. Ihr Test gehört in ein eigenes Ticket: Gegenstands-Slot einführen,
Gruppierung auf `(Gegenstand, Handlung)` schlüsseln, **blind** gegen neue Fälle adjudizieren.
Erst wenn die Zustimmung dort steigt, ist der Befund belegt.

---

## 4. Eigene Fehler in diesem Ticket

Vier, alle in der Konstruktion, keiner im Ergebnis:

1. **Unerreichbare Schwelle.** GOV-02 und RSK-01 verlangten laut SCF drei Gesetze; die
   dora–nis2-Kante wird immer verdrängt, also war das Maximum 3/5 bei einer Schwelle von 3.
   Eine Vorabfrage *„kann dieser Test überhaupt bestehen?"* hätte es gezeigt. Korrigiert
   über `lawSets`, offen im Quelltext ausgewiesen.
2. **Nicht nachrechenbares Ergebnisformat.** `sysReqActions` fehlte; eine Gold-Korrektur ließ
   sich an Lauf 3 nicht prüfen. Behoben, plus `reqtrace:rescore`.
3. **Kein vorab gesetzter Schwellenwert für das menschliche Tor.** Die Abbruchbedingungen
   in THE-545 decken nur die Maschine ab. 68,8 % sind deshalb **eine Zahl, kein Bestehen
   und kein Durchfallen** — sie nachträglich als das eine oder andere zu deklarieren wäre
   genau die Nachbesserung, die dieses Ticket ausschließt.
4. **Capability-Linse nicht vorgesehen.** Der schärfste Befund dieses Laufs kam aus einer
   Betrachtungsweise, die im Ticket nicht stand. Dass sie fehlte, ist der Grund, warum wir
   ihn erst am Tor gefunden haben statt beim Entwurf.

---

## 5. Grenzen

- Neun Artikel, eingefrorenes Fixture, deutscher Wortlaut. Adressatenkreis von Hand erfasst.
- Die Zuordnung Handlung → SCF ist **unsere Setzung**, nicht die Behauptung des SCF.
- Ein Adjudikator, 32 Fälle. Reicht für einen Entscheid, nicht für ein Produktversprechen.
- Geurteilt wird **Umsetzbarkeit, nicht Rechtmäßigkeit**. Eine gemeinsame Maßnahme entbindet
  von keiner Rechtsgrundlage.

---

## 6. Konsequenzen

| # | Konsequenz |
| --- | --- |
| K1 | **THE-546 wird entblockt.** Die Kette trägt; der Befund ist ein Schlüssel-Defekt, kein Ketten-Defekt. |
| K2 | **Neues Ticket: Gegenstands-Slot.** `ObligationSlots` um den Gegenstand erweitern, Gruppierung auf `(Gegenstand, Handlung)` schlüsseln — der Capability-Name nach TOGAF G233 §6.1.1. Muss **blind** gegen neue Fälle geprüft werden. |
| K3 | **ADR-0007 E4 präzisieren:** harmonisiert wird auf der Ebene der **Capability** (Substantiv + Verb), nicht der Handlung (Verb). Die Maßnahme ist die Instanziierung. |
| K4 | **HRS-03 bleibt offen** — zweimal unabhängig nicht gefunden. Als Befund vermerkt, nicht als Aufgabe. |
| K5 | **Adjudikations-Rohdaten liegen im Repo** (`reqtrace-human-adjudication.json`) — das nächste Tor misst gegen dieselben 32 Fälle. |
