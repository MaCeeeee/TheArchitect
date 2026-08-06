# RVTM — THE-600: die Kante gilt für das Gesetz, nicht für die Schreibweise

**Datum:** 2026-08-05 · **Tickets:** [THE-600](https://linear.app/thearchitect/issue/THE-600) (Bau) · [THE-602](https://linear.app/thearchitect/issue/THE-602) (Messung)
**WSJF:** 85,0 — BV 4 · **Risk 5** · Impl 5 · Success 5 · Compliance 4 · ReqRel 5 · Urgency 3 · Status 3 = 34/40

**Ousterhout:** alle fünf Dimensionen niedrig — die Zuordnung war bereits Daten, die Grenze
ist eine Funktion.

> **Watch-Point:** Familie aus **einer** benannten Funktion, keine zweite Ableitung.
> **Eingehalten** — `normalizeCorpusSource` ist nach `shared` neben die Kanten gewandert und
> wird von Gate, Gruppierung und Q1 aus derselben Quelle bezogen.

---

## Wie der Pre-Flight das Vorhaben umgeschnitten hat

Angetreten mit „Schlüssel-Normalisierung" (`art.-33` → `art-33`). Davon blieb **nichts**:

| Vorhaben | Verdikt |
|---|---|
| Alt-Schlüssel migrieren | **gestrichen** — steht gegen THE-577 („neu ableiten, nicht umhängen"); Prod-Betroffenheit dort mit **null** gemessen |
| Slug-Normalisierung | **fallengelassen** — die Gold-Schlüssel sind bereits kanonisch (4/4 aufgelöst, Rollen deckungsgleich); der Freitext-Zweig wird seit THE-570 in den Korpus umgeleitet |
| **Werk-Stamm-Blindheit** | **der eigentliche Fund** — dabei aufgefallen, vorher niemandem bekannt |

Der Ertrag des Pre-Flights war hier nicht die Freigabe, sondern die **Streichung von zwei
Dritteln des Vorhabens** — und ein Fehler, der ohne ihn nicht gefunden worden wäre.

---

## Anforderungen → Umsetzung → Nachweis

| AC | Umsetzung | Nachweis |
|---|---|---|
| **1** `dora-de × nis2-de` vor jedem Urteil ausgeschlossen | `evaluateDisplacement` rechnet auf Familien | Test mit **werfendem** Richter — sieht er das Paar, bricht der Lauf |
| **2** alle vier Stamm-Kombinationen; `dora × nis2` unverändert | dieselbe Normalisierung beidseitig | 3 Gate-Tests + Regression |
| **3** `nis2 × nis2-de` ist kein Kandidat | Cross-Law-Filter auf Familien | Test: `candidatePairs 0`, **keine** Verdrängungs-Meldung, `judged 0` |
| **4** `measure.laws` zählt Familien | `normalizeCorpusSource` in der Maßnahmen-Bildung | Test: `['dsgvo','nis2']` statt `['dsgvo','nis2-de']` |
| **5** eine Quelle für die Familie | Funktion nach `shared` verschoben, `legalApplicability` reicht sie durch | Code-Review · 110 Tests grün |
| **6** **Negativ-Kontrolle am Bestand** | — | `the600-family-pairs-probe`: **25 → 13**, entfallen 12, alle `nis2 × nis2-de`, **null neu** |

**Testbilanz:** 110/110 über sechs berührte Suiten · `tsc` sauber

### Warum die Negativ-Kontrolle paar-genau ist

„Weniger Kandidaten" wäre kein Beleg — ein Filter, der zu viel wegschneidet, sähe genauso
aus. Die Sonde vergleicht deshalb **Paar-Identitäten**, nicht Anzahlen, und beantwortet zwei
getrennte Fragen: entsteht etwas Neues (nein), und ist jedes Entfallene ein
Gleiche-Familie-Paar (ja, 12 von 12).

---

## Die Messung (THE-602)

**Schwelle vorab: ≥ 4 von 5. Ergebnis: 4 von 5 — gehalten.** Bei **null** Modellaufrufen.

Beide zuvor verlorenen Gold-Einträge saßen auf `dsgvo:art-32`; der Korpus liefert dort
`controller`, unabhängig von der Paraphrase. Damit fallen beide Fehlerquellen weg — das zu
generische „Unternehmen" (BCD-01) und die Zweideutigkeit, die THE-588 zu Recht verwarf
(RSK-01).

Dass die Messung **nichts** kostet, ist kein Nebeneffekt, sondern die Folge von THE-591: wo
der Korpus typisiert auflöst, erreicht die Extraktion die Adressaten-Achse nicht mehr. Am
03.08. kostete dieselbe Frage 17 Aufrufe.

### Ein Sondenfehler, offengelegt

Der erste Entwurf prüfte auch die Handlungs-Gleichheit — mit `actionId`s, die ich aus
`ACTION_TO_SCF` **konstruiert** hatte, weil Lauf 4 die tatsächlich zugewiesenen nicht in den
Bericht schreibt (`sysReqActions` existiert nur zur Laufzeit). Ergebnis: CRY-01 fälschlich als
verloren, 3/5 statt 4/5.

Auffällig wurde es nur, weil der Prüfstand CRY-01 als Paar geführt hatte — dort mussten die
Handlungen also gleich gewesen sein. Die Sonde prüft die Achse jetzt gar nicht: sie ist auf
beiden Pfaden dieselbe und wird ausdrücklich **geerbt**, nicht nachgebaut.

---

## Der Befund hinter dem Befund

Zweimal in drei Tagen dieselbe Lücke an verschiedenen Achsen:

| | Prüfstand | Produkt | gefunden |
|---|---|---|---|
| Adressatenklasse | `article.addresseeClass` (kuratiert) | aus Freitext abgeleitet | 03.08. (THE-589/591) |
| Werk-Stamm | `'nis2'` (Fixture) | `'nis2-de'` (Korpus-Schlüssel) | 05.08. (THE-600) |

**Jede Fixture-Annotation, die im Produkt aus Daten kommt, ist ein Verdachtsfall.** Das ist
keine Beobachtung mehr, sondern eine Eigenschaft der Bauweise — und der Grund, warum
Prüfstand-Grün allein kein Produkt-Beleg ist.

## Grenzen

- **Zwei Achsen gemessen, eine geerbt** (Handlung). Siehe oben.
- **Eine Beobachtung** der Transformation (03.08.), keine Verteilung.
- **Nicht am Klick geprüft** — Dienst-Ebene, Bauteil-Tests, Messung am echten Bestand.
- **Kein Prod-Bezug:** Produktion trägt 0 Ketten-Anforderungen (THE-577). Der Fix schützt
  einen Pfad, der dort noch nicht läuft — er ist Vorsorge, nicht Reparatur.

## Nachvollziehen

```
packages/server$ npx jest src/__tests__/displacementGateSvc.test.ts src/__tests__/measureGrouping.test.ts
packages/server$ npx ts-node --transpile-only -r dotenv/config src/scripts/the600-family-pairs-probe.ts
packages/server$ npx ts-node --transpile-only -r dotenv/config src/scripts/the602-gold-productpath-probe.ts
```
