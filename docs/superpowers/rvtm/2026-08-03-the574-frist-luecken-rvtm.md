# RVTM — THE-574: Die Frist erreicht die Lücken-Ansicht

**Datum:** 2026-08-03 · **Ticket:** [THE-574](https://linear.app/thearchitect/issue/THE-574)
**Herkunft:** Abnahme [THE-571](https://linear.app/thearchitect/issue/THE-571), Frage 5
**WSJF:** 77,5 — BV 4 · Risk 3 · Impl 5 · Success 5 · Compliance 4 · ReqRel 4 · Urgency 3 · Status 3

**Ousterhout:** alle Symptome niedrig · **Watch-Point: die Versuchung, über Uhren hinweg zu sortieren.**

---

## Der Anlass

Die Fristen sind erhoben, strukturiert und mit belegter Quelle versehen — **13 von 15**
Stakeholder-Anforderungen tragen eine. In der Lücken-Ansicht kamen sie nur noch als Fließtext
in der Beschreibung an. **Bei einer Meldepflicht IST die Uhr das Handlungsrelevante**; sie
fiel genau dort heraus, wo gehandelt wird.

---

## Der Pre-Flight-Fund, der die dritte Anforderung umgeschnitten hat

Das Ticket verlangte „sortiert **oder** markiert nach Dringlichkeit". Die naheliegende
Sortierung nach Stundenwert wäre falsch gewesen — im geteilten Fristmodul steht die
Entscheidung aus [THE-549](https://linear.app/thearchitect/issue/THE-549) ausdrücklich:

> **ES GIBT ABSICHTLICH KEINE FUNKTION**, die über Bezugspunkte hinweg ein einzelnes Minimum
> bildet. „4 h ab Einstufung" und „72 h ab Kenntnis" stehen auf verschiedenen Uhren; sie zu
> „4 h" zusammenzuziehen behauptete eine Ordnung, die es nicht gibt.

Eine nach Stunden sortierte Lückenliste täte genau das, quer über alle Uhren. **Gewählt:
markieren, nicht sortieren** — was die Anforderung ausdrücklich zulässt. Die bestehende
Ordnung (Priorität → Status) bleibt unangetastet, und ein Test hält das fest.

**Zwei Ungenauigkeiten der Ticket-Prosa**, gegen die bewusst nicht gebaut wurde: Es nannte
`stufe: erst/zweit/final` und `bezugspunkt: kenntnis/eintritt`. Real sind
`erst | zwischen | abschluss` und `kenntnis | einstufung | vorherige-meldung | ereignis`.

---

## Anforderungen → Umsetzung → Nachweis

| REQ | Was wahr sein muss | Umsetzung | Nachweis |
|---|---|---|---|
| **[THE-583](https://linear.app/thearchitect/issue/THE-583)** (574.1) | Die Frist steht strukturiert am Lücken-Eintrag, in **einer** Abfrage aufgelöst | `compliance-gaps.service.ts`: ein `find` über alle `stakeholderRequirementIds`, Spread statt `?? undefined` | 5 Dienst-Tests · **am echten Bestand: 13 von 15 Einträgen tragen die Frist** — genau so viele wie Klauseln eine haben |
| **[THE-584](https://linear.app/thearchitect/issue/THE-584)** (574.2) | Die Uhr ist sichtbar, **ohne** eine Ordnung zu behaupten | `GapAnalysis.tsx`: Abzeichen „24 h from kenntnis · initial", `quelle` als Tooltip, Sortierung unverändert | 4 UI-Tests, darunter einer, der die **Nicht**-Umsortierung festhält |

---

## Was am echten Bestand herauskommt

```
Lücken-Ansicht: 15 Einträge · trägt „deadline": ja
Einträge MIT Frist: 13 von 15

  erhebliche Sicherheitsvorfälle dem CSIRT melden   24h  ab kenntnis          · erst
  Frühwarnung an das CSIRT übermitteln              24h  ab kenntnis          · erst
  Meldung über den Sicherheitsvorfall übermitteln   72h  ab kenntnis          · erst
  Schweregrad dokumentieren                         1mon ab vorherige-meldung · abschluss
```

Die **Dreistufigkeit von NIS2 Art. 23** bleibt erhalten und unterscheidbar — 24 h Frühwarnung,
72 h Meldung, ein Monat Abschlussbericht, jede mit ihrer eigenen Uhr.

Die zwei Einträge ohne Frist tragen das Feld **nicht** — kein „—", kein „unbefristet".

---

## Grenzen

- **Nur das Durchreichen.** Der Anschluss der Remediation an Ketten-Anforderungen bleibt
  offen: sie nimmt `standardId + gapSectionIds`, arbeitet also auf Norm-Abschnitten. Das war
  in der Abgrenzung des Tickets ausgeschlossen und braucht einen eigenen Schnitt mit eigener
  Prämissen-Prüfung.
- **Keine Kalenderarithmetik.** Es wird kein absoluter Zeitpunkt berechnet — dafür fehlt das
  Startereignis (wann wurde Kenntnis erlangt?). Das ist keine Lücke, sondern die Grenze der
  Daten.
- **Nicht am Klick geprüft**, wie bei THE-571/573/575: Dienst-Ebene plus UI-Tests plus
  Messung am echten Bestand, kein angemeldeter Browser.
