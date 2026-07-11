# Kosten-Modell — Firecrawl Cloud vs. Self-Host (REQ-CRAWL-003.6 / THE-403)

**Datum:** 2026-07-04 · **Gate für:** [THE-402 OPS-CRAWL-003](https://linear.app/thearchitect/issue/THE-402)
**Frage:** Lohnt sich self-hosted Firecrawl auf Server B gegenüber Firecrawl-Cloud — beim *erwarteten* Scrape-Volumen?

> **Ergebnis vorweg: NEIN beim erwarteten Volumen.** Cloud gewinnt bei aktueller und mittelfristiger Last auf *beiden* Achsen (Kosten **und** Betriebsrisiko). Self-Host lohnt erst ab **~5.000 Firecrawl-Seiten/Monat, dauerhaft** — das ~190-Fache der heutigen Nutzung. Empfehlung: **THE-402 pausieren, Cloud behalten**, Gate mit Volumen-Trigger neu öffnen.

---

## 1 · Preis-Basis (verifiziert 2026-07-04)

Firecrawl-Cloud, [firecrawl.dev/pricing](https://www.firecrawl.dev/pricing). **1 Credit = 1 Seite** (Scrape *und* Crawl). Credits verfallen monatlich (kein Rollover).

| Plan | Preis/Mon (USD, Jahres-Abo) | Credits/Mon | eff. $/Seite* |
|--|--:|--:|--:|
| Free | $0 | 500 | — |
| Hobby | $16 | 5.000 | $0,0032 |
| Standard | $83 | 100.000 | $0,00083 |
| Growth | $333 | 500.000 | $0,00067 |
| Scale | $599 | 1.000.000 | $0,00060 |

\*bei Vollauslastung. **Wichtig:** Cloud-Kosten sind eine **Treppenfunktion** (Tier-Sprünge), kein linearer Pro-Call-Preis. Der Pro-Call-Preis ist nur bei Vollauslastung relevant.

---

## 2 · Scrape-Mechanik (die eigentliche Erkenntnis)

Aus dem Crawler-Code (`packages/compliance-crawler/src/sources/firecrawl.ts:78`):

- Der Crawler ruft **`/v1/scrape` (Single-Page)** — **eine Firecrawl-Seite pro Quell-URL**, nicht pro Artikel.
- Der Markdown einer URL wird **lokal** in Artikel-Blöcke geparst (`parseMarkdown()`). Die 325 Paragraphen kosten also **nicht** 325 Calls.
- `gesetze-im-internet`-Quellen (z. B. `lksg`) laufen über **Cheerio/HTTP-GET → 0 Firecrawl-Kosten**.

**Kosten pro vollem Korpus-Refresh (aktuell):**

| Quellen | Firecrawl-Calls |
|--|--:|
| 6 EUR-Lex-Quellen (nis2, dsgvo, ai-act-en/de, data-act-en/de) | **6** |
| lksg (Cheerio) | 0 |
| **Summe** | **6 Seiten** |

---

## 3 · Volumen-Modell

Scrape-Volumen = **drei Terme** mit sehr unterschiedlicher Skalierung:

| Term | Skaliert mit | Geteilt über Mandanten? |
|--|--|--|
| **A · Korpus-Refresh** | #Quellen × Kadenz | **Ja — geteilt.** Der Regulierungs-Korpus (AI Act, DSGVO …) ist global, **nicht** pro-Mandant. |
| **B · RADAR/AUTOCRAWL** | Watchlist-Größe × Kadenz | Semi-geteilt (gemeinsame Watchlist; ggf. pro-Mandant erweiterbar). |
| **C · Ad-hoc pro Architektur-Anfrage** | Mandanten × Sessions × Live-Scrapes/Anfrage | **Nein — der einzige echte Pro-Mandant-Multiplikator.** |

**Kritischer Punkt:** Der Driver von THE-402 ist „Mandanten × Anfragen → viele Scrapes". Aber nur **Term C** multipliziert mit Mandanten — und C ist heute **~0**, weil das Produkt über den *vorgebauten, embeddeten* Korpus (RAG) antwortet, nicht live scrapt. Term A (der Löwenanteil der heutigen Nutzung) ist **geteilt und konstant**, egal wie viele Mandanten dazukommen.

---

## 4 · Szenarien (Firecrawl-Seiten/Monat)

| | A Korpus | B RADAR | C Ad-hoc | **Σ/Mon** | Cloud-Tier | Cloud $/Mon |
|--|--:|--:|--:|--:|--|--:|
| **Ist (heute)** | ~26 (6 Q., wöchentl.) | 0 (nicht live) | ~0 | **~26** | Free | **$0** |
| **Low** (naher Ausbau) | ~130 (30 Q., wöchentl.) | 0 | ~50 | **~180** | Free | **$0** |
| **Expected** (RADAR live, Produkt skaliert) | ~300 (40 Q., wö.+tägl. Subset) | ~1.500 (50 Q. tägl.) | ~1.000 (50 Mand. × mäßig) | **~2.800** | Hobby | **$16** |
| **High** (aggressives Live-Scraping, 500 Mand.) | ~1.500 | ~6.000 (200 Q. tägl.) | ~60.000 (500 × 40 × 3) | **~67.500** | Standard | **$83** |

Zur Einordnung: Um das **Free-Kontingent (500/Mon)** zu sprengen, bräuchte es ~83 volle Korpus-Refreshes/Monat **oder** ~19× so viele Quellen bei wöchentlicher Kadenz **oder** ~470 zusätzliche RADAR/Ad-hoc-Seiten. Heute nutzen wir **~5 % des Gratis-Tiers.**

---

## 5 · Self-Host-Kosten (inkrementell)

Server B (Coolify-VPS) läuft bereits — Fixkosten versenkt. Inkrementell für den Firecrawl-Stack:

| Posten | Schätzung | Anmerkung |
|--|--|--|
| **Infra marginal** | **$0–15/Mon** | Stack (RabbitMQ + nuq-postgres + playwright + redis + chromium) ist RAM-hungrig (~4–8 GB). $0 wenn Server B freie Kapazität hat; +~$15 bei nötigem VPS-Upgrade. **Kernannahme — zu bestätigen.** |
| **Einmal-Aufbau** | ~4 Eng-Tage | 003.1–003.5 (Stack-Bring-up, Pin, Anbindung, Parity, Monitoring). |
| **Laufender Betrieb** | **~$30–50/Mon-Äquivalent** | Ehrlicher Posten: Version-Pin-Upgrades, Monitoring, Incident-Recovery. **Beleg:** die Instanz war **36 Tage unbemerkt down** und ist am Vendor-Refactor zerbrochen. |

**TCO-Untergrenze (freie Kapazität):** ~**$30–50/Mon** (dominiert vom Betriebsaufwand, nicht von Infra) + ~4 Eng-Tage einmalig.
**Nebenwirkung:** Der Cloud-Fallback (003.3) heißt — wenn Self-Host schlecht gewartet wird, zahlst du **still trotzdem Cloud** und hast den Aufwand obendrauf.

---

## 6 · Break-even

Self-Host schlägt Cloud, sobald der Cloud-Tier teurer wird als die Self-Host-TCO (~$30–50/Mon):

| Seiten/Mon | Cloud-Tier | Cloud $/Mon | Self-Host TCO $/Mon | **Günstiger** |
|--|--|--:|--:|--|
| ≤ 500 | Free | $0 | ~30–50 | **Cloud** |
| 500–5k | Hobby | $16 | ~30–50 | **Cloud** |
| 5k–100k | Standard | $83 | ~30–50 | **Self-Host** (nur bei freier Kapazität) |
| 100k–500k | Growth | $333 | ~40–55 | **Self-Host** |
| 500k–1M | Scale | $599 | ~55–70 | **Self-Host** |

**Break-even ≈ 5.000–8.000 Firecrawl-Seiten/Monat, dauerhaft** (Hobby→Standard-Grenze). Darunter gewinnt Cloud auf beiden Achsen: billiger *und* kein Betriebsrisiko.

**Wo liegt „Expected"?** Bei **~2.800/Mon → Hobby ($16)**. Das ist **~$16/Mon**, gegen die Cloud kein Self-Host mit ~$30–50 TCO + 4 Eng-Tagen konkurrieren kann. Self-Host wird erst im **High-Szenario** (Standard-Tier, ~67k/Mon) rational — und das setzt aggressives Pro-Anfrage-Live-Scraping voraus, das dem heutigen RAG-über-Korpus-Design widerspricht.

---

## 7 · Sensitivität

Zwei Annahmen bewegen das Ergebnis; keine kippt es beim erwarteten Volumen:

1. **Server-B-Kapazität (Infra $0 vs. +$15):** verschiebt die TCO um ~$15 — ändert die Break-even-Größenordnung nicht.
2. **Ad-hoc-Rate (Term C):** der einzige Hebel, der „Expected" Richtung „High" treiben könnte. Wenn ein künftiges Feature **pro Architektur-Anfrage live scrapt** (statt Korpus-RAG), skaliert C mit Mandanten und kann schnell den Standard-Tier erreichen. **Das ist der Trigger, den man messen muss** — nicht annehmen.

---

## 8 · Verdikt & Empfehlung

**NO-GO auf Kosten-Basis beim erwarteten Volumen.** Begründung, verdichtet:

- **1 Scrape = 1 Quell-URL, nicht 1 Artikel** → der Korpus ist ~6 Seiten/Refresh, nicht ~470.
- **Der Korpus ist geteilt, nicht pro-Mandant** → der „Mandanten × Scrapes"-Driver greift nur über Term C, der heute ~0 ist.
- **Free/Hobby absorbieren Hunderte–Tausende Seiten/Monat für $0–16** → Cloud-Kosten sind auf Jahre vernachlässigbar.
- **Self-Host-TCO wird vom Betriebsrisiko dominiert** (36-Tage-Ausfall als Beleg), nicht von Infra.

**Konkret:**
1. **THE-402 pausieren**, Cloud als Backend behalten, self-hosted Firecrawl gestoppt lassen. 003.1–003.5 **nicht** bauen.
2. **Vorlauf-Trigger definieren (Loop-Engineering) — feuert *vor* Break-even, nicht bei:** Der Aufbau 003.1–003.5 kostet ~4 Eng-Tage + Re-Score-Runde; ein Trigger erst bei Break-even käme zu spät (wir zahlten schon Standard-Tier, ohne Vorlauf). Schwellen auf **gemessene Firecrawl-Seiten/Monat**:

   | Schwelle | Wert | Auslöser |
   |--|--:|--|
   | 🟢 Normal | < 2.000/Mon | nichts — Free/Hobby trägt |
   | 🟡 **Vorwarnung** | **≥ 3.000/Mon, 2 Monate in Folge** (~60 % Hobby-Decke) | Gate THE-402 neu öffnen, REQs neu scoren, Aufbau vorbereiten |
   | 🔴 Break-even | ≥ 5.000/Mon (Hobby→Standard) | Bau-Entscheid; ab hier zahlt Cloud real drauf |

   **Sustained-Trend (2 Monate), kein Spike.** Messquelle: da 003.5 (Monitoring) beim NO-GO nicht gebaut wird → **monatlicher Check des Firecrawl-Cloud-Dashboards**, gefaltet in den Backlog-Heartbeat (`feedback_backlog_rescore_trigger`). Kein Infra-Aufwand.
3. **Term C beobachten:** Falls ein Feature Pro-Anfrage-Live-Scraping einführt, Volumen *vor* Rollout schätzen und Gate erneut ziehen.

**Nicht-Kosten-Vorbehalt (bewusst außerhalb dieses Modells):** Self-Host adressiert auch **Vendor-/Datensouveränität** (Scraping von Regulierungsquellen über einen US-Anbieter) und **Rate-Limits** bei Lastspitzen. Falls diese strategisch schwerer wiegen als die Kosten, ist das ein *separater* Driver — dann sollte THE-402 auf *diesen* Driver umgeschrieben und neu gescort werden, nicht auf „Kosten".

---

*Erfüllt AC-1 (Break-even + Annahmen), AC-2 (klare Go/No-Go-Aussage: No-Go bei Expected), AC-3 (verlinkt THE-402, fließt ins WSJF). Fließt zurück ins Scoring von THE-403 (74,3) — der Gate-Score war korrekt hoch, weil das Gate genau diesen teuren Fehlbau verhindert hat.*
