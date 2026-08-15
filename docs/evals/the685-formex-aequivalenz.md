# THE-685 — Formex-Äquivalenz: amtliche Struktur gegen unseren Bestand

> Erzeugt von `npm run formex:probe` (read-only). Nicht von Hand pflegen — neu erzeugen.

**Host:** MacBook-Pro-von-Matthias.fritz.box · **Ablage:** `/Users/mac_macee/javis/packages/compliance-crawler/.formex-cache` · **Bestand:** `mongodb://100.106.223.83:27017/regulations-corpus`

## Übersicht

| Fassung | CELEX | Formex | Weg | Ausdruck | Artikel amtl. | Artikel Bestand | Erw. amtl. | Erw. Bestand | Abweichung |
|---|---|---|---|---|---|---|---|---|---|
| `nis2` | 32022L2555 | ✓ 76 kB | sparql | base-act | 46 | 46 | 144 | 144 | — |
| `dsgvo` | 32016R0679 | ✓ 104 kB | sparql | base-act | 99 | 99 | 173 | 173 | — |
| `ai-act-en` | 32024R1689 | ✓ 167 kB | sparql | base-act | 113 | 112 | 180 | 180 | fehlt: 94 |
| `ai-act-de` | 32024R1689 | ✓ 191 kB | sparql | base-act | 113 | 113 | 180 | 180 | — |
| `data-act-en` | 32023R2854 | ✓ 78 kB | sparql | base-act | 50 | 50 | 119 | 119 | — |
| `data-act-de` | 32023R2854 | ✓ 92 kB | sparql | base-act | 50 | 50 | 119 | 119 | — |
| `dora` | 32022R2554 | ✓ 81 kB | sparql | base-act | 64 | 63 | 106 | 106 | fehlt: 61 |
| `dsgvo-en` | 32016R0679 | ✓ 88 kB | sparql | base-act | 99 | 99 | 173 | 173 | — |
| `nis2-de` | 32022L2555 | ✓ 89 kB | sparql | base-act | 46 | 46 | 144 | 144 | — |
| `dora-de` | 32022R2554 | ✓ 93 kB | sparql | base-act | 64 | 63 | 106 | 106 | fehlt: 61 |
| `cra-en` | 32024R2847 | ✓ 95 kB | sparql | base-act | 71 | 71 | 130 | 130 | — |
| `cra-de` | 32024R2847 | ✓ 109 kB | sparql | base-act | 71 | 71 | 130 | 130 | — |
| `mdr-en` | 32017R0745 | ✓ 200 kB | sparql | base-act | 123 | 123 | 101 | 101 | — |
| `mdr-de` | 32017R0745 | ✓ 227 kB | sparql | base-act | 123 | 123 | 101 | 101 | — |
| `psd2-en` | 32015L2366 | ✓ 82 kB | sparql | base-act | 117 | 117 | 113 | 113 | — |
| `psd2-de` | 32015L2366 | ✓ 94 kB | sparql | base-act | 117 | 116 | 113 | 113 | fehlt: 110 |
| `eprivacy-en` | 32002L0058 | ✗ | — | — | — | — | — | — | Kein Formex für 32002L0058.en (1 Weg versucht) — CELLAR antwortete HTTP 404 (htt |
| `eprivacy-de` | 32002L0058 | ✗ | — | — | — | — | — | — | Kein Formex für 32002L0058.de (1 Weg versucht) — CELLAR antwortete HTTP 404 (htt |
| `eidas-en` | 32014R0910 | ✓ 36 kB | sparql | base-act | 52 | 52 | 77 | 77 | — |
| `eidas-de` | 32014R0910 | ✓ 42 kB | sparql | base-act | 52 | 52 | 77 | 77 | — |
| `standardisation-en` | 32012R1025 | ✓ 29 kB | sparql | base-act | 30 | 30 | 54 | 54 | — |
| `standardisation-de` | 32012R1025 | ✓ 33 kB | sparql | base-act | 30 | 30 | 54 | 54 | — |
| `emoney-en` | 32009L0110 | ✓ 16 kB | sparql | base-act | 24 | 24 | 28 | 28 | — |
| `emoney-de` | 32009L0110 | ✓ 18 kB | sparql | base-act | 24 | 24 | 28 | 28 | — |
| `esg-rating-en` | 32024R3005 | ✓ 54 kB | sparql | base-act | 53 | 53 | 52 | 52 | — |
| `esg-rating-de` | 32024R3005 | ✓ 61 kB | sparql | base-act | 53 | 53 | 52 | 52 | — |

## Abweichungen im Einzelnen

Jede Abweichung mit Nummer — eine Summe hätte den fehlenden DORA-Artikel 61 nie gezeigt.

### `ai-act-en` (32024R1689)

- **Artikel amtlich vorhanden, im Bestand FEHLEND:** 94
  - Artikel 94 (amtliche Id `094`): „Procedural rights of economic operators of the general-purpose AI model"

### `dora` (32022R2554)

- **Artikel amtlich vorhanden, im Bestand FEHLEND:** 61
  - Artikel 61 (amtliche Id `061`): „Amendments to Regulation (EU) No 909/2014"

### `dora-de` (32022R2554)

- **Artikel amtlich vorhanden, im Bestand FEHLEND:** 61
  - Artikel 61 (amtliche Id `061`): „Änderungen der Verordnung (EU) Nr. 909/2014"

### `psd2-de` (32015L2366)

- **Artikel amtlich vorhanden, im Bestand FEHLEND:** 110
  - Artikel 110 (amtliche Id `110`): „Änderungen der Richtlinie 2002/65/EG"

## Struktur je Fassung

| Fassung | Schema | ARTICLE | PARAG | ALINEA | LIST | ITEM | CONSID | ANNEX | zitiert (ausgenommen) | amtl. Nummern-Lücke |
|---|---|---|---|---|---|---|---|---|---|---|
| `nis2` | formex-05.59-20170418 | 46 | 189 | 239 | 44 | 271 | 144 | 0 | 0 | — |
| `dsgvo` | formex-05.55-20141201 | 99 | 372 | 397 | 66 | 389 | 173 | 0 | 0 | — |
| `ai-act-en` | formex-06.02.1-20231031 | 113 | 500 | 585 | 88 | 467 | 180 | 0 | 98 | — |
| `ai-act-de` | formex-06.02.1-20231031 | 113 | 500 | 585 | 88 | 467 | 180 | 0 | 98 | — |
| `data-act-en` | formex-06.00-20210715 | 50 | 223 | 254 | 52 | 258 | 120 | 0 | 18 | — |
| `data-act-de` | formex-06.00-20210715 | 50 | 223 | 254 | 52 | 258 | 120 | 0 | 18 | — |
| `dora` | formex-05.59-20170418 | 64 | 254 | 362 | 86 | 436 | 106 | 0 | 151 | — |
| `dsgvo-en` | formex-05.55-20141201 | 99 | 372 | 397 | 66 | 389 | 173 | 0 | 0 | — |
| `nis2-de` | formex-05.59-20170418 | 46 | 189 | 239 | 44 | 271 | 144 | 0 | 0 | — |
| `dora-de` | formex-05.59-20170418 | 64 | 254 | 362 | 86 | 436 | 106 | 0 | 151 | — |
| `cra-en` | formex-06.02.1-20231031 | 71 | 288 | 356 | 38 | 161 | 130 | 0 | 22 | — |
| `cra-de` | formex-06.02.1-20231031 | 71 | 288 | 356 | 38 | 161 | 130 | 0 | 22 | — |
| `mdr-en` | formex-05.56-20160701 | 123 | 530 | 704 | 105 | 519 | 101 | 0 | 26 | — |
| `mdr-de` | formex-05.56-20160701 | 123 | 530 | 704 | 105 | 519 | 101 | 0 | 26 | — |
| `psd2-en` | formex-05.55-20141201 | 117 | 311 | 435 | 77 | 339 | 113 | 0 | 92 | — |
| `psd2-de` | formex-05.55-20141201 | 117 | 311 | 437 | 77 | 339 | 113 | 0 | 90 | — |
| `eidas-en` | formex-05.53-20130725 | 52 | 150 | 180 | 33 | 171 | 77 | 0 | 0 | — |
| `eidas-de` | formex-05.53-20130725 | 52 | 150 | 180 | 33 | 171 | 77 | 0 | 0 | — |
| `standardisation-en` | formex-05.21-20110601 | 30 | 58 | 79 | 21 | 91 | 54 | 0 | 5 | — |
| `standardisation-de` | formex-05.21-20110601 | 30 | 58 | 79 | 20 | 87 | 54 | 0 | 5 | — |
| `emoney-en` | formex-05.00-20081231 | 24 | 55 | 85 | 11 | 31 | 28 | 0 | 45 | — |
| `emoney-de` | formex-05.00-20081231 | 24 | 55 | 85 | 11 | 31 | 28 | 0 | 47 | — |
| `esg-rating-en` | formex-06.02.1-20231031 | 53 | 204 | 259 | 49 | 223 | 52 | 0 | 19 | — |
| `esg-rating-de` | formex-06.02.1-20231031 | 53 | 204 | 259 | 49 | 223 | 52 | 0 | 19 | — |

## Grenzen (AC-6)

- **Kein CELLAR-Weg:** `lksg` (gesetze-im-internet) — nationales Recht bzw. andere Beschaffung.
- **CELLAR ohne Formex:** `eprivacy-en`, `eprivacy-de`.
- **Anhänge:** `ARTICLE` außerhalb von `ENACTING.TERMS` wird ausgewiesen, aber nicht als Artikel des Gesetzes gezählt.
- **Zitierte Rechtsakte:** Alles unter `QUOT.S` ist fremder Text und bleibt aus jeder Zählung heraus.
