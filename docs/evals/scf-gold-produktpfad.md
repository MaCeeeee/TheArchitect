# Das SCF-Gold über den Produktpfad — der schmale Schnitt

**Datum:** 2026-08-03 · **Art:** Messung · **Anlass:** die Frage, ob die Gold-Aussage aus
THE-545 (4 von 5) auch für den Weg gilt, den ein Nutzer geht
**Schwelle, gesetzt VOR der Messung:** **≥ 4 von 5** — das ist die Halte-Schwelle, mit der
THE-547 gearbeitet hat. Weniger ist ein Befund über den Pfad, keine Nachlässigkeit.

---

## Verdikt

**3 von 5 — die Schwelle ist verfehlt.** Der Produktpfad hält das Gold nicht.

Die Ursache liegt **nicht** in der Gruppierung (die ist derselbe Code), sondern in dem einen
Schritt, den der Produktpfad zusätzlich hat: der Ableitung der Adressatenklasse aus dem
Freitext.

| SCF | getragen von | über den Produktpfad |
|---|---|---|
| BCD-01 | `dsgvo:art32:c04:q1s1` × `nis2:art21:c01:q2s1` | ❌ **verloren** — die DSGVO-Seite fällt aus |
| CRY-01 | `dsgvo:art24:c01:q1s1` × `nis2:art21:c01:q1s2` | ✅ beide Seiten überleben |
| GOV-02 | `dora:art19:c11:q1s1` + `dsgvo:art24:c01:q2s1` | ✅ beide Seiten überleben |
| RSK-01 | `dsgvo:art32:c06:q1s1` + `nis2:art21:c01:q1s1` | ⚠️ überlebt, aber mit **anderer Rolle** |
| HRS-03 | — | ❌ unverändert nie gefunden |

---

## Warum der schmale Schnitt statt des vollen Laufs

Der volle Lauf hätte Extraktion und Transformation über 143 Klauseln neu gefahren (~450
Aufrufe) plus 762 Richter-Paare. **Und er wäre konfundiert gewesen:** frische Extraktion heißt
neue Varianz, eine Abweichung ließe sich nicht sauber dem Pfad zuschreiben. Lauf 3 und Lauf 4
zeigen das — beide 4/5, unterschiedliche Treffer im Detail.

Gefahren wurden deshalb **nur die fünf Klauseln**, aus denen die acht gold-tragenden
Anforderungen stammen: 17 Aufrufe statt ~1200, **kein Richter**, also auch keine
Urteils-Varianz. Was gemessen wird, ist ausschließlich der Unterschied der beiden Pfade.

## Wo die Pfade auseinandergehen

```ts
// Prüfstand (runReqtraceEval)
addresseeClass: article.addresseeClass          // feste Annotation der Fixture

// Produkt (buildGroupables)
const addresseeClass = mapVerpflichteterToPartyRole(doc.verpflichteter);
if (!addresseeClass) { stats.unmappedAddressee += 1; continue; }   // ← fällt raus
```

Der Prüfstand hat die Adressatenklasse **handkuratiert**. Im Produkt gibt es das nicht — dort
wird sie aus dem extrahierten `verpflichteter` abgeleitet. Genau das ist der Unterschied,
und das Lexikon sagt seine Grenze selbst an:

> Bewusst NICHT gemappt: „Anbieter" (mehrdeutig …), **„das Unternehmen" (zu generisch)**.
> […] Eine falsche Klasse wäre die gefährliche Richtung: sie öffnet das Verdrängungs-Gate
> für Paare, die es ausschließen müsste (DORA×NIS2!).

## Die Messung

Fünf Gold-Klauseln, frisch transformiert (Haiku 4.5, gleicher Rater wie der Prüfstand):

```
ID                       FIXTURE                      LEXIKON                verpflichteter
✓ dsgvo:art24:c01:q1s1   controller                   controller             „Verantwortlicher für die Daten…"
✓ dsgvo:art24:c01:q2s1   controller                   controller             „Verantwortlicher"
✗ dsgvo:art24:c01:q3s1   controller                   — fällt raus           „Unternehmen"
✗ dsgvo:art24:c01:q3s2   controller                   — fällt raus           „Unternehmen"
✗ dsgvo:art32:c04:q1s1   controller                   — fällt raus           „Unternehmen"      ⟵ BCD-01
✓ dsgvo:art32:c04:q1s2   controller                   controller             „Unternehmen (Verantwortlicher)"
✗ dsgvo:art32:c06:q1s1   controller                   processor              „Unternehmen als Verantwortlicher
                                                                              oder Auftragsverarbeiter"        ⟵ RSK-01
✓ nis2:art21:c01:q1s1    essential_important_entity   essential_important_entity
✓ nis2:art21:c01:q1s2    essential_important_entity   essential_important_entity
✓ nis2:art21:c01:q1s3    essential_important_entity   essential_important_entity
✓ nis2:art21:c01:q2s1    essential_important_entity   essential_important_entity
✓ dora:art19:c11:q1s1    financial_entity             financial_entity       „Finanzunternehmen"

Gleiche Rolle: 8 von 12 · vom Lexikon verworfen: 3 · 17 LLM-Aufrufe
```

**Ein einziger Datensatz kippt das Ergebnis:** `dsgvo:art32:c04:q1s1` bekommt als
Verpflichteten das blanke „Unternehmen", wird verworfen, und damit kann das Paar, das BCD-01
trägt, nicht entstehen. 4/5 wird zu 3/5.

**RSK-01 hält, aber wackelt.** Sein DSGVO-Träger wird zu `processor` statt `controller` — weil
in „Unternehmen als Verantwortlicher **oder** Auftragsverarbeiter" die Regel für
`Auftragsverarbeiter` in der Liste weiter oben steht. Die Gold-Prüfung selbst schaut nicht auf
die Rolle (sie prüft Gesetze und Handlung), und `processor` bleibt paarungsfähig — der Treffer
überlebt. Aber die Zuordnung ist **willkürlich, nicht konservativ**: Bei einer „oder"-Aufzählung
zweier Rollen sollte das Lexikon `null` liefern, so wie es das bei „Anbieter" tut.

## Die zweite Grenze — sie sitzt vor allem anderen

Unabhängig vom Lexikon kann der Produktpfad das Gold-Regime **über die Route** gar nicht
erreichen:

```
Lauf 4:            762 geurteilte Paare · cappedPairs: 0
Dienst-Default:     50
Route-Maximum:     200   ← harte Decke im Zod-Schema
```

Höchstens **26 %** der Urteile des Gold-Laufs. Das ist keine Messgrenze, sondern eine
Produktgrenze: Bei einigen hundert Ketten-Anforderungen sieht der Harmonisierungs-Vorschlag
systematisch nur einen Bruchteil der Paare an.

**Immerhin ehrlich:** `cappedPairs` wird angezeigt (`SharedMeasuresPanel`). Ich hatte hier ein
drittes Beispiel stiller Kappung erwartet — es ist keines.

## Was diese Messung NICHT sagt

- Sie ist **eine** Beobachtung, keine Verteilung. Der Transformationsschritt ist
  nicht-deterministisch; ob `dsgvo:art32:c04:q1s1` *immer* „Unternehmen" liefert, ist nicht
  gemessen. Lauf 4 selbst könnte dort etwas anderes produziert haben.
- Sie hat die **Gruppierung nicht gefahren**. Der Verlust von BCD-01 ist aus dem Verwerfen
  gefolgert (`continue` in `buildGroupables`) — die Folgerung ist zwingend, aber sie ist eine
  Folgerung.
- Sie sagt nichts über die **übrigen 138 Klauseln**. Die Verwerfungsquote von 3 aus 12 ist auf
  fünf ausgewählten Klauseln gemessen, nicht auf dem Korpus.

## Was daraus folgt

Das Lexikon war als **konservativ** entworfen — lieber verwerfen als falsch paaren, weil eine
falsche Klasse das Verdrängungs-Gate öffnet. Diese Entscheidung ist richtig und steht nicht
zur Debatte. **Neu ist ihr gemessener Preis:** Sie kostet mindestens einen Gold-Treffer.

Der saubere Ausweg steht bereits im Modul-Kopf und ist keine neue Idee: die `partyRole` je
Provision aus dem Korpus (THE-540) statt der Ableitung aus Freitext. Diese Messung liefert
das Argument, es zu priorisieren — und in der Zwischenzeit zwei kleinere Schritte:

1. **„Unternehmen" ist nicht mehrdeutig, nur unspezifisch.** Die Ontologie hat dafür
   `obligated_enterprise`, und die Rolle steht bereits in `COMPATIBLE_ENTERPRISE_ROLES`.
   Ob das Lexikon sie vergeben darf, ist eine Entscheidung mit Risiko — nicht einfach ein
   Reflex.
2. **Die „oder"-Aufzählung** gehört auf `null`, nicht auf die erstbeste Regel. Das ist kein
   Abwägen, sondern die Doktrin des Moduls auf sich selbst angewandt.

---

# Nachtrag 2026-08-03: die Korrektur senkt die Quote — und das ist richtig so

[THE-588](https://linear.app/thearchitect/issue/THE-588) ist gebaut: Das Lexikon zählt jetzt
die getroffenen **Rollen** statt beim ersten Treffer auszusteigen. Nennt ein Text zwei
verschiedene Rollen, liefert es `null`.

**Genau eine der zwölf Zuordnungen ändert sich — und sie kostet einen Gold-Treffer:**

```
≠ dsgvo:art32:c06:q1s1   processor  →  — verworfen     ⟵ trug RSK-01

Gold über den Produktpfad: 2 von 5   (vorher 3)
```

| SCF | vorher | nachher |
|---|---|---|
| BCD-01 | ❌ verloren | ❌ verloren |
| CRY-01 | ✅ | ✅ |
| GOV-02 | ✅ | ✅ |
| RSK-01 | ⚠️ hielt als `processor` | ❌ **verloren** |
| HRS-03 | ❌ | ❌ |

## Warum die fallende Zahl kein Rückschritt ist

**RSK-01 wurde nie legitim gehalten.** Sein DSGVO-Träger bekam `processor`, weil diese Regel
im Array eine Zeile höher stand — ein Münzwurf, der zufällig auf einer Rolle landete, die das
Kompatibilitäts-Tor passiert. Die Quote von 3 war ein Zufallstreffer, keine Leistung.

Dass sie jetzt auf 2 fällt, ist **die Messung, die zum ersten Mal die Wahrheit sagt** — dasselbe
Muster wie beim Drift-Lauf, wo `checked: 2` erst durch die ehrliche Zählung offenlegte, dass
13 Anforderungen nie angesehen worden waren. Eine Zahl, die sinkt, weil eine Lüge wegfällt, ist
besser als eine, die stimmt, weil zwei Fehler sich aufheben.

## Was das für die offene Entscheidung bedeutet

Der Befund **verschärft** [THE-589](https://linear.app/thearchitect/issue/THE-589) und
[THE-540](https://linear.app/thearchitect/issue/THE-540), statt sie zu entlasten: Beide
verbliebenen Verluste — BCD-01 und RSK-01 — hängen an genau einer Ursache, der
**Abdeckung des Lexikons für unspezifische Unternehmens-Formulierungen**. Kein Zufall,
kein Rauschen, eine Ursache.

Der saubere Weg bleibt der, den der Modul-Kopf selbst nennt: die `partyRole` je Provision aus
dem Korpus statt der Ableitung aus Freitext.

## Nachvollziehen

```
packages/server$ npx ts-node --transpile-only src/scripts/scf-gold-narrow-cut.ts --dry   # kostenlos
packages/server$ npx ts-node --transpile-only src/scripts/scf-gold-narrow-cut.ts         # 17 Aufrufe
packages/server$ npx ts-node --transpile-only src/scripts/scf-gold-addressee-probe.ts    # kostenlos
packages/server$ npx ts-node --transpile-only src/scripts/the588-impact-probe.ts        # kostenlos
```

`the588-impact-probe` hält die zwölf gemessenen `verpflichteter`-Werte eingefroren und rechnet
die Gold-Quote gegen das JEWEILS aktuelle Lexikon durch. Wer daran etwas ändert, sieht die
Wirkung sofort und ohne einen einzigen LLM-Aufruf.

Beide read-only; sie schreiben nichts in die Datenbank.
