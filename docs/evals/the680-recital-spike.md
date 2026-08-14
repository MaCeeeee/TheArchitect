# REQ-679.1 — Extraktions-Spike: Erwägungsgründe (Recitals)

**Gefahren am 2026-08-14** · read-only, kein Schreibvorgang auf `regulations` oder eine andere Collection.
Quelle: dasselbe EUR-Lex-HTML, das der Crawler heute schon zieht. CELEX-Nummern aus `SOURCE_CRAWL_CONFIG`.

| | |
|---|---|
| geprüfte Fassungen | 26 |
| davon sauber (lückenlos + Ende-Formel) | **24** |
| Gesetzesfamilien sauber | **12 von 13** |
| Erwägungsgründe gesamt | **2554** |
| Kill-Kriterium (≥ 10 Familien) | **GEHALTEN** |

## Je Fassung

| Fassung | Erwägungsgründe | lückenlos | Ende-Formel | Urteil |
|---|---:|---|---|---|
| `ai-act-de` | 180 | ja | ja | **sauber** |
| `ai-act-en` | 180 | ja | ja | **sauber** |
| `cra-de` | 130 | ja | ja | **sauber** |
| `cra-en` | 130 | ja | ja | **sauber** |
| `data-act-de` | 119 | ja | ja | **sauber** |
| `data-act-en` | 119 | ja | ja | **sauber** |
| `dora` | 106 | ja | ja | **sauber** |
| `dora-de` | 106 | ja | ja | **sauber** |
| `dsgvo` | 173 | ja | ja | **sauber** |
| `dsgvo-en` | 173 | ja | ja | **sauber** |
| `eidas-de` | 77 | ja | ja | **sauber** |
| `eidas-en` | 77 | ja | ja | **sauber** |
| `emoney-de` | 28 | ja | ja | **sauber** |
| `emoney-en` | 28 | ja | ja | **sauber** |
| `eprivacy-de` | 0 | ja | nein | nicht extrahierbar |
| `eprivacy-en` | 0 | ja | nein | nicht extrahierbar |
| `esg-rating-de` | 52 | ja | ja | **sauber** |
| `esg-rating-en` | 52 | ja | ja | **sauber** |
| `mdr-de` | 101 | ja | ja | **sauber** |
| `mdr-en` | 101 | ja | ja | **sauber** |
| `nis2` | 144 | ja | ja | **sauber** |
| `nis2-de` | 144 | ja | ja | **sauber** |
| `psd2-de` | 113 | ja | ja | **sauber** |
| `psd2-en` | 113 | ja | ja | **sauber** |
| `standardisation-de` | 54 | ja | ja | **sauber** |
| `standardisation-en` | 54 | ja | ja | **sauber** |

## Gegenprobe gegen die amtliche Erwartung (AC-5)

| Fassung | gefunden | amtlich erwartet | Δ |
|---|---:|---:|---:|
| `ai-act-de` / `-en` | 180 | 180 | **0** |
| `dsgvo` / `-en` | 173 | 173 | **0** |
| `dora` / `-de` | 106 | 106 | **0** |

Drei von drei exakt getroffen — die Extraktion erfindet nichts und verliert nichts.

## Sprach-Quervergleich (AC-6)

Keine einzige Abweichung zwischen DE und EN. Bei 12 Familien × 2 Sprachen ist das ein starkes
Redundanz-Signal — dieselbe Prüfung, die am 13.08. den fehlenden CRA-Artikel gefunden hat.

## Der eine Ausreißer

`eprivacy` (Richtlinie 2002/58/EG) trägt **kein** `div.eli-subdivision` — die ELI-Auszeichnung
existiert für Rechtsakte von 2002 noch nicht. Es ist ein Markup-Alters-Problem, kein inhaltliches:
Die Erwägungsgründe stehen im Dokument, nur ohne den strukturellen Container. Nachziehbar über
einen zweiten Selektor — bewusst NICHT in diesem Spike, um die Messung nicht auf einen Sonderfall
zu tunen.

## Was der erste Lauf lehrte

Lauf 1 meldete **0 Erwägungsgründe über alle 26 Fassungen** bei null Fehlern. Die Regel
„eine leere Messung ist kein Bestehen" (AC-7) hat den Fehlschluss verhindert: Statt „Recitals sind
nicht extrahierbar" zu berichten, folgte eine Diagnose — und die zeigte, dass `prevAll()` der falsche
Anker war. Der erste Artikel-Titel liegt tief in `div.eli-subdivision` und hat **null Geschwister
davor**; die Präambel ist ein anderer Zweig des Baums. Die Korrektur schneidet am Text (Erlass-Formel)
statt am Baum. Ein Diagnose-Zyklus, kein wiederholter Patch — Loop-Budget unangetastet.
