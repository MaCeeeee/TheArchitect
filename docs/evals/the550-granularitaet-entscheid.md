# THE-550 — Granularität: Auf welcher Ebene wird klassifiziert, referenziert, gealtert?

**Datum:** 2026-08-03 (Nachtlauf) · **Branch:** `mganzmanninfo/the-550-granularitaet`
**Verdikt: Die Klausel ist die tragfähige Einheit. Die Artikel-Ebene verliert nicht nur Information — sie kommt durch dieselbe Kette gar nicht erst durch. Ids müssen inhalts-basiert sein, nicht positional.**

---

## Frage 1: Trägt die Artikel-Ebene dieselbe Kette wie die Klausel-Ebene?

Aufbau: identische Kette, identische Parameter (Extraktions-Budget 900 Tokens,
gleiche Prompts, gleiche 9 Artikel DSGVO/NIS2/DORA), einziger Unterschied der
injizierte Segmenter — „ein Artikel = eine Klausel"
(`npm run reqtrace:article`, Skript `reqtrace-article-eval.ts`).

| Größe | Klausel-Ebene (Lauf 4) | Artikel-Ebene |
| --- | --- | --- |
| Einheiten | 143 Klauseln | 9 |
| Kandidaten aus der Extraktion | 167 | 4 |
| **unlesbare Extraktionen** | **1 von 143 (0,7 %)** | **8 von 9 (89 %)** |
| Systemanforderungen | 290 | 6 |
| SCF-Positiv-Kontrolle | 4 von 5 → **trägt** | 0 von 5 → **trägt nicht** |
| NIS2-Art.-23-Fristsignaturen (24 h / 72 h / 1 Monat) | 3 getrennt | verloren |

Der Mechanismus ist banal und genau der vorhergesagte: ein Artikel-Volltext
(bis ~20 k Zeichen) in EINE Extraktion mit demselben Ausgabebudget → die
Kandidatenliste reißt am Budget ab → unlesbar. Das Budget wurde **bewusst
nicht** erhöht: gleiches Budget ist die Bedingung des Vergleichs, und der
Abriss erscheint als Messpunkt (`unreadableExtractions`), nicht als stilles
Loch. Wer die Artikel-Ebene retten will, muss die Kette umbauen — das ist
dann keine Granularitäts-, sondern eine Architekturentscheidung.

**Referenzen:** `docs/evals/reqtrace-run-4.{md,json}` (Baseline) ·
`docs/evals/reqtrace-run-article.{md,json}` (dieser Lauf).

## Frage 2: Überleben Klausel-Referenzen eine Novelle?

Mechanisches Experiment am echten `nis2 art23`-Volltext (30 Klauseln),
zwei reale Novellen-Stile:

**a) Einschub als „(1a)" — der übliche Stil, der Umnummerierung vermeidet.**
Der Segmenter akzeptiert nur monoton wachsende `(n)` ab 1 → „(1a)" ist
**keine Absatzgrenze**: 30→30 Klauseln, 0 Ids verschoben, aber der neue
Pflichtentext klebt unsichtbar in einer bestehenden Klausel.
→ Kein Id-Bruch, sondern eine **Abdeckungslücke**: die neue Pflicht existiert
als Einheit nicht. Bekannte Segmenter-Lücke, eigenes Folge-Ticket wert.

**b) Umnummerierender Einschub — neuer „(2)", alte (2)…(15) rücken auf.**

| Id-Schema | Ergebnis nach der Novelle |
| --- | --- |
| positional `c01…c30` (heute) | **24 von 30 verschoben**, 6 stabil, 1 neu |
| content-hash (Alternative) | **30 von 30 wiedergefunden** |

Positional heißt: 24 Labels/Evidenzen zeigen nach der Novelle auf die
**falsche** Klausel — nicht „stale", sondern **falsch, ohne es zu wissen**.
Content-Hash heißt: unveränderte Klauseln behalten ihre Identität; nur die
tatsächlich veränderte fällt heraus und wird als neu erkannt.

**c) Artikel-Ebene als Referenzanker:** der `versionHash` des ganzen Artikels
kippt bei **jeder** Novelle — alle 30 Klausel-Bezüge werden stale, auch die
29 unveränderten. Die Alterung wird maximal grob: alles oder nichts.

## Entscheidungsvorschlag (für das Ticket)

1. **Klassifikations- und Referenz-Einheit ist die Klausel** (Segmenter-Output),
   nicht der Artikel. Der Artikel bleibt Anzeige- und Navigationsebene.
2. **Klausel-Ids werden inhalts-basiert** (Hash über normalisierten
   Klauseltext), nicht positional. Die positionale Id `c01…` bleibt als
   Anzeige-Pfad (`Abs. 2 Buchst. a`), trägt aber keine Referenzen.
3. **Alterung je Klausel**, nicht je Artikel: nur die tatsächlich veränderte
   Klausel staled ihre Evidenzen (Anschluss an THE-558-Mechanik).
4. **Folge-Ticket:** Segmenter erkennt eingeschobene Absätze im
   Novellen-Stil „(1a)" nicht — Erkennung ergänzen, sonst bleibt neue
   Pflicht unsichtbar.

## Grenzen

- Die 32-Fälle-Kontrolle aus THE-547 (68,8 % Capability-Wiederfindung) wurde
  **nicht** wiederholt — sie braucht menschliche Adjudikation, die diese
  Nacht nicht hat. Der Artikel-Vergleich stützt sich auf die mechanischen
  Größen derselben Kette.
- Beide Läufe nutzen dasselbe eingefrorene 9-Artikel-Fixture; der Befund gilt
  für deutsche EU-Rechtstexte dieses Zuschnitts.
- Das Id-Experiment simuliert die Novelle synthetisch (ein Einschub); reale
  Novellen ändern oft zusätzlich Wortlaut in Nachbarabsätzen — das schwächt
  den Content-Hash-Vorteil nicht, es verstärkt ihn (nur wirklich Verändertes
  fällt heraus).
- Ein negatives Verdikt wäre ein gültiges Ergebnis gewesen; nachgebessert
  wurde nur, was als Harness-Fehler belegt ist (keines).
