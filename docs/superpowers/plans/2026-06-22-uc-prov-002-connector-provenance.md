# UC-PROV-002 — Connector-Source-Provenance & Origin-Metadaten

**Linear:** [THE-333](https://linear.app/thearchitect/issue/THE-333) (UC) · REQ THE-334…338
**Datum:** 2026-06-22 · **Status:** Plan
**Kontext-Doc:** `docs/strategy/2026-06-21-trust-spine.md`

---

## Problem (Pre-Flight-Befund)

Die Trust-Spine-Schleife ist **geschlossen, aber anonym**. `createTemporaryGraph()`
(`packages/server/src/services/upload.service.ts:555`) stempelt jeden Import hart mit
`provenance:'import', source:'upload'` (Zeilen 569 + 604). Folge: GitHub, n8n, SAP, CSV,
Excel sind im Notar (`certification/pending`) und im Trust-Summary nicht unterscheidbar.
Der Architekt sieht „importiert", aber nicht „aus Repo X, gezogen am Z".

**Hebel:** `ParseResult.format` trägt die Quelle bereits:
- Connector-Sync → `format: 'connector:<type>'` (`connector.routes.ts:135`)
- Datei-Import → `format: 'csv'|'excel'|'archimate'|'json'` (`parseArchitectureFile`)

→ `source` lässt sich an **einer** Stelle aus `parsed.format` ableiten. Kein Call-Site-Change nötig.

## Prinzipien

- **Rein additiv.** Kein Refactor. Default `'upload'` bleibt Fallback (backward-compat).
- **Ein Hook trägt alles** — `createTemporaryGraph` ist der gemeinsame Trichter für 13 Connectoren + Uploads.
- **Kein-Overwrite** — `provenance`/`confidence` und Nicht-Import-Pfade (Auto-Heal, Projection, Blueprint) bleiben byte-identisch.
- English-first UI-Strings, Dark-Theme-Palette.

---

## REQ-PROV-002.1 — `source` aus `parsed.format` ableiten  ([THE-334](https://linear.app/thearchitect/issue/THE-334))

**Datei:** `packages/server/src/services/upload.service.ts`

1. Normalizer ergänzen (neben den Typen):
   ```ts
   // 'connector:github' → 'github' | 'csv' → 'csv' | unbekannt → 'upload'
   export function deriveSourceFromFormat(format?: string): string {
     if (!format) return 'upload';
     if (format.startsWith('connector:')) return format.slice('connector:'.length);
     const known = ['csv', 'excel', 'archimate', 'json', 'leanix', 'blueprint'];
     return known.includes(format) ? format : 'upload';
   }
   ```
2. In `createTemporaryGraph`: `const source = deriveSourceFromFormat(parsed.format);`
   und in beiden CREATE-Queries `source: 'upload'` → `source: $source` (Param ergänzen).
   `provenance: 'import'` unverändert.
3. Optionaler expliziter Override für Sonderfälle:
   `createTemporaryGraph(parsed, opts?: { source?: string })` → `opts?.source ?? deriveSourceFromFormat(parsed.format)`.

**Call-Sites:** keine Pflicht-Änderung. (Connector + Import setzen `format` bereits korrekt.)

**Tests:** github/n8n/csv-Import → erwarteter `source` in Neo4j; ohne format → `'upload'`.

---

## REQ-PROV-002.2 — Origin-Metadaten  ([THE-335](https://linear.app/thearchitect/issue/THE-335))

**Dateien:** `upload.service.ts`, `connector.routes.ts`, `packages/shared/src/types/architecture.types.ts`, `certification.routes.ts`

**Design-Entscheidung:** Origin als **dedizierter optionaler Feld-Block** (nicht unter `properties`)
→ saubere Cypher-Abfragbarkeit für Audit. Batch-Level (gilt für den ganzen Sync):
- `sourceRef` (Repo/URL/Commit — aus `fetchResult.metadata`)
- `importedAt` (= das vorhandene `now`)
- `connectorConfigId` (Connector-Name/-Id, sonst null)

1. **Shared-Types:** optionalen Block `OriginFields { sourceRef?, importedAt?, connectorConfigId? }`
   neben `ProvenanceFields` an `ArchitectureElement` + `Connection`. Kompiliert mit/ohne.
2. **`createTemporaryGraph(parsed, opts?)`** um `opts.origin` erweitern → in beide CREATE-Queries
   (nur setzen, wenn vorhanden; sonst Felder weglassen — kein null-Rauschen).
3. **`connector.routes.ts:138`:** `createTemporaryGraph(parsed, { origin: { sourceRef: fetchResult.metadata?.url ?? …, connectorConfigId: connectorName } })`.
   (Metadaten existieren bereits, werden heute nur in `syncResult.metadata` zurückgegeben — Zeile 150.)
4. **`certification.routes.ts` (pending):** Read-Path liefert die Origin-Felder mit (Spread/Projection prüfen, ggf. ergänzen).

**Kein-Overwrite-Test:** `provenance`/`source`/`confidence` byte-identisch zu REQ-1.

---

## REQ-PROV-002.3 — Notar-Queue-UI  ([THE-336](https://linear.app/thearchitect/issue/THE-336))

**Datei:** `packages/client/src/components/.../CertificationQueue.tsx` (aus THE-329)

- Herkunfts-Badge zeigt echten `source` (Icon/Farbe pro Quelle) statt generisch „import".
- Sekundäre Origin-Zeile: `sourceRef` + `importedAt` (relative Zeit) — graceful bei leer (Alt-Importe).
- Optionaler Gruppieren/Filter-Header nach `source` („GitHub (12) · n8n (4) · CSV (8)").
- Single-/Batch-Certify + 3D-Fokus unverändert. Component-Test für Badge + Origin-Zeile.

---

## REQ-PROV-002.4 — Trust-Summary `bySource`  ([THE-337](https://linear.app/thearchitect/issue/THE-337))

**Dateien:** `certification.routes.ts` (trust-summary, aus THE-331), `TrustSummaryWidget.tsx` (THE-332)

- Aggregat-Query um `bySource` erweitern (`{ total, confirmed, unconfirmed }` je Quelle),
  gleiche `confirmed`-Definition wie THE-331 (`coalesce(provenance,'user')='user' OR certifiedBy IS NOT NULL`),
  über Elemente UND Connections. Quellen ohne Atome werden weggelassen.
- Widget zeigt optional Top-Quellen („40% from connectors, unverified"); Klick → gefilterte Queue (falls REQ-3-Filter).
- `byProvenance` etc. unverändert.

---

## REQ-PROV-002.5 — Cross-Cutting Tests + Verifikation  ([THE-338](https://linear.app/thearchitect/issue/THE-338))

- ≥12 Tests gesamt, `npx jest` grün.
- **E2E:** GitHub-Sync → `source:'github'` + Origin → Queue mit Badge → certify → raus aus pending → `bySource.github.confirmed++`.
- Kein-Overwrite (Auto-Heal/Projection/Blueprint byte-identisch). Multi-Tenant `projectId`-Scope.
  Backward-compat (Alt-Importe → Badge „upload", keine Origin-Zeile).

---

## Reihenfolge & Risiko

REQ-1 (Kern, minimal) → REQ-2 (Metadaten) → REQ-3 (Queue-UI) → REQ-4 (Summary) → REQ-5 (Verifikation).
REQ-1+2 = harter Kern (de-anonymisiert); REQ-3+4 = Sichtbarkeit. Alles additiv, ein gemeinsamer Trichter.

## Branch

`mganzmanninfo/the-334-req-prov-0021-source-aus-format` (REQ-1 zuerst), dann je REQ ein Commit.
