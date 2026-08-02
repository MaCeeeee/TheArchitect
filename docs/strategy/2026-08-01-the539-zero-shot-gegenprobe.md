# THE-539 Schritt 1 — Zero-Shot-Gegenprobe zur Harmonisierungs-Prämisse

**Datum:** 2026-08-01 · **Ticket:** THE-539 (blockiert THE-538, das THE-438 blockiert)
**Frage:** Scheitert Ähnlichkeitssuche für Rechtspflichten am Prinzip — oder am unangepassten Encoder?

## Aufbau

Identisches Universum wie die Erstmessung vom 2026-08-01: **219 Pflichten** (DSGVO 149 · DORA 50 · NIS2 20)
aus den Sicherheits-/Melde-Artikeln, erzeugt von REQGEN → **11 430 Cross-Gesetz-Paare**.
Die Original-Artefakte (`security-reqgen.json`, `reqgen.json`, `pairs.json`, `judged.json`) wurden
wiedergefunden und wiederverwendet — **keine Neu-Generierung**, damit der Vergleich mit dem
Jaccard-Rang 17 exakt ist.

Embedding-Text pro Pflicht: `title + ". " + description`. Kein Fine-Tuning, kein Prompt-Engineering,
keine Domänenanpassung — reines Zero-Shot. Ranking über Cosinus (bei `multi-qa-…-dot-v1`
zusätzlich Dot-Product, weil es darauf trainiert ist).

**Referenzpaar (Positiv-Kontrolle):** DSGVO Art. 32 „Verfügbarkeit und Zugang zu personenbezogenen Daten
nach Zwischenfällen rasch wiederherstellen" ≙ NIS2 Art. 21 „Maßnahmen zur Aufrechterhaltung des Betriebs
und Notfallwiederherstellung implementieren".

**Negativ-Kontrolle:** die 100 Paare NIS2 Art. 23 × DORA Art. 19 (Meldepflichten — juristisch
verschiedene Adressaten, Fristen, Schutzgüter; dürfen **nicht** nach oben rutschen).

## Ergebnis

| Verfahren | Metrik | Rang Positiv-Paar (von 11 430) | Score | bester Negativ-Rang | Negativ-Paare im Top-30 |
| -- | -- | --: | --: | --: | --: |
| Jaccard (Erstmessung) | lexikalisch | **17** | 0,114 | 1 | **15** |
| `all-mpnet-base-v2` (Projekt-Modell) | Cosine | **3** | 0,651 | 1 | 1 |
| `multilingual-e5-base` | Cosine | **1** | 0,916 | 5 | 4 |
| `multi-qa-mpnet-base-dot-v1` (Paper-Modell) | Cosine | 177 | 0,610 | 1 | 3 |
| `multi-qa-mpnet-base-dot-v1` | Dot | 81 | 27,8 | 1 | 3 |
| `paraphrase-multilingual-mpnet-base-v2` | Cosine | 526 | 0,670 | 85 | 0 |

**Richter-Gegenprobe** (identisches Modell `claude-haiku-4-5` und identischer System-Prompt wie die
Erstmessung, über die jeweiligen Top-30):

| Ranking | Treffer im Top-30 | auf Rang |
| -- | --: | -- |
| Jaccard | 1 | 17 |
| `all-mpnet-base-v2` | 1 | 3 |
| `multilingual-e5-base` | 1 | 1 |

## Befund — die Prämisse zerfällt in zwei Teile

**1. „Ähnlichkeit findet das Paar nicht" ist widerlegt.**
Ein unangepasster Encoder hebt das bekannte Paar von Rang 17 auf **Rang 1** (e5) bzw. **Rang 3**
(Projekt-Modell). Es braucht dafür **kein Fine-Tuning** — der Zwischenschritt aus dem Ticket hat
gereicht. Damit ist Schritt 2 (Domänenanpassung) für diese Frage gegenstandslos.

Zusätzlich räumt der Encoder das Feld auf: Jaccards Top-30 bestand zu **15 von 30** Paaren aus der
einen Negativ-Kontroll-Familie (NIS2 Art. 23 × DORA Art. 19). Bei `all-mpnet` ist es 1, bei e5 4.

**2. „Ähnlichkeit liefert den Wert nicht" bleibt bestehen — aus einem anderen Grund.**
Beide Encoder finden im Top-30 **genau dasselbe eine** Paar, das schon bekannt war. **Kein einziges
neues harmonisierbares Paar.** Besseres Ranking macht sichtbar, was da ist; es erzeugt nichts.
Die Schranke aus der Zufallsstichprobe (0/120 → wahre Rate < 2,5 %) ist davon unberührt.

**3. Die Negativ-Kontrolle scheitert bei jedem Verfahren.**
Das juristisch falsche Meldepflicht-Paar steht bei Jaccard und `all-mpnet` auf **Rang 1**, bei e5 auf
Rang 5. Kein Ähnlichkeitsmaß trennt „gleiches Thema" von „gleiche Maßnahme". Die LLM-Richter-Stufe
ist damit nicht Beiwerk, sondern **tragend** — sie hat in allen Läufen korrekt „nein" gesagt.

**4. Modellwahl ist nicht intuitiv.** Das im Paper (arXiv:2607.06364) siegreiche
`multi-qa-mpnet-base-dot-v1` ist hier das **schlechteste** englische Modell (Rang 177/81), und das
naheliegende mehrsprachige `paraphrase-multilingual-mpnet-base-v2` ist mit Rang 526 unbrauchbar.
Gewonnen haben das ohnehin im Produkt verbaute `all-mpnet-base-v2` und `multilingual-e5-base`.
Paper-Ergebnisse übertragen sich nicht ohne Messung auf deutschen Rechtstext.

## Konsequenz

- **Für THE-538:** Der Katalog-Arm ist **nicht durch ein Ranking-Versagen erzwungen**. Die Begründung
  für einen gesetzesneutralen Kontroll-Katalog muss auf Befund 2 stehen (es gibt wenig zu finden),
  nicht auf Befund 1 (Ähnlichkeit ist blind) — letzteres stimmt so nicht mehr.
- **Für THE-438 / REQ-REQHARM-001.2:** Die Vorfilterung über Embeddings ist bestätigt und billig; die
  LLM-Richter-Stufe ist Pflicht, nicht Kür. Offen bleibt der Wert-Hebel, nicht die Mechanik.
- **Nicht beantwortet:** ob die Überlappung bei anderer Granularität als REQGENs existiert. Das war
  Einschränkung 1 der Erstmessung und ist es weiterhin.

## Artefakte

`/private/tmp/claude-501/-Users-mac-macee-javis/6183019d-.../scratchpad/the539/` —
`flat219.json` (Universum), `positive_pair.json`, `rank.py`, `judge-top30.mjs`,
`out-*.json` (Ränge je Modell), `top30-*.json`, `judged-*.json` (Richter-Urteile).
Scratchpad ist flüchtig; die Zahlen oben sind der dauerhafte Beleg.
