# THE-418 .6-Kern: „Neues Gesetz = Daten" — daten-getriebenes Onboarding + DORA-Beweis

> **For agentic workers:** REQUIRED: superpowers:subagent-driven-development (oder executing-plans). TDD, Checkbox-Syntax.

**Goal:** Die Produkt-These *literal* wahr machen: ein neues Gesetz onboarden = **eine Ontologie-Datenzeile, null Code** (THE-418 AC-1: „Diff zeigt null Codeänderung"). Bewiesen durch **DORA** (heute unwired) end-to-end durch ICM → REQGEN → GAP.

**Architektur:** Die Crawl-Config (CELEX, Artikel, Sprache, effectiveFrom, Transport) wandert aus verstreuten Code-Literalen (`eur-lex.ts`/`firecrawl.ts`) **in die `normSources`-Ontologie-Rows**. `source-registry.ts` baut die (bereits generischen) Engines `EurLexSource`/`FirecrawlSource` **daten-getrieben** aus der Ontologie — keine per-law-Factories mehr. Dann ist DORA nur noch ein Ontologie-Row.

**Tech Stack:** TS-Monorepo, Zod (Ontologie-Contract), Jest. shared → crawler/server Build-Order.

**Linear:** [THE-418](https://linear.app/thearchitect/issue/THE-418) (.6-Kern; Score 82,9) · Parent [THE-412](https://linear.app/thearchitect/issue/THE-412)
**Branch:** `mganzmanninfo/the-418-kern-data-driven-onboarding`
**References:** ADR-0004 E6 · THE-413 (Source-Registry-as-data) · THE-414 (Config-Registry + generische Engines) · Pre-Flight 2026-07-11 (im Ticket)

---

## ⚠️ REVIEW-FIXES (2026-07-11) — diese ÜBERSCHREIBEN die Chunk-1/2-Details unten

1. **Config-Home geändert: NICHT die Ontologie erweitern.** Statt `celex/articles/transport` in `norm-ontology.v1.ts` normSources zu legen (das schleppt der Client mit + erzwingt Ontologie-Semver-Bumps für reine Artikel-Tweaks), lebt die Crawl-Config in einer **neuen Daten-Datei im Crawler**: `packages/compliance-crawler/src/sources/crawl-config.ts` — `export const SOURCE_CRAWL_CONFIG: Record<string, CrawlConfig>`, keyed by source-id. Jeder Key wird gegen `isNormSource` validiert (Test), `language` gegen `isLanguage`. Ontologie-`normSources`-Rows bleiben unverändert (id/label/jurisdiction = Vokabular). **AC-1 gilt weiter:** DORA-Onboarding = eine Row in `crawl-config.ts` (Daten), null Code.
2. **`lawSlug?: string` in `CrawlConfig`** (für gesetze-im-internet/lksg — URL-Slug ≠ id; Beweis: bestehende `bdsgSource` nutzt `source:'dsgvo'` + `lawSlug:'bdsg_2018'`). Für lksg explizit `lawSlug:'lksg'` setzen, nicht auf id-Konvention verlassen.
3. **Helper `deriveEurLexUrl(celex, language)`** faktorisieren: `EurLexSource` leitet die URL intern ab, `FirecrawlSourceConfig.url` ist aber **Pflicht** → die Registry muss die URL vor dem `new FirecrawlSource({...})` berechnen. Eine generische Formel (nicht per-law), von beiden Pfaden genutzt.
4. **Byte-Identitäts-Test (Task 3.4) mit transkribierten Literalen** (celex/articles/language/effectiveFrom einmal im Test hartkodiert), NICHT aus den gelöschten Factories importiert. Die per-law-Factories werden in 3.3 wirklich entfernt.
5. **`source-registry.test.ts`-Count-Assertion daten-getrieben** ableiten (aus `SOURCE_CRAWL_CONFIG`), keine zweite handgepflegte Liste. `bdsgSource` (dead code) beim Factory-Pruning mit-entfernen oder als deprecated markieren.

Der Rest des Plans (Ziel, TDD-Flow, DORA-Beweis, E2E) gilt unverändert — nur „Ontologie-Row" gedanklich durch „`crawl-config.ts`-Row" ersetzen.

---

## Verifizierter Ausgangspunkt (2026-07-11, Codebase-Scan)

- `EurLexSource` (`eur-lex.ts:45-148`) **generisch**: Config nimmt `source/jurisdiction/language/celex/articleNumbers/effectiveFrom/url` als Parameter. `FirecrawlSource` (`firecrawl.ts:55`) ebenso generisch.
- ABER: CELEX-IDs sind **Code-Literale** in den per-law-Factories (`eur-lex.ts:167/181/204/221` + `firecrawl.ts:199/214/239/258`), doppelt (eur-lex + firecrawl). `normSources`-Rows haben **kein `celex`** (`norm-ontology.v1.ts:141+`, nur id/label/jurisdiction).
- ICM (`complianceMapping.service.ts`), REQGEN (`requirementGenerator.service.ts`), GAP (`compliance-gaps.service.ts`) sind **gesetzes-agnostisch** (kein hartes Law-Listing, nur `source: string`).
- `CrawlBodySchema` akzeptiert `dora` bereits (ontologie-validiert); `resolveSourceParser('dora')` gibt heute `null` → „not yet implemented".
- DORA-Ontologie-Row existiert bereits (`{ id:'dora', label:'DORA (EU) 2022/2554', jurisdiction:'EU' }`).

## Scope-Reconciliation

1. **AC-1 „null Codeänderung" ist der Nordstern.** Ein Inline-`SOURCE_ENTRIES`-Eintrag für DORA würde AC-1 **verletzen** (.ts-Edit). Deshalb ist der Kern dieses Slices, die Config **daten-getrieben** zu machen — erst dann ist DORA-Onboarding = Ontologie-Row = null Code.
2. **Kein neuer Store.** Config lebt in der bestehenden `norm-ontology.v1.ts` (E6: eine SoT), validiert am bestehenden Zod-Contract. Kein JSON-Zweitstore.
3. **Byte-Identität für die 4 gewirten Gesetze** (nis2/dsgvo/ai-act/data-act) ist Pflicht: nach dem Umbau müssen sie identisch crawlen (Regression). lksg (gesetze-im-internet) bleibt zunächst factory-basiert oder wird mit-migriert (siehe Task 3).
4. **`.6-Härtetests` (BGEID/eIDAS2) sind NICHT in diesem Slice** — sie brauchen .3/.4 (Hierarchie/Bitemporal). Split in Linear vermerkt.
5. **Firecrawl-Transport:** beide Engines sind generisch → die Daten-Row trägt eine `transport`/`celex`-Angabe, die Registry wählt EurLex (direct) oder Firecrawl (wenn `FIRECRAWL_API_KEY`) — wie heute, nur daten-getrieben.

## Bekannte Fallstricke
- shared neu bauen (`npm run build -w @thearchitect/shared`) vor crawler/server-tsc.
- `source-registry.test.ts` pinnt die 7 gewirten Sources — nach Umbau anpassen (+ dora).
- THE-435: file-scoped jest beim TDD.
- DORA-Artikel-Set + effectiveFrom sind **Recherche** (kein Code) — vor dem Crawl real beschaffen (Task 4).
- Crawler deployt separat (Server B) — der DORA-Live-Crawl (Task 5) braucht den Server-B-Deploy des Umbaus.

## Dateistruktur

| Datei | Aktion | Verantwortung danach |
|---|---|---|
| `packages/shared/src/ontology/norm-ontology.v1.ts` | Modify | `normSources`-Rows tragen `celex`/`language`/`articleNumbers`/`effectiveFrom`/`transport`; +DORA-Felder; v1.3.0 |
| `packages/shared/src/ontology/norm-ontology.schema.ts` | Modify | `NormSourceEntry` Zod-Schema um die neuen optionalen Felder erweitert |
| `packages/shared/src/ontology/index.ts` | Modify | Helper `getNormSourceConfig(id)` → die Crawl-Config-Row |
| `packages/shared/src/ontology/CHANGELOG.md` | Modify | 1.3.0-Eintrag |
| `packages/compliance-crawler/src/sources/source-registry.ts` | Modify | daten-getrieben: baut Engine generisch aus der Ontologie-Config; per-law-Factory-Aufrufe raus |
| `packages/compliance-crawler/src/sources/eur-lex.ts` | Modify | per-law-Factories entfernt/deprecated (generische `EurLexSource` bleibt) |
| `packages/compliance-crawler/src/sources/firecrawl.ts` | Modify | dito |
| `packages/compliance-crawler/src/__tests__/source-registry.test.ts` | Modify | Daten-getriebene Assertions + dora resolvebar |
| `packages/compliance-crawler/src/__tests__/onboarding-is-data.test.ts` | Create | AC-1-Beweis: DORA-Config aus Ontologie → funktionierender Parser, ohne Code-Edit an der Registry |

---

## Chunk 1: Ontologie trägt die Crawl-Config (Daten statt Code)

### Task 1: Branch + Baseline
- [ ] `git checkout master && git pull && git checkout -b mganzmanninfo/the-418-kern-data-driven-onboarding`
- [ ] Baseline grün: `npm run build -w @thearchitect/shared && npx tsc --noEmit -p packages/compliance-crawler && (cd packages/compliance-crawler && npx jest --silent)` — 118/118, sonst STOP.

### Task 2: `NormSourceEntry` um Crawl-Config erweitern (TDD)
**Files:** `norm-ontology.schema.ts`, `norm-ontology.v1.ts`, `index.ts`, `CHANGELOG.md`, Test in `packages/server/src/__tests__/norm-ontology.test.ts`
- [ ] **2.1 Failing test** (append): `getNormSourceConfig('nis2')` liefert `{ celex:'32022L2555', language:'en', articleNumbers:[20,21,22,23,24], transport:'eur-lex', effectiveFrom:'2024-10-17' }`; `assertOntologyValid()` bleibt grün; version === '1.3.0'.
- [ ] **2.2 Run → FAIL.**
- [ ] **2.3 Implement:**
  - `NormSourceEntry` (Zod) + optionale Felder: `celex?: string`, `language?: string` (ontologie-validiert gegen `languages`), `articleNumbers?: number[]`, `paragraphNumbers?: (number|string)[]` (für gesetze-im-internet/lksg), `effectiveFrom?: string`, `transport?: 'eur-lex'|'firecrawl'|'gesetze-im-internet'`.
  - `normSources`-Rows aus den **heutigen Code-Literalen** befüllen (verbatim aus `eur-lex.ts`/`firecrawl.ts`/`source-registry.ts` übertragen — nis2 celex 32022L2555 articles [20-24], dsgvo 32016R0679 [5,6,9,32], ai-act-en/de 32024R1689, data-act-en/de 32023R2854, lksg paragraphNumbers [3-9] transport gesetze-im-internet). **Genau abschreiben — das ist die Byte-Identitäts-Grundlage.**
  - `getNormSourceConfig(id)` in `index.ts`.
  - version → 1.3.0, CHANGELOG.
- [ ] **2.4 Rebuild + Run → PASS.**
- [ ] **2.5 Commit** `feat(ontology): normSources carry crawl config (celex/articles/transport), v1.3.0 (THE-418)`.

## Chunk 2: Registry daten-getrieben

### Task 3: `source-registry.ts` baut generisch aus der Ontologie (TDD)
**Files:** `source-registry.ts`, `eur-lex.ts`/`firecrawl.ts` (Factories raus), `source-registry.test.ts`
- [ ] **3.1 Failing test:** `SOURCE_ENTRIES` wird aus `NORM_ONTOLOGY.normSources` abgeleitet (nicht handgepflegt); `resolveSourceParser('nis2', env)` baut eine `EurLexSource` mit celex 32022L2555 + articles [20-24] (aus den Daten); für alle 7 gewirten Sources ein Parser; `dora` ohne celex → weiterhin null (bis Task 4).
- [ ] **3.2 Run → FAIL.**
- [ ] **3.3 Implement:** `source-registry.ts` iteriert `normSources` mit `celex`/`transport`, baut generisch:
  - transport `eur-lex` → `firecrawlKey ? new FirecrawlSource({...celex,articleNumbers,language}) : new EurLexSource({...})`
  - transport `gesetze-im-internet` → `lksgSource`-Äquivalent generisch (celex-los, paragraphNumbers).
  - Provenance `adapter`/`format` aus der Config oder transport abgeleitet.
  - Per-law-Factories in `eur-lex.ts`/`firecrawl.ts` entfernen (oder `@deprecated` + ungenutzt) — die generischen Engine-Klassen bleiben.
- [ ] **3.4 Verify:** tsc crawler; **Byte-Identitäts-Check:** ein Test vergleicht die erzeugte EurLexSource-Config je Source gegen die alten Factory-Werte (celex/articles/language/effectiveFrom identisch). Full `npx jest` 118+.
- [ ] **3.5 Commit** `refactor(crawler): source registry builds engines from ontology data, per-law factories removed (THE-418)`.

## Chunk 3: DORA als reine Daten + Beweis

### Task 4: DORA als Ontologie-Datenzeile (der AC-1-Beweis)
**Files:** `norm-ontology.v1.ts` (nur die dora-Row), `onboarding-is-data.test.ts`
- [ ] **4.1 Recherche (kein Code):** DORA CELEX `32022R2554`, Demo-Artikel-Set (z.B. Art. 5–16 ICT-Risk-Management, oder ein kuratierter Kern), effectiveFrom `2025-01-17`, language `en`. Werte dokumentieren.
- [ ] **4.2 Failing test** (`onboarding-is-data.test.ts`): `getNormSourceConfig('dora')` liefert celex 32022R2554; `resolveSourceParser('dora', env)` liefert eine funktionierende `EurLexSource` (nicht null) — **ohne Änderung an `source-registry.ts`** (der Beweis: Onboarding = nur Ontologie-Daten).
- [ ] **4.3 Run → FAIL** (dora-Row hat noch keine celex/articles).
- [ ] **4.4 Implement:** die `dora`-Row in `norm-ontology.v1.ts` um `celex/language/articleNumbers/effectiveFrom/transport` ergänzen. **Sonst nichts.** version → 1.3.1, CHANGELOG.
- [ ] **4.5 Run → PASS.** `git show --stat` am Ende: der DORA-Onboarding-Commit berührt **nur** `norm-ontology.v1.ts` + CHANGELOG — **kein Code**. Das IST AC-1.
- [ ] **4.6 Commit** `feat(ontology): onboard DORA as pure data row — zero code (THE-418 AC-1 proof)`.

### Task 5: E2E-Beweis (nach Server-B-Deploy)
> Braucht den Crawler-Deploy des Umbaus auf Server B + SSH/Tailnet.
- [ ] **5.1** Crawler auf Server B deployen (Coolify-Redeploy von master nach Merge, oder Branch-Deploy für den Test).
- [ ] **5.2** DORA crawlen: `POST /crawl {sources:['dora'], skipEmbedding:true}` → `inserted > 0, errors:[]`. Stichprobe: Korpus-Docs `source:'dora'` mit provenance + ontologyVersion.
- [ ] **5.3 E2E ICM→REQGEN→GAP** für DORA in einem Testprojekt: ICM-Mapping erzeugt Mappings gegen DORA-Paragraphen; REQGEN generiert Requirements aus DORA; GAP liefert eine DORA-Gap-Summary. Jeder Schritt dokumentiert (Screenshots/JSON).
- [ ] **5.4** Abnahme: der **gesamte DORA-Onboarding-Diff** (Task 4) = Daten-Rows, null Code; Pipeline lief für ein vorher unwired-Gesetz.

## Chunk 4: Abschluss

### Task 6: Vollverifikation + PR + Linear
- [ ] Grep-Beweis: keine CELEX-Literale mehr in `source-registry.ts`; per-law-Factory-Exports weg/deprecated. Crawler-Suite grün, tsc clean, turbo build.
- [ ] PR; Body betont den AC-1-Beweis (DORA-Diff = Daten-only) + Byte-Identität der 4 Bestandsgesetze.
- [ ] THE-418 → In Progress; Kommentar mit dem Repo-Diff-Beweis + E2E-Evidenz. `.6-Härtetests` (BGEID/eIDAS2) als Folge-Ticket (brauchen .3/.4) anlegen/vermerken.
- [ ] Memory `progress_uc_canon_001`: .6-Kern done, Onboarding jetzt daten-getrieben.

## Reihenfolge & Risiko
Chunk 1→2 (Config→Daten + Registry-Umbau) ist der Kern-Aufwand; **Byte-Identität der 4 Gesetze = Haupt-Watch-Point** (Test in 3.4). Chunk 3 (DORA-Row + Beweis) ist klein — das ist der Payoff. Chunk 4 = E2E braucht Deploy. Der Slice realisiert die Produkt-These und räumt zugleich die CELEX-Scattering-Tech-Debt weg.
