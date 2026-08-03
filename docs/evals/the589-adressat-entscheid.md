# THE-589 — Entscheid: der Adressat kommt aus dem Korpus, nicht aus dem Lexikon

**Datum:** 2026-08-03 · **Art:** Entscheidung, kein Bau · **Ticket:** [THE-589](https://linear.app/thearchitect/issue/THE-589)
**Anlass:** Der schmale Schnitt gegen das SCF-Gold (`docs/evals/scf-gold-produktpfad.md`) —
der Produktpfad verliert Gold-Treffer, weil das Adressaten-Lexikon generische
Unternehmens-Formulierungen verwirft.

---

## Die Entscheidung

**Weg B — und er heißt nicht „warten", sondern „anschließen".**

Der Adressat wird aus der **typisierten Provision des Korpus** genommen (THE-540 Achse 1),
mit dem Lexikon als Rückfall. Das Lexikon bleibt unverändert; „Unternehmen" bekommt **keine**
Rolle zugewiesen.

---

## Die tragende Frage — gemessen, nicht angenommen

Die Definition of Done verlangte, **vor** jeder Wahl zu klären, ob das Verdrängungs-Gate bei
einer generischen Rolle überhaupt greift. Gemessen mit `evaluateDisplacement`:

```
FALL                                                     GATE
heute: DORA(financial) × NIS2(essential)                 GREIFT — nis2 fällt
heute: DORA(financial) × NIS2(financial)                 GREIFT — nis2 fällt
WEG A: DORA(obligated_enterprise) × NIS2(essential)      ❌ greift NICHT
WEG A: DORA(obligated_enterprise) × NIS2(obligated_ent.) ❌ greift NICHT
WEG A: DORA(financial) × NIS2(obligated_enterprise)      GREIFT — nis2 fällt
```

**Weg A öffnet die gefährliche Richtung.** Die Kante `dora-prevails-nis2` ist auf
`financial_entity` gestellt, und `findDisplacement` vergleicht exakt. Kommt eine
DORA-Pflicht als generisches `obligated_enterprise` an, findet das Gate seine eigene Kante
nicht — und ein rechtlich gegenstandsloses DORA×NIS2-Paar erreicht den Richter.

Beachtenswert ist die **Asymmetrie** im letzten Fall: Trägt die DORA-Seite noch
`financial_entity`, greift das Gate weiterhin. Das Loch entsteht ausschließlich, wenn die
**vorrangige** Seite selbst generisch wird — was genau dann passiert, wenn die
Transformation für eine DORA-Klausel „Unternehmen" liefert. Im schmalen Schnitt lieferte sie
für drei DSGVO-Klauseln genau das; nichts macht DORA dagegen immun.

Das ist derselbe Befund wie am 01.08.: **Ein Katalog, der den Adressaten nicht kennt,
erzeugt systematisch falsche Aussagen.** Weg A würde ihn wiederholen — diesmal im eigenen Code.

## Die drei Wege

| Weg | Verdikt |
|---|---|
| **A — `obligated_enterprise` vergeben** | ❌ **verworfen.** Gemessen: öffnet das Verdrängungs-Gate. Eine höhere Gold-Quote, erkauft mit rechtlich gegenstandslosen Paaren, ist kein Fortschritt — sie hebt die Positiv-Kontrolle auf Kosten der Negativ-Kontrolle. |
| **C — gesetzes-abhängig mappen** | ❌ **verworfen**, obwohl sicherer als A. „In DORA heißt ‚das Unternehmen' Finanzunternehmen" ist eine **Behauptung über das Recht**. Sie gehört als Datum in die Ontologie, nicht als `if` in ein Lexikon — und sie existiert dort bereits (siehe B). Zudem bliebe für die DSGVO die echte Mehrdeutigkeit controller ↔ processor. |
| **B — Adressat aus dem Korpus** | ✅ **gewählt.** |

## Warum B nicht „warten" heißt

Der Modul-Kopf nennt B selbst „den sauberen Weg", und beim Schreiben des Tickets war meine
Annahme, er sei Zukunftsmusik. **Das war falsch, und die Korrektur ist der Kern dieses
Entscheids:**

| Baustein | Stand |
|---|---|
| `typing.partyRole` im Korpus | ✅ **77 % von 1640 Provisions** (Server B) |
| `typedProvision.service` mit Hausregel | ✅ gebaut, **23/23 Tests** (THE-540 Achse 1) |
| `resolveTypedAddressees(keys, fetch)` → `Map<regulationKey, partyRole>` | ✅ vorhanden |
| Ein **Konsument** im Produkt | ❌ — nur Skripte (`build-pairs-v2`, `obligation-slots`) |

Die Facetten-Landkarte sagt es für diese Facette wörtlich: **die Lücke ist D5, nicht D3.**
Es fehlt kein Wissen, es fehlt ein Verbraucher — und `buildGroupables` ist genau der.

**Der Schlüssel passt ohne Adapter:** Die Kette führt `StakeholderRequirement.regulationKey`
(z. B. `nis2-de:art-23`), und der Korpus ist nach demselben Schlüssel indiziert.

Auch die Schichtung ist bereits vorgesehen — `resolveTypedAddressees` gibt bei Korpus-Ausfall
eine **leere Map statt eines Wurfs**, mit der ausdrücklichen Begründung: *„die Zerlegung muss
weiterlaufen und auf den LLM-Wert zurückfallen. Ein Infrastruktur-Ausfall darf keine Pflicht
verlieren."*

## Warum B auch inhaltlich besser ist, nicht nur sicherer

Das Lexikon liest den **Verpflichteten einer Paraphrase**: Ein Modell hat den Gesetzestext in
„Das Unternehmen muss …" umformuliert, und ein zweiter Schritt versucht, aus dieser
Umformulierung die Rolle zurückzugewinnen. Der Korpus dagegen trägt die Rolle **an der
Provision selbst**, aus dem Originaltext klassifiziert (partyRole macro-F1 0,883).

Ein Umweg über eine Paraphrase durch eine Regex ist strikt schlechter als der direkte Weg —
unabhängig davon, wie gut die Regex wird.

## Was das heute kostet

**Nichts in Produktion.** Dort liegen **0 Ketten-Anforderungen** (gemessen in THE-577), also
auch keine Harmonisierungs-Vorschläge. Der gemessene Verlust von zwei Gold-Treffern betrifft
den Prüfstand, keinen Kunden.

Das ist der Grund, warum B trotz offener Restarbeit tragfähig ist — und zugleich die
Bedingung, unter der es aufhört, tragfähig zu sein: **Sobald Projekte in Produktion
Ketten-Anforderungen ansammeln, wird der Verlust real.**

## Was der Bau tun muss

Als Bau-Ticket [THE-591](https://linear.app/thearchitect/issue/THE-591) herausgeschrieben. Die
Punkte, die dieser Entscheid ihm mitgibt:

1. Der Adressat kommt aus `resolveTypedAddressees`; das Lexikon greift **nur**, wenn der
   Korpus zu dieser Provision nichts sagt (23 % ungetypt) oder nicht erreichbar ist.
2. **Die Herkunft muss unterscheidbar bleiben** — Korpus oder Lexikon. Eine Rolle ohne
   erkennbare Quelle ist im Prüfungsfall wertlos.
3. **Negativ-Kontrolle:** Es darf **kein** Paar entstehen, das vorher durch das Gate
   ausgeschlossen war. Vorher/nachher zählen, nicht schätzen.
4. **Positiv-Kontrolle:** Der schmale Schnitt wird wiederholt; die Gold-Quote muss steigen.
   Sie darf aber **nicht** als bestanden gelten, wenn dabei Punkt 3 verletzt wird.
5. Die Ungetypt-Quote gehört in die Statistik neben `unmappedAddressee` — sonst wandert die
   heutige stille Lücke nur eine Ebene weiter.

## Nachvollziehen

```
packages/server$ npx ts-node --transpile-only src/scripts/the589-displacement-probe.ts
```

Read-only, kein LLM. Zeigt, ob das Verdrängungs-Gate für eine gegebene Rollen-Kombination
greift — und macht die Wirkung jeder künftigen Rollen-Änderung sofort sichtbar.
