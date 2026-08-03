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

## Prod-Betroffenheit — was belegt ist und was nicht

| | |
|---|---|
| **Belegt** | Beim Rollout `8023ea2` heute früh entstanden die Ketten-Sammlungen **leer** (Nachweis im Daily: „Bestand vorher = nachher (10 · 20 · 327 · 0), neue Sammlungen leer entstanden"). Zu diesem Zeitpunkt gab es in Produktion **keinen** Altbestand dieser Art. |
| **Nicht belegt** | Der Stand **jetzt**. Server A ist von hier nicht erreichbar — SSH-Schlüssel nicht autorisiert, HTTP/HTTPS ohne Antwort. Das ist der bekannte Zustand seit heute früh (gesperrte eigene IP), derselbe, der schon die THE-551-Messung auf die Golden-Stichprobe verwiesen hat. |
| **Folgerung** | Die Betroffenheit ist heute **0 oder nahe 0** und **wächst mit jeder Nutzung**, bis THE-570 ausgeliefert ist. Die Zählung ist beim Deploy nachzuholen — sie ist ein Einzeiler und gehört in den Rollout-Nachweis. |

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
