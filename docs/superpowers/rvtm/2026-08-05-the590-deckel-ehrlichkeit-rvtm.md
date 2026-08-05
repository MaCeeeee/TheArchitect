# RVTM — THE-590 Slice 1: die Ehrlichkeit des Deckels

**Datum:** 2026-08-05 · **Ticket:** [THE-590](https://linear.app/thearchitect/issue/THE-590)
**REQs:** [THE-592](https://linear.app/thearchitect/issue/THE-592) · [THE-593](https://linear.app/thearchitect/issue/THE-593) · [THE-594](https://linear.app/thearchitect/issue/THE-594)
**WSJF:** 72,5 — BV 3 · Risk 4 · Impl 5 · Success 5 · Compliance 3 · ReqRel 4 · Urgency 2 · Status 3 = 29/40

**Ousterhout:** Change Amplification niedrig · Cognitive Load niedrig · Unknown Unknowns
niedrig · Abhängigkeiten niedrig · **Obscurity mittel**

> **Watch-Point:** `candidatePairs` muss ein eigenes Feld sein — `cappedPairs` als
> Kandidatenzähler zu missbrauchen wäre die unausgesprochene Doppeldeutigkeit. **Eingehalten.**

---

## Der Pre-Flight-Fund, der das Ticket umgeschnitten hat

Die im Ticket als „interessanteste Richtung" notierte Empfehlung — *vorfiltern statt kappen,
nur Paare gleicher kanonischer Handlung dem Richter vorlegen* — **war seit THE-545 gebaut**,
`measureGrouping.ts:194–197`. Die 762 Paare aus Lauf 4 sind ihr Ergebnis:

```
290 Anforderungen  ->  41.905 rohe Paare
                   ->   1.839  gleiche Handlung + gesetzesübergreifend + verträgliche Rollen
                   ->     762  nach der Verdrängung
```

Damit fiel die Hauptrichtung weg, und übrig blieb die eigentliche Lücke: **der Deckel ist
ehrlich sichtbar, aber nur als vierte Zahl in einer 10px-Zeile — und erst hinterher.**

Zweiter Fund: Der Kandidatenzähler existierte bereits als `toJudge.length`. Er hatte nur
keinen Namen — erreichbar allein über den Trick `maxJudgedPairs: 0`, der die Zahl als
„gekappt" verkleidet zurückgab.

---

## Anforderungen → Umsetzung → Nachweis

| AC | Umsetzung | Nachweis |
|---|---|---|
| **592.1** `candidatePairs` als eigenes Feld | `GroupingResult.candidatePairs` | Test: 9 Kandidaten bei Deckel 2 |
| **592.2** Bilanz `judged + capped = candidates` | — | **3 Tests**: unter Deckel, ohne Deckel, bei Deckel 0 |
| **592.3** Lesezugriff ohne Richter/Klassifikator | `previewCandidatePairs` + `GET …/harmonization/candidates` | 6 Dienst-Tests · Route `viewer`, kein Rate-Limit |
| **592.4** `needsClassification` ausgewiesen | eigener Zähler in `EnrichStats` | Test: 1 unklassifiziert → Kandidaten 0, Grund benannt |
| **592.5** **Negativ-Kontrolle: null Modellaufrufe** | `ask` ist **optional** — ohne ihn existiert kein Pfad zum Klassifikator | Test mit werfendem Stub |
| **592.6** kein Schreibzugriff | `doc.save()` liegt im unerreichbaren Zweig | Test: unklassifizierte Anforderung bleibt unklassifiziert |
| **593.1** benanntes Auswahlkriterium | `PAIR_SELECTION_ORDER`, exportiert, im Ergebnis | Test auf den Wert |
| **593.2** als *stabil, keine Rangfolge* dokumentiert | Modul-Kommentar mit Begründung | Code-Review |
| **593.3** Determinismus | — | Test: zwei Läufe kappen **dieselben** Paare (Spion vergleicht Marken) |
| **593.4** Kriterium in der Fläche | `SELECTION_ORDER_LABEL` als `Record` über den Union-Typ | Flächen-Test auf „id order" + „not a ranking" |
| **594.1** Warnung über der Liste | `data-testid="incomplete-run"` | Flächen-Test |
| **594.2** **nicht** bei vollständigem Lauf | dieselbe Bedingung, negativ geprüft | Flächen-Test beider Richtungen |
| **594.3** leer-weil-gekappt ≠ gültiges Ergebnis | eigener Zweig `empty-because-capped` | **2 Tests**: gekappt-leer und vollständig-leer |
| **594.4** Vorschau vor dem Lauf in der Fläche | `useEffect` → `candidate-preview` | Test: `propose` wurde **nicht** aufgerufen |

**Testbilanz:** Server **75/75** (4 Suiten) · Client **127/127** (17 Suiten, davon 9 im Panel)

---

## Die Entwurfsentscheidung, die den Kern trägt

Eine Kostenvorschau, die selbst Modellaufrufe auslöst, hebt sich auf. Durchgesetzt wird das
**nicht mit einem Schalter, sondern über die Abhängigkeit**: `buildGroupables` bekommt im
Vorschau-Modus kein `ask` — also existiert kein Codepfad zum Klassifikator und damit auch
keiner zu `doc.save()`.

> Ein boolescher Schalter kann falsch stehen. Eine fehlende Abhängigkeit kann es nicht.

Dieselbe Logik beim Filter: `enumerateCandidatePairs` ist aus `groupIntoMeasures`
herausgelöst, statt in der Vorschau nachgebaut zu werden. Zwei Kopien derselben drei
Bedingungen wären genau das Duplikat, das auseinanderläuft — und dann zeigte die Vorschau
eine Zahl, die der Lauf nie erreicht. Ein Test hält fest, dass Vorschau und Lauf dieselbe
Zahl nennen.

## Nebenbefund, mitbehoben

`50` stand als nacktes Literal an **zwei** Stellen (Dienst-Default und Route-Default), `200`
an einer. Die Vorschau muss den Deckel zeigen, den der Lauf verwendet — zwei Literale, die
auseinanderlaufen, machen aus der Vorschau eine Lüge. Jetzt `DEFAULT_MAX_JUDGED_PAIRS` und
`MAX_ALLOWED_JUDGED_PAIRS`.

## Am echten Bestand gemessen

Projekt `6a705449293587c4708d4f19`, Korpus verbunden:

```
Ketten-Anforderungen        15        105 rohe Paare
davon unklassifiziert        0
Adressat unmappbar           0        ⟵ deckt sich mit THE-591
durch Verdrängung raus       0
KANDIDATEN-PAARE            25        = 23,8 % der rohen
Deckel (Default)            50   →  würde gekappt: 0
```

| Kontrolle | Ergebnis |
|---|---|
| **Schreibt die Vorschau?** | Klassifikationen vorher 15 · nachher 15 → **nein** |
| **Vorschau == Lauf-Pfad?** | 25 = 25, bei **0** Klassifikations-Aufrufen (werfender Stub nie gerufen) → **identisch** |
| **Macht die Vorschau Modellaufrufe?** | **nicht anwendbar** — siehe unten |

### Zwei Messfehler, die dieser Lauf offengelegt hat

**1. Der erste Lauf maß den falschen Pfad.** Er meldete `unmappedAddressee: 1` statt 0 — die
Korpus-Verbindung war nicht abgewartet (`bufferCommands = false`), der Client fing das als
„Korpus nicht erreichbar" ab und fiel still auf das Lexikon zurück. **Derselbe Fehler wie in
der THE-571-Abnahme.** Die Sonde wartet jetzt auf `getCorpusConnection().asPromise()` und
schreibt den Korpus-Status in ihre erste Zeile — ein Lauf, der nicht sagt, auf welchem Pfad
er lief, ist als Beleg wertlos.

**2. Eine Kontrolle bestand, weil es nichts zu prüfen gab.** „Die Vorschau macht keine
Modellaufrufe" lässt sich an diesem Bestand nicht zeigen: 0 Anforderungen sind
unklassifiziert, also hätte auch der teure Pfad nichts zu klassifizieren. Die Sonde führt
das jetzt als **NICHT ANWENDBAR** statt als Häkchen. Belegt ist die Zusage durch den
Dienst-Test mit werfendem Stub — nicht durch diesen Lauf.

## Grenzen — was NICHT gemessen ist

- **Nicht am Klick geprüft.** Bauteil-Tests mit gestubbtem API-Client, kein angemeldeter
  Browser.
- **Der Bestand ist klein.** 15 Anforderungen → 25 Kandidaten, weit unter dem Deckel. Der
  Deckel beißt erst bei Größenordnungen, die lokal nicht vorliegen — die 762 des
  Referenzlaufs stammen aus dem Prüfstand mit 290 Anforderungen. Was der Deckel im Alltag
  bedeutet, bleibt damit hochgerechnet, nicht beobachtet.
- **In Produktion liegen 0 Ketten-Anforderungen** (gemessen THE-577); dort zeigte die
  Vorschau heute nur Nullen.
- **Die Deckelhöhe bleibt unverändert** (Default 50, Maximum 200 gegen 762 nötige Urteile im
  Referenzlauf). Das ist Slice 2 und **blockiert**: die Prämisse „ein ungedeckelter Lauf ist
  bezahlbar" ist ungemessen. Slice 1 macht den Deckel ablesbar, nicht höher.

## Nachvollziehen

```
packages/server$ npx jest src/__tests__/measureGrouping.test.ts src/__tests__/harmonizationProposeDb.test.ts
packages/client$ npx vitest run src/components/compliance/SharedMeasuresPanel.test.tsx
packages/server$ npx ts-node --transpile-only src/scripts/the590-preview-probe.ts [projectId]   # braucht eine laufende Mongo
```
