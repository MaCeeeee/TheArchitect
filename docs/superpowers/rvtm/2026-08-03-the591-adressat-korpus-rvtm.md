# RVTM — THE-591: Der Adressat kommt aus der typisierten Provision

**Datum:** 2026-08-03 · **Ticket:** [THE-591](https://linear.app/thearchitect/issue/THE-591)
**Prämisse:** entschieden in [THE-589](https://linear.app/thearchitect/issue/THE-589) — Weg B, `docs/evals/the589-adressat-entscheid.md`
**WSJF:** 77,5 — BV 4 · Risk 4 · Impl 4 · Success 5 · Compliance 4 · ReqRel 4 · Urgency 3 · Status 3

**Ousterhout:** Change Amplification niedrig · **Cognitive Load mittel** (drei Schichten:
Korpus → Lexikon → keine) · Unknown Unknowns niedrig (das Schlüsselformat war vor dem Bau
gemessen) · **Abhängigkeiten mittel** — ein neuer Korpus-Lesezugriff im heißen Pfad ·
Obscurity mittel.

> **Watch-Point:** kein N+1, kein Wurf bei Ausfall. Beides eingehalten — und das bestehende
> N+1 gleich mitbehoben.

---

## Der Pre-Flight-Fund, der den Bau abgesichert hat

Vor der ersten Zeile gemessen: **Treffen die Ketten-Schlüssel überhaupt Korpus-Provisions?**

```
nis2:art.-23      ✗ keine typisierte Provision   (Altbestand, Punkt im Schlüssel)
dsgvo:art.-33     ✗ keine typisierte Provision   (Altbestand)
nis2-de:art-23    ✓ essential_important_entity   (Korpus-verankert)

⇒ Der Join trägt. Das Lexikon wird zum Rückfall für den Rest.
```

Ohne diese Messung wäre der Bau eine Wette gewesen. Mit ihr war klar: Der Schlüssel passt
ohne Adapter, und der Altbestand fällt erwartungsgemäß auf das Lexikon zurück.

---

## Anforderungen → Umsetzung → Nachweis

| AC | Umsetzung | Nachweis |
|---|---|---|
| Adressat aus dem Korpus, Lexikon nur als Rückfall | `buildGroupables`: `typedByKey.get(key) ?? mapVerpflichteterToPartyRole(...)` | 2 Tests (Vorrang, Rückfall) |
| Herkunft unterscheidbar | `addresseeSource: 'corpus' \| 'lexicon'` am Groupable + drei Zähler in `EnrichStats` + sichtbar im Panel | 3 Tests · `addressee-provenance` in der Fläche |
| **Negativ-Kontrolle:** kein Paar, das vorher ausgeschlossen war | — | **Der wichtigste Test:** DORA × NIS2 mit Rollen **ausschließlich aus dem Korpus** → Gate schließt weiterhin, `pairsJudged: 0` |
| Positiv-Kontrolle | am echten Bestand | `unmappedAddressee` **1 → 0** |
| Ungetypt-Quote in der Statistik | `untypedProvisions` | im Statistik-Test |
| Lexikon unverändert | keine Zeile angefasst | 22 Lexikon-Tests grün |

---

## Was am echten Bestand herauskommt

```
                       vorher (THE-571)      nachher
total                        15                15
unmappedAddressee             1                 0     ⟵ die Verbesserung
addresseeFromCorpus           —                 2
addresseeFromLexicon          —                13
untypedProvisions             —                13

Klassifikations-Aufrufe in diesem Lauf: 1
```

Der eine Aufruf ist **der Fix bei der Arbeit**: Die Anforderung mit dem Verpflichteten
*„Betreiber von kritischen Infrastrukturen oder Diensteanbieter (betreffende Einrichtung)"*
war für das Lexikon unmappbar und wurde nie klassifiziert. Über die Korpus-Provision
`nis2-de:art-23` bekommt sie jetzt `essential_important_entity` — und braucht deshalb zum
ersten Mal eine Handlungs-Zuordnung.

`untypedProvisions: 13` ist die ehrliche Gegenzahl: Das sind die Altbestands-Anforderungen,
deren Schlüssel (`nis2:art.-23` mit Punkt) im Korpus nicht existieren. Sie stehen **neben**
`unmappedAddressee`, damit „der Korpus kennt sie nicht" nicht mit „niemand kennt sie"
verwechselt wird.

---

## Die Negativ-Kontrolle im Wortlaut

Sie ist der Kern, weil THE-589 genau hier das Risiko gemessen hatte: Die Kante
`dora-prevails-nis2` hängt an `financial_entity`; eine generische Rolle macht das Gate blind.

Der Test setzt deshalb **beide** Anforderungen auf einen Freitext, den das Lexikon **nicht**
kennt — die Rollen können also nur aus dem Korpus kommen. Ergebnis:

```
addresseeFromCorpus: 2 · addresseeFromLexicon: 0
excludedByDisplacement: 1  (dora × nis2)
pairsJudged: 0             ← das Paar erreicht den Richter nie
```

Der Anschluss öffnet das Gate nicht.

---

## Nebenbefund, mitbehoben

`buildGroupables` holte dieselbe `StakeholderRequirement` **zweimal je Anforderung** per
`findById` — ein bestehendes N+1 auf einem Pfad, der mit dem Bestand wächst. Da der
Korpus-Zugriff als dritter dazugekommen wäre, ist jetzt alles auf **zwei Reads insgesamt**
zusammengezogen: einer für die Klauseln, einer für die Provisions. Ein Test hält fest, dass
alle Schlüssel in **einem** Aufruf aufgelöst werden.

## Grenzen

- **Der Nutzen hängt an der Typisierungs-Abdeckung.** Im Referenzbestand kommen 2 von 15
  Rollen aus dem Korpus, weil 13 Anforderungen zum Paraphrasen-Altbestand gehören. In einem
  Projekt, das nur über die Korpus-Brücke entsteht, kehrt sich das Verhältnis um.
- **Die Gold-Quote ist nicht neu gemessen.** Der schmale Schnitt setzt am Prüfstand an, nicht
  an persistierten Ketten-Anforderungen; ihn zu wiederholen hieße, die fünf Gold-Klauseln
  erst durch die Kette zu schicken. Erwartbar ist eine Verbesserung — belegt ist sie nicht.
- **Nicht am Klick geprüft**, wie den ganzen Tag: Dienst-Ebene, Bauteil-Tests und Messung am
  echten Bestand, kein angemeldeter Browser.

## Nachvollziehen

```
packages/server$ npx ts-node --transpile-only src/scripts/the591-key-probe.ts <projectId>    # Join trägt?
packages/server$ npx ts-node --transpile-only src/scripts/the591-stock-probe.ts <projectId>  # Wirkung
```
