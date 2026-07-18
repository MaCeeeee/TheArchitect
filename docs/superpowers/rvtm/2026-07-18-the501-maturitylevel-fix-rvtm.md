# RVTM — THE-501 (maturityLevel field-name alias)

**Bug:** THE-501 · **Related:** UC-FIX-001 (THE-498), Slice 2 (THE-502) — dieser Fix entblockt `maturityLevel` für spätere Aufnahme in `AUTO_FIXABLE_FIELDS`.
**Branch:** `mganzmanninfo/the-501-bug-maturitylevel-regeln-losen-nie-auf-feldname-mismatch` (von `origin/master` c7b091d)

## Root Cause

Beide Element-Lesepfade (`compliance.service.ts`, `policy-evaluation.service.ts`) mappen die Neo4j-Spalte `e.maturityLevel` auf den Objekt-Key `maturity`. Die Regel-Auswertung liest aber `getFieldValue(el, rule.field)` mit dem UI-Feldnamen `'maturityLevel'` (PolicyManager-FIELDS) → `el.maturityLevel` ist `undefined`. Vokabular-Diff bestätigt: **einziger Mismatch** — alle anderen Felder (`description, riskLevel, status, type, layer, name`) matchen direkt.

## Fix

Ein Alias in `getFieldValue` (compliance.service.ts) — `field === 'maturityLevel' ? 'maturity' : field` vor der Split/Reduce-Auflösung. Fixt **beide** Lesepfade an einer Stelle (policy-evaluation importiert dieselbe Funktion). `getBuiltInChecks`, Cypher-Queries und Objekt-Key-Namen unverändert.

## Traceability

| Kriterium | Verifikation | Evidence |
|---|---|---|
| Erfüllte `maturityLevel gte`-Regel → keine Violation | `policy-evaluation.test.ts` neuer Test 1 | **PASS** |
| Nicht erfüllte Regel → offene Violation mit echtem `currentValue` (nicht `undefined`) | neuer Test 2 (`currentValue===3`) | **PASS** — pinnt den Bug spezifisch (vorher hätte auch eine Phantom-Violation mit `currentValue:undefined` bestanden) |
| Report-Pfad (`checkCompliance`) profitiert vom selben Fix | neuer Test 3 | **PASS** |
| Keine Regression auf bestehende `field:'maturity'`-Tests (Alias trifft nur exakten String `'maturityLevel'`) | 5 vorbestehende Tests (Z.660/712/770/979/1088) | **PASS** — unverändert grün |
| Gesamtsuite | `policy-evaluation` voll + `compliance-score`/`compliance-operator` | **PASS** — 64/64 + 4/4 |

## Evidenz

Server `policy-evaluation` (voll): 64/64. `compliance-score` + `compliance-operator`: 4/4. Kein Client-Code, kein Shared-Typ geändert, kein Migrationsbedarf (reine Lese-Logik-Korrektur, kein Datenformat betroffen).

## Nebenfund (kein Scope-Zuwachs)
Seed-/DORA-Policies (`seed-policies.ts:43`) nutzen bereits `field:'maturity'` (den internen Key) — waren vom Bug nie betroffen. Nur handgemachte Policies über den PolicyManager-UI-Dropdown (`maturityLevel`) trafen ihn.

## Follow-up (separater Scope, nicht Teil dieses Fixes)
`maturityLevel` in `packages/shared/src/utils/violation-fix.ts` `AUTO_FIXABLE_FIELDS` aufnehmen (entblockt `gte/lte`-Ein-Klick-Fix aus UC-FIX-001 Slice 2) — braucht eigene Betrachtung der Zahl-Koerzierung für den PUT-Payload.
