# THE-577 — Entscheid: der Altbestand wird neu abgeleitet, nicht umgehängt

**Datum:** 2026-08-03 · **Art:** Entscheidung, kein Bau · **Ticket:** [THE-577](https://linear.app/thearchitect/issue/THE-577)
**Vorgeschichte:** Fund 1 der Abnahme [THE-571](https://linear.app/thearchitect/issue/THE-571) · `docs/evals/the571-abnahme-sieben-fragen.md`

---

## Die Entscheidung

**Weg A — Neu-Ableiten.** Die betroffenen Artikel werden aus dem Korpus erneut durch die
Kette geschickt; der Altbestand wird verworfen, nicht umgehängt.

Entschieden durch den Auftraggeber am 03.08. nach vorgelegter Messung.

## Warum nicht umhängen

Der Altbestand ruht auf einem **Text, der nicht das Gesetz ist**:

> **Altbestand:** „… dass wesentliche und wichtige Einrichtungen **dem** CSIRT unverzüglich
> jeden erheblichen Sicherheitsvorfall melden."
>
> **Korpus:** „… dass wesentliche und wichtige Einrichtungen **ihrem** CSIRT **oder
> gegebenenfalls ihrer zuständigen Behörde gemäß Absatz 4** unverzüglich über jeden
> Sicherheitsvorfall …"

Gemessen gegen 1410 echte Korpus-Klausel-Identitäten: **0 von 13 mechanisch nachverankerbar.**

Ein Umhängen des Schlüssels würde eine Provenienz-Behauptung erzeugen, die der Text nicht
deckt — die Anforderung sagte dann „ich stamme aus NIS2 Art. 23 Abs. 1", und ein Prüfer, der
den Wortlaut daneben legt, fände eine Paraphrase. Das ist schlimmer als der heutige,
sichtbare Doppel-Eintrag. **Eine Kette ist nur so viel wert wie ihr erstes Glied.**

## Der Preis — gemessen, vor dem Verwerfen

Die Definition of Done verlangte diese Zahl vorab. Sie ist niedriger als befürchtet:

```
Ketten-Anforderungen: 15   (Altbestand 13 · verankert 2)

Der Preis des Verwerfens
  Altbestands-Anforderungen mit Element-Verlinkung:  3   (4 Verlinkungen)
  Altbestands-Anforderungen mit gesetztem Tor:       0   ← enforced und attested sind leer

Rettbar über die kanonische Handlung
  RETTBAR  „erhebliche Sicherheitsvorfälle dem CSIRT melden"   1 Element
  RETTBAR  „Frühwarnung an das CSIRT übermitteln"              2 Elemente
  WAISE    „Verletzung des Schutzes personenbezogener Daten"   1 Element

  Verlinkungen rettbar: 3 von 4   ·   ohne Träger: 1
```

**Kein einziges menschliches Tor geht verloren** — `enforced` und `attested` stehen im
gesamten Altbestand auf 0. Was auf dem Spiel steht, sind vier Element-Verlinkungen.

Drei davon finden sofort einen Träger: eine verankerte Anforderung mit **derselben Handlung
und demselben Adressaten** (`vorfall-melden-behoerde` × `essential_important_entity`). Die
Gleichheit auf beiden Achsen ist Bedingung — dieselbe Handlung mit anderem Adressaten ist
eine andere Pflicht.

Die vierte (DSGVO Art. 33, Adressat `controller`) hat heute keinen Träger. **Das heißt nicht
„verloren"**, sondern: der Korpus-Artikel, der diese Pflicht trägt, wurde noch nicht durch
die Kette geschickt. Der Träger entsteht beim Neu-Ableiten selbst — DSGVO Art. 33 gehört
also in denselben Lauf.

## Die Reihenfolge — der eigentliche Ertrag dieser Entscheidung

**Produktion läuft `8023ea2` (11:14 Uhr). THE-570 wurde um 13:26 gemergt.**
Die Korpus-Brücke ist dort also **nicht** ausgeliefert — der Generator in Produktion erzeugt
weiterhin Anforderungen aus eingefügtem Text, also weiterhin Paraphrasen ohne Anker.

> **Daraus folgt zwingend: erst THE-570 ausliefern, dann migrieren.**
> Andernfalls repariert die Migration einen Bestand, der weiterwächst, während sie läuft.

## Prod-Betroffenheit — nachgemessen am 03.08. nach dem Deploy

**Ergebnis: null.** Produktion trägt keinen Paraphrasen-Altbestand.

```
DB: thearchitect
compliancerequirements:   10     ← Positiv-Kontrolle
stakeholderrequirements:   0
chainsystemrequirements:   0
projects:                 20     ← Positiv-Kontrolle

Ketten-Anforderungen:      0
mit Korpus-Anker:          0
Paraphrasen-Altbestand:    0
```

**Die Positiv-Kontrolle war hier Pflicht, nicht Zierde.** Eine Null heißt entweder „nichts
da" oder „falsch gemessen", und beides sieht identisch aus — die Lehre vom 01.08.
(*„dreimal 0 Treffer, jedes Mal das Messgerät"*). Dass dieselbe Abfrage
`compliancerequirements: 10` und `projects: 20` liefert — deckungsgleich mit dem
Rollout-Nachweis vom Vormittag (10 · 20 · 327 · 0) — belegt: richtige Datenbank,
funktionierende Zählung. Erst dadurch ist die Null eine Aussage.

### Zwei Altbestände, die man nicht verwechseln darf

Die 10 Anforderungen in Produktion haben **gar keine Kette** — deshalb stehen Stakeholder-
und Systemanforderungen auf 0. Sie stammen aus dem alten Generator und sind ein anderes
Ding als das Problem dieses Entscheids:

| | Paraphrasen-Altbestand (dieser Entscheid) | REQGEN-Altbestand (Produktion) |
|---|---|---|
| Hat eine Kette? | ja | **nein** |
| Behauptet Klausel-Herkunft? | ja — und deckt sie nicht | nein |
| Problem? | **ja**, Provenienz ohne Deckung | nein — ADR-0008 deutet ihn nie rückwirkend um |

**Der Fund betrifft ausschließlich lokale Demo-Daten.** Kein Kunde, kein Prod-Projekt.
Die Migration [THE-578](https://linear.app/thearchitect/issue/THE-578) hätte eine leere
Menge bearbeitet und ist geschlossen.

### Wie der Zustand gehalten wird

THE-570 ist seit dem 03.08. in Produktion (Stand `2a7e215`, Wirksamkeit am ausgelieferten
Bündel belegt). Der Generator erzeugt dort ab jetzt **verankerte** Anforderungen — es kann
also gar kein neuer Paraphrasen-Bestand mehr entstehen. Der Entscheid „neu ableiten statt
umhängen" bleibt gültig als **Regel für den Fall, dass ein solcher Bestand je wieder
auftaucht**; er hat heute nur nichts zu tun.

## Negativ-Kontrolle: die Anzahl ändert sich, und zwar sichtbar

```
Altbestand nis2:art.-23:   12 Anforderungen — werden verworfen
Altbestand dsgvo:art.-33:   1 Anforderung   — wird verworfen
```

Zum Vergleich: NIS2 Art. 23 **aus dem Korpus** ergab in der THE-570-Handprobe **30 Klauseln
und 31 Kandidaten**. Die Zahl wird also nicht nur anders, sie wird deutlich größer — der
eingefügte Text war eine Kurzfassung von drei Absätzen, der echte Artikel hat mehr.

**Das ist kein Fehler, sondern der Punkt.** Aber es darf nicht stillschweigend geschehen: der
Bau zählt vorher und nachher und weist die Differenz aus.

## Was der Bau tun muss

1. **Voraussetzung:** THE-570 ist in Produktion. Vorher wird nicht migriert.
2. Betroffene Anforderungen identifizieren: `chain` vorhanden, `normId`/`sectionEId` fehlt.
3. Je betroffenem Artikel den **Korpus-Artikel** durch die Kette schicken (der Weg, den
   THE-570 geöffnet hat).
4. Element-Verlinkungen über das Paar **(Handlung, Adressatenklasse)** übertragen — nie über
   die Handlung allein.
5. Altbestand verwerfen, **nachdem** die Übertragung belegt ist, nie davor.
6. Vorher/nachher zählen, Differenz ausweisen, verwaiste Verlinkungen einzeln benennen.
7. Der Lauf ist wiederholbar und meldet bei einem zweiten Durchgang „nichts zu tun".

**Watch-Point:** Die Versuchung, „einfach den Schlüssel umzuschreiben". Der Schlüssel ist
nicht das Problem — der Text ist ein anderer.

## Nachvollziehen

```
packages/server$ npx ts-node --transpile-only src/scripts/the577-carryover-probe.ts <projectId>
```

Read-only. Verwirft nichts.
