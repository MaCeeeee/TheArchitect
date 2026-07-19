# RVTM — THE-511 (UC-CORPUS-003) Regel-lose + ganze Gesetze in den Korpus

**Plan:** docs/superpowers/plans/2026-07-19-the511-corpus-rule-less-laws.md
**Issue:** THE-511 · Score 71,4 · **Scope (Owner 2026-07-19):** alle 5 regel-losen Gesetze + alle 4 Teil-Crawls + Sprach-Lücken
**Stand:** Plan finalisiert, Umsetzung ausstehend. Regel: [[feedback_crawl_whole_laws]] (immer ganze Gesetze).

| # | Requirement | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| R1 | 13 neue `normSources` (5 Gesetze×2 + 3 Sprach-Lücken), ontologyVersion 1.4.0 + CHANGELOG | T1 | `isNormSource`-Pin-Test + tsc -b | Pending |
| R2 | 4 Teil-Crawls → ganz: dsgvo/nis2/dora `articleNumbers` weg, lksg `[1..24]` | T2 | crawl-config-Konsistenztest | Pending |
| R3 | 13 neue crawl-config-Zeilen, `transport:'eur-lex'`, KEIN `articleNumbers` (voll), korrekte CELEX | T2 | Test: alle Sources bauen Parser (kein „no engine"-Throw) | Pending |
| R4 | Model/Route ontologie-validiert (kein harter Enum) — nur prüfen, ggf. additiv | T3 | server tsc --noEmit sauber | Pending |
| R5 | Canary-Crawl `cra-en` (skipEmbedding) — Parse-Qualität ok (kein Tabellen-Müll, kein DE/EN-Mix, plausible §-Zahl) | Chunk 3 S1 | Korpus-Mongo-Inspektion | Pending (Ops) |
| R6 | Batch-Crawl mit Embedding: deepened + Sprach + neue Gesetze; MDR spot-check | Chunk 3 S2 | Korpus-Mongo countDocuments je Source | Pending (Ops) |
| R7 | VPS-Qdrant re-seed aus Korpus-Mongo (idempotent) → Punktzahl 347→~1500+ | Chunk 4 S1 | Qdrant collection points_count | Pending (Ops) |
| R8 | Live-Beleg auf BSH-Modell: DSGVO erreicht Judge (voll+EN → `both`?), CRA als `corpus`-Discovery | Chunk 4 S2 | UI + DB-Diagnose (findings/aitraces) | Pending (Ops) |
| R9 | Firecrawl-Usage geloggt (Budget-Transparenz THE-402/403) | Abschluss | firecrawl-usage-log.md | Pending |

## Ops-Abhängigkeit (Blocker vor Chunk 2-4)
Server-B-Crawler-Zugang: Coolify-Redeploy + `COMPLIANCE_CRAWLER_SECRET`/Crawler-URL. Firecrawl-kostende Schritte = Owner-ausgeführt (wie VPS-Kommandos).

## Bewusst nicht abgedeckt
Stage-A-Regeln (THE-457 → `both`), eIDAS 2.0 (2024/1183), Sprach-Rename dsgvo→dsgvo-de, Golden-Profile (THE-465).
