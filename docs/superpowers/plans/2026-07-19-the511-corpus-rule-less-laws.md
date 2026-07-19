# THE-511 (UC-CORPUS-003) — Regel-lose Gesetze + ganze Gesetze in den Korpus Implementation Plan / Runbook

> **For agentic workers:** Code-Teil ist minimal (Ontologie + Config-Zeilen). Der Schwerpunkt ist ein **Crawl-/Ops-Runbook** über zwei Umgebungen (Server B Crawler → Korpus-Mongo → VPS-Qdrant). Firecrawl kostet — inkrementell + budget-bewusst.

**Goal:** LAW-002 echten Discovery-Wert geben: (A) alle bestehenden Teil-Crawls auf **ganze Gesetze** vervollständigen (Regel [[feedback_crawl_whole_laws]]), (B) 5 **regel-lose** Gesetze (CRA/MDR/PSD2/ePrivacy/eIDAS) neu in den Korpus scrapen, (C) Sprach-Lücken schließen (cross-linguales Retrieval — DSGVO-de gegen EN-Profil scort schlecht).

**Architecture:** Seit THE-418 ist ein neues EUR-Lex-Gesetz **eine Datenzeile** in `crawl-config.ts` + eine `normSources`-Zeile in der Ontologie (Model/Route validieren via `isNormSource`, kein harter Enum). Crawl läuft auf **Server B** (`POST /crawl`, Firecrawl→EUR-Lex, WAF-umgehend); Embeddings landen in Korpus-Mongo + Server-B-Qdrant. Der **VPS-App-Qdrant ist separat** → nach dem Crawl aus Korpus-Mongo re-seeden (Skript von 2026-07-19).

**Tech Stack:** TS (shared/crawler), Jest, EUR-Lex via Firecrawl-Cloud (THE-402/403 Budget), gesetze-im-internet (direkt, LkSG).

**RVTM:** docs/superpowers/rvtm/2026-07-19-the511-corpus-rule-less-laws-rvtm.md

**Scope-Grenze:** KEINE Stage-A-Regeln (das ist THE-457 — die neuen Gesetze erscheinen als `corpus`-Provenance, für `both` bräuchten sie zusätzlich eine Regel). Kein Crawler-Engine-Umbau. eIDAS: Basis-VO 910/2014 (eIDAS-2.0-Novelle 2024/1183 = Folge-Erwägung, s.u.).

---

## Die Daten (Single Source of Truth für diesen Plan)

### A · Teil-Crawls → ganze Gesetze (nur `crawl-config.ts`, keine neue Source)
| source | Änderung |
|---|---|
| `dsgvo` | `articleNumbers` LÖSCHEN → ganzes GDPR (de) |
| `nis2` | `articleNumbers` LÖSCHEN → ganze NIS2 (en) |
| `dora` | `articleNumbers` LÖSCHEN → ganze DORA (en) |
| `lksg` | `paragraphNumbers: [3-9]` → `[1..24]` (ganzes LkSG, de) |

### B · Sprach-Vollständigkeit (neue Source-Zeilen, cross-linguales Retrieval)
| neue source | celex | lang | effectiveFrom |
|---|---|---|---|
| `dsgvo-en` | 32016R0679 | en | 2018-05-25 |
| `nis2-de` | 32022L2555 | de | 2024-10-17 |
| `dora-de` | 32022R2554 | de | 2025-01-17 |

### C · Regel-lose Gesetze (neu, DE+EN, voll)
| source | celex | lang | effectiveFrom |
|---|---|---|---|
| `cra-en` / `cra-de` | 32024R2847 | en/de | 2024-12-10 |
| `mdr-en` / `mdr-de` | 32017R0745 | en/de | 2021-05-26 |
| `psd2-en` / `psd2-de` | 32015L2366 | en/de | 2018-01-13 |
| `eprivacy-en` / `eprivacy-de` | 32002L0058 | en/de | 2002-07-31 |
| `eidas-en` / `eidas-de` | 32014R0910 | en/de | 2016-07-01 |

→ **13 neue `normSources`-Zeilen** (3 Sprach + 10 neue), 4 bestehende Config-Zeilen geändert. Familien-Merge (`toFamily`, -de/-en-Strip) fasst je Gesetz DE+EN zusammen; `dsgvo`(de) + `dsgvo-en` → beide Familie `dsgvo` ✓.

**Naming-Notiz:** `dsgvo`/`nis2`/`dora` bleiben ohne Sprach-Suffix (bestehende Keys, Rename = breaking Ontologie-Change + Re-Crawl → out of scope). Neue Gegenstücke tragen `-en`/`-de`. Inkonsistent, aber funktional korrekt (Familie merged).

---

## Chunk 1: Code (Ontologie + Config)

### Task 1: normSources + ontologyVersion + CHANGELOG

**Files:** `packages/shared/src/ontology/norm-ontology.v1.ts`, `packages/shared/src/ontology/CHANGELOG.md`

- [ ] **Step 1:** 13 Zeilen in `NORM_ONTOLOGY.normSources` ergänzen (Muster der ai-act-en/de-Zeilen, je `{ id, label, jurisdiction: 'EU' }`; Labels menschenlesbar inkl. VO-Nummer + Sprache).
- [ ] **Step 2:** `ontologyVersion: '1.3.0'` → `'1.4.0'` (MINOR, additiv).
- [ ] **Step 3:** CHANGELOG-Eintrag `## 1.4.0 — 2026-07-19 (THE-511)` mit den 13 neuen ids.
- [ ] **Step 4:** `cd packages/shared && npx tsc -b` sauber; `isNormSource`-Pin-Tests grün.
- [ ] **Step 5: Commit** — `feat(shared): normSources for 5 rule-less laws + language completeness — ontology 1.4.0 (THE-511)`

### Task 2: crawl-config.ts — deepen + add

**Files:** `packages/compliance-crawler/src/sources/crawl-config.ts` · Test: bestehende Crawler-Config-Tests

- [ ] **Step 1: Deepen** — bei `dsgvo`/`nis2`/`dora` die `articleNumbers`-Zeile ENTFERNEN; bei `lksg` `paragraphNumbers` auf `[1,2,3,…,24]` setzen (volle §-Liste; gesetze-im-internet crawlt 1 Request/§, direkt).
- [ ] **Step 2: Add** — 13 neue Zeilen (Tabellen B+C), alle `transport: 'eur-lex'`, **ohne `articleNumbers`** (= ganzes Gesetz), `celex`/`language`/`jurisdiction: 'EU'`/`effectiveFrom` wie oben.
- [ ] **Step 3:** Config-Konsistenz-Test (jeder Key ist valider normSource + language — „pinned by test") grün; ergänze eine Assertion, dass die 13 neuen Sources via `resolveSourceParser` einen Parser bauen (kein „no generic engine"-Throw). `cd packages/compliance-crawler && npx jest` grün.
- [ ] **Step 4: Commit** — `feat(crawler): full-law crawl config for 5 rule-less laws + deepen dsgvo/nis2/dora/lksg to complete (THE-511)`

### Task 3: Server-seitige Model-Enum-Parität prüfen

**Files:** (nur prüfen) `packages/server/src/services/corpusClient.service.ts`, `packages/compliance-crawler/src/db/regulation.model.ts`

- [ ] **Step 1:** Verifizieren, dass BEIDE Regulation-Models `source` ontologie-validiert (kein harter Enum) führen — bereits so (THE-413). KEINE Änderung nötig; `cd packages/server && npx tsc --noEmit` sauber. Falls doch ein Enum existiert: additiv erweitern (AC-2 THE-396). Kein Commit wenn keine Änderung.

---

## Chunk 2: Merge + Server-B-Redeploy

- [ ] Rebase auf origin/master, volle Suiten (shared+crawler+server) + tsc grün, PR, Merge.
- [ ] **Crawler auf Server B redeployen** (Coolify) — der Crawler zieht die gemergte Config. **Zugang/Trigger vor Ausführung klären** (Coolify-Redeploy-Webhook/UI + `CRAWLER_SHARED_SECRET`/`COMPLIANCE_CRAWLER_SECRET` + Crawler-URL). Ops-Schritt (Owner führt Firecrawl-kostende Kommandos aus, wie beim VPS).

---

## Chunk 3: Inkrementelles Crawlen (Firecrawl, budget-gesichert)

> EUR-Lex ist hinter CloudFront-WAF (THE-285) → direkter `crawl-live`-CLI-Check unmöglich; Parse-Qualität nur über den Firecrawl-Pfad prüfbar. Deshalb **Canary zuerst**.

- [ ] **Step 1 — Canary (kein Embedding, kein Budget für Müll):** `POST /crawl {"sources":["cra-en"],"skipEmbedding":true}` gegen Server B. Ergebnis in Korpus-Mongo inspizieren: Paragraphen-Anzahl plausibel (~70+ Art.), `fullText` sauber (kein EUR-Lex-Tabellen-Müll THE-365, keine DE/EN-Vermischung), 20k-Cap greift nur bei sehr langen Art.
- [ ] **Step 2 — Batch mit Embedding** (Route-Cap 12 Sources/Request, also 2-3 Requests): die deepened bestehenden (`dsgvo`,`nis2`,`dora`,`lksg`) + Sprach-Vervollständigung (`dsgvo-en`,`nis2-de`,`dora-de`) + restliche neue (`cra-de`,`mdr-*`,`psd2-*`,`eprivacy-*`,`eidas-*`). **MDR gezielt spot-checken** (größtes Gesetz; der Artikel-Parser überspringt Anhänge naturgemäß — verifizieren, dass die ~123 Art. sauber sind).
- [ ] **Step 3 — Verifikation je Source:** Korpus-Mongo `countDocuments({source})` je neue/geänderte Source + Stichprobe `fullText`. Erwartung grob: dsgvo ~99, mdr ~123, psd2 ~117, cra ~70, eprivacy ~20, eidas ~52, eidas/cra … (× Sprachen).

---

## Chunk 4: VPS-Qdrant re-seed + Live-Verifikation

- [ ] **Step 1:** Seed-Skript erneut (idempotent, liest Korpus-Mongo `embedding` → VPS-Qdrant `regulations-corpus`): `ssh root@VPS 'docker exec -i thearchitect-app node -' < scratchpad/seed-corpus-qdrant.js`. Erwartung: Punktzahl springt von 347 auf ~1500+.
- [ ] **Step 2:** Live-Test auf dem BSH-Modell (thearchitect.site, Compliance→Standards→Discover):
  - **DSGVO** sollte jetzt (voll + EN) stark retrieven → Judge erreichen → voraussichtlich `both`.
  - **CRA** (vernetzte BSH-Geräte = Produkte mit digitalen Elementen) sollte als **`corpus`** erscheinen — das erste echte Discovery-Badge.
  - DB-Diagnose (`lawdiscoveryfindings` + `aitraces` op=discovery-judge) wie am 2026-07-19: welche Familien den Judge erreichen + wie er urteilt.

---

## Abschluss
- [ ] RVTM auf Passing; THE-511 Done.
- [ ] Firecrawl-Usage im `docs/strategy/firecrawl-usage-log.md` nachtragen (Budget-Transparenz).
- [ ] Memory: Korpus-Stand (Familien + §-Zahlen) in [[progress_uc_law_track]] / compliance-crawler-Memory.

## Bewusste Nicht-Ziele / Folge-Erwägungen
- **THE-457** (Stage-A-Regeln für die neuen Gesetze) — separat; erst dann werden die neuen Gesetze `both` statt nur `corpus`.
- **eIDAS 2.0** (VO 2024/1183, Novelle von 910/2014) — konsolidierter Text ist komplex; Basis 910/2014 zuerst, 2.0 als Folge-Zeile.
- **Sprach-Rename** `dsgvo`→`dsgvo-de` etc. (Konsistenz) — breaking (Re-Crawl), bewusst später.
- **Golden-Set anreichern** (reichere Profile, THE-465-Follow-up) — orthogonal, aus dem Prod↔Eval-Divergenz-Fund.
