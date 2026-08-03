# RVTM — THE-575: Der Drift-Lauf zählt, was er nicht ansieht

**Datum:** 2026-08-03 · **Ticket:** [THE-575](https://linear.app/thearchitect/issue/THE-575) (Bug, Urgent)
**Herkunft:** Abnahme [THE-571](https://linear.app/thearchitect/issue/THE-571), Frage 7a
**WSJF:** 85,0 — BV 4 · **Risk 5** · Impl 5 · Success 5 · Compliance 4 · ReqRel 4 · Urgency 4 · Status 3

**Ousterhout:** alle Symptome niedrig · **Obscurity mittel** — der Nebenfund unten.
**Watch-Point:** ein neues Zählfeld ist leicht ergänzt und ebenso leicht wieder umgangen.
Deshalb ist die **Summenregel** der Gegenstand, nicht das Feld.

---

## Der Fehler

```
{"checked":2,"staled":0,"skipped":0,"evidenceStaled":0,"attestedReset":0}
```

Ein Nutzer las „2 geprüft, 0 veraltet, 0 übersprungen" und durfte schließen, sein Bestand sei
durchgesehen. Tatsächlich waren **13 von 15** Anforderungen nie im Blick: Die Abfrage filtert
auf `normId`/`sectionEId`, unverankerte Anforderungen fielen heraus und wurden **weder als
`checked` noch als `skipped`** gezählt.

Der Kopf des Dienstes versprach ausdrücklich das Gegenteil — *„werden gezählt, nie still
übersprungen"*. Die Zusage galt; sie griff nur eine Ebene zu spät.

---

## Anforderung → Umsetzung → Nachweis

| REQ | Was wahr sein muss | Umsetzung | Nachweis |
|---|---|---|---|
| **[THE-582](https://linear.app/thearchitect/issue/THE-582)** (575.1) | `checked + skipped + unanchored` = alle Ketten-Anforderungen | `chainDrift.service.ts`: zwei `countDocuments` **vor** dem Lauf; `unanchored = total − anchored` | 5 Dienst-Tests inkl. Bilanz-Test · 2 UI-Tests · **am echten Bestand: 2 + 0 + 13 = 15, ausgeglichen** |

**Die Bilanz-Prüfung ist auch im Abnahme-Instrument** (`the571-acceptance.ts`) verankert und
meldet `AUSGEGLICHEN` oder `LÜCKE!` — sie läuft damit bei jeder künftigen Abnahme mit.

---

## Der Nebenfund aus dem Pre-Flight

Der Gruppenschlüssel benutzte ASCII 31 (Unit Separator) als **Literal**:

```ts
const key = `${r.normId}${r.sectionEId}`;      // ← Trenner unsichtbar
const [normId, sectionEId] = key.split('');    // ← liest sich wie ein Bug
```

Die Wahl ist **richtig** — ein `:` oder `#` kommt in `normId` und `eId` vor, ASCII 31 nicht.
Unsichtbar geschrieben ist sie aber eine Falle: Ich bin beim Lesen selbst darüber gestolpert
und hätte sie beinahe „repariert". Jetzt steht sie als benannte Konstante `GROUP_SEP` mit
Begründung. Zwei Zeilen, kein Verhaltensunterschied.

---

## Was am echten Bestand herauskommt

```
7a Drift-Lauf: {"checked":2,"staled":0,"skipped":0,"unanchored":13,...}
   Bilanz: checked 2 + skipped 0 + unanchored 13 = 15
           · Ketten-Anforderungen 15 → AUSGEGLICHEN
```

In der Fläche: `Drift check: 2 checked · 0 staled · 0 skipped · 13 not checkable (no corpus
anchor) · 0 attestations reset`.

## Grenzen

- **Die Meldung bleibt eine Toast-Nachricht** (jetzt 8 s statt 6 s). Für die Aussage „13
  wurden nie angesehen" ist das kein starker Ort; eine bleibende Zeile im Panel wäre besser.
  Bewusst **nicht** mitgebaut — die Anforderung verlangt „neben `checked`", und dort steht sie
  jetzt. Eigener Schnitt, falls gewünscht.
- **Nicht am Klick geprüft**, wie bei THE-571/573: Dienst-Ebene plus UI-Tests, kein
  angemeldeter Browser.
- Die 13 unverankerten Anforderungen sind der Altbestand aus [THE-577](https://linear.app/thearchitect/issue/THE-577)
  (Paraphrasen). In **Produktion existiert er nicht** (dort gemessen: 0 Ketten-Anforderungen),
  der Fix betrifft dort also vorerst nur den leeren Fall — und genau der soll ehrlich aussehen.
