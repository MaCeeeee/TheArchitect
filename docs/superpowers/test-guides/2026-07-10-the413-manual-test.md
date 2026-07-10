# Manuelle Test-Anleitung — THE-413 Source-Registry-as-data

**Was getestet wird:** [THE-413](https://linear.app/thearchitect/issue/THE-413) / [PR #42](https://github.com/MaCeeeee/TheArchitect/pull/42) — Regulierungs-Quellen sind jetzt **Ontologie-Daten** (`packages/shared/src/ontology/norm-ontology.v1.ts` → `normSources`) statt in 7 TS-Enums am Kern. Validierung an den Schreibgrenzen (Mongoose-Validatoren + Route/Scheduler-Gates), Reads bleiben tolerant.

**Scope-Grenze — wichtig:** THE-413 ist nur der **Registry-Mechanismus**. Ein neues Gesetz *end-to-end durch Crawl → ICM → REQGEN → GAP* onboarden ist THE-414 (.2 Parser) + THE-418 (.6 Beweis). Hier testen wir also: „wird eine Quelle als Daten erkannt/validiert" — **nicht** „lässt sich NIS2 vollständig einlesen".

Kein UI-Anteil — deshalb kein Playwright/`webapp-testing`, sondern Modell-/API-Ebene.

---

## Teil A — Automatisiertes Smoke (Zero-Setup, 30 Checks)

Keine DB, kein Login, kein laufender Server nötig — läuft direkt gegen die kompilierten Modelle (`validateSync`, offline).

```bash
cd /Users/mac_macee/javis
npm run build                      # falls dist veraltet
node scripts/the413-smoke.mjs
```

**Erwartet:** `Result: 30 passed, 0 failed`. Deckt ab:
1. jede Ontologie-Quelle wird akzeptiert (datengetrieben iteriert, keine hartcodierte Liste)
2. unbekannte Quelle/Jurisdiktion abgelehnt; Reject-Message nennt `norm-ontology.v1.ts`; Jurisdiktion exakt-case (`eu` ≠ `EU`)
3. **null-Parität** (der Review-Fund): `Regulation.source: null` weiter durch `required` abgelehnt, `Policy.source: null` vom Validator durchgelassen (Alt-Dokumente brechen nicht)
4. `Policy.source` teilt sich dieselbe Registry (togaf/archimate/nis2/custom)
5. Key-Byte-Stabilität (`buildRegulationKey`/`normaliseParagraph`/`computeVersionHash` unverändert — AC-3/AC-4)
6. Gate-Helper `isNormSource('ai-act-en') === true` (der THE-396-Fix)

---

## Teil B — Der manuelle Kern: „neues Gesetz = EINE Datenzeile" (AC-1)

Das ist der einzige Teil, den automatische Tests **nicht** beweisen können (sie editieren die Ontologie ja nicht). Verifiziert am 2026-07-10.

**Schritt 1 — vorher prüfen (unbekannt → abgelehnt):**
```bash
cd /Users/mac_macee/javis
node -e "const {isNormSource}=require('./packages/shared/dist/index.js'); console.log(isNormSource('zzz-testlaw'))"
# → false
```

**Schritt 2 — EINE Datenzeile hinzufügen.** In `packages/shared/src/ontology/norm-ontology.v1.ts`, im `normSources`-Array (z. B. vor `{ id: 'custom', ... }`):
```ts
    { id: 'zzz-testlaw', label: 'SMOKE TEST — remove me' },
```
(Ontologie-Disziplin: eigentlich auch `ontologyVersion` bumpen + CHANGELOG — für den Test egal, wird eh zurückgerollt.)

**Schritt 3 — nur `shared` neu bauen, beobachten (akzeptiert, kein weiterer Code):**
```bash
npm run build -w @thearchitect/shared
node -e "
const {isNormSource}=require('./packages/shared/dist/index.js');
const {Regulation}=require('./packages/server/dist/models/Regulation.js');
console.log('isNormSource:', isNormSource('zzz-testlaw'));                    // → true
const err=new Regulation({source:'zzz-testlaw',jurisdiction:'EU',paragraphNumber:'Art. 1',title:'t',fullText:'x'.repeat(60),sourceUrl:'https://e.org',effectiveFrom:new Date(),language:'en'}).validateSync();
console.log('Regulation validiert:', err?.errors?.source ? 'ABGELEHNT' : 'AKZEPTIERT');  // → AKZEPTIERT
"
```
`git diff --stat` zeigt: **genau eine Datei geändert, eine Zeile** — kein Enum-Edit, keine Parser-Klasse, kein Schema-Change. Das ist REQ-CANON-001.1.

**Schritt 4 — sauber zurückrollen:**
```bash
git checkout packages/shared/src/ontology/norm-ontology.v1.ts
npm run build -w @thearchitect/shared
node -e "const {isNormSource}=require('./packages/shared/dist/index.js'); console.log(isNormSource('zzz-testlaw'))"
# → false
```

---

## Teil C — Optional: Live-API-Pfad (Server läuft auf :4000)

Beweist die HTTP-Gates statt der Modelle. Braucht ein JWT (einloggen im UI → DevTools → Access-Token) und eine `projectId`.

```bash
TOKEN="<access-token>"; PROJECT="<projectId>"

# C1 — THE-396-Fix: ai-act-en kommt jetzt durch das Source-Gate (vorher stumm gedroppt)
curl -s -X POST "http://localhost:4000/api/projects/$PROJECT/regulations/crawl" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sources":["ai-act-en"]}' | jq '.'
# Erwartet: KEIN 400 "invalid sources" mehr (Crawl startet / Crawler-Antwort). Vor THE-413: ai-act-en wurde herausgefiltert.

# C2 — Write-Boundary: erfundene Quelle wird abgelehnt
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:4000/api/projects/$PROJECT/regulations/crawl" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sources":["totally-made-up"]}'
# Erwartet: 400 (bzw. Filterung auf leere Quellenliste — je nach Route-Semantik)
```
> Hinweis: Der **Crawler** (Server B, Coolify) validiert erst nach separatem Deploy mit — der Server-A-Teil ist nach PR-Merge live.

---

## Abnahme-Matrix (AC → Beweis)

| AC | Aussage | Beweis |
|---|---|---|
| **AC-1** | neue Quelle = Datenzeile, kein Code-Edit | Teil B (edit-observe, verifiziert) |
| **AC-2** | Enums am Kern weg, Writes ontologie-validiert | Teil A [1][2][4] + `grep -rn "RegulationSourceKey\|VALID_SOURCES" packages/*/src` → 0 |
| **AC-3** | Key-Utility-Replika auf shared kollabiert | Teil A [5] + `ls packages/server/src/services/wfcomp/regulationKey.ts` → weg |
| **AC-4** | bestehende `regulationKey` non-breaking | Teil A [5] + `cd packages/server && npx jest -t "norm" --maxWorkers=1` → 69/69 |
| **+ THE-396** | ai-act/data-act erreichbar | Teil A [6] + Teil C1 |
| **+ Review** | null-Parität (Alt-Docs safe) | Teil A [3] |

**Bekannte Rot-Heringe:** `remediation.test.ts` / `audit.test.ts` brauchen einen laufenden Live-Stack (localhost:4000 + Mongo/Neo4j/Redis) und sind ohne diesen rot — Vorbestand, kein THE-413-Bezug (THE-435).
