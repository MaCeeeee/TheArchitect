# UC-FIX-001 Slice 1: Deterministische „Here's the fix"-Ebene für Policy-Violations — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. TDD ist bindend: erst der rote Test, dann der Code.

**Goal:** Jede Policy-Violation bekommt eine deterministische, klick-nahe Handlungsanweisung. Eine pure Funktion `deriveViolationFix({ operator, field, currentValue, expectedValue })` in `@thearchitect/shared` übersetzt `(operator, field, current, expected)` in (a) einen Imperativ-Satz („Set status to approved") und (b) eine wiederverwendbare `RemediationAction` vom Typ `edit_field` (füllt das heute nie befüllte `payload`). Der bestehende `ComplianceDashboard` zeigt zusätzlich zur Violation-Message eine Fix-Zeile. KEIN LLM, KEINE neue Engine, KEIN neuer Store, KEIN neues Panel, KEIN `[Fix]`-Button (das ist Slice 2). Slice 1 baut ausschließlich additiv auf THE-202 auf.

**Architecture:** Es gibt zwei getrennte Violation-Datenflüsse — das ist der zentrale Kontext (siehe unten). (1) Der **persistierte Pfad**: `PolicyViolation` (Mongo) → `PolicyViolationDTO` → `GET /violations` → `complianceStore` (PropertyPanel/Sidebar). (2) Der **Report-Pfad**: `checkCompliance()` (non-persisting, live) → `ComplianceReport.violations` → `GET /compliance` → **`ComplianceDashboard`**. Der Dashboard — das Render-Ziel von AC-4 — liest AUSSCHLIESSLICH den Report-Pfad, NICHT den persistierten. Deshalb wird `operator` an ZWEI Stellen additiv durchgereicht: einmal für den persistierten Pfad (AC-3, Fundament für Slice 2) und einmal für den Report-Pfad (der den Dashboard tatsächlich speist). `deriveViolationFix` ist rein und wird in Slice 1 vom Dashboard konsumiert; die `RemediationAction` mit gefülltem `payload` ist Vorarbeit für den Slice-2-`[Fix]`-Button.

**Tech Stack:** TypeScript-Monorepo (`packages/shared` baut ZUERST → `server` → `client`). Server: Express + Mongoose + Neo4j, Jest + mongodb-memory-server. Client: React + Vite, Vitest. Die Fix-Funktion selbst hat keine Laufzeit-Abhängigkeiten (pure TS).

**RVTM:** `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice1-rvtm.md` (im Closeout-Task anzulegen, Muster: `docs/superpowers/rvtm/2026-07-11-uc-choice-003-preflight-rvtm.md`).

**Linear:** Parent **THE-498** (UC-FIX-001) · REQ **THE-499** (REQ-FIX-001.1, Slice 1). Beim Abschluss THE-499 → Done mit Datei-Liste; THE-498 bleibt offen (weitere Slices).

**Branch:** `mganzmanninfo/the-499-uc-fix-001-slice1-deterministic-violation-fix` (von `master`).

---

## Kontext für den Implementierer (zero context)

### Monorepo + der Stale-dist-Trap (Pflichtwissen)

`packages/shared` liefert Typen und pure Utils. Der Symlink `node_modules/@thearchitect/shared → packages/shared` und `package.json.main = ./dist/index.js` bedeuten: **jeder Import aus `@thearchitect/shared` löst gegen `packages/shared/dist` auf, NICHT gegen `src`.** Weder der Server-Jest (`jest.config.ts`, kein `@thearchitect/shared`-Mapping) noch der Client-Vitest (`vite.config.ts`, kein `src`-Alias für shared) mappen auf `src`. **Konsequenz: Nach JEDER Änderung an `packages/shared/src` MUSST du `npm run build --workspace=@thearchitect/shared` laufen lassen, bevor Server- oder Client-Tests die neue Funktion/das neue Feld sehen.** Vergisst du das, importiert der Test das alte dist und schlägt mit „`deriveViolationFix` is not a function" oder fehlendem Feld fehl — ein bekannter Zeitfresser.

### Die ZWEI Violation-Datenflüsse (zentral — nicht verwechseln)

| | Persistierter Pfad | Report-Pfad (Dashboard) |
|---|---|---|
| Quelle | `PolicyViolation` (Mongo, upsert in `policy-evaluation.service.ts`) | `checkCompliance()` (live, `compliance.service.ts`) |
| Objekttyp | `IPolicyViolation` / `PolicyViolationDTO` | `ComplianceViolation` / `ComplianceReport` |
| Route | `GET /:projectId/violations` (`governance.routes.ts:362`) | `GET /:projectId/compliance` (`governance.routes.ts:314`) |
| Client-API | `governanceAPI.getViolations` (`api.ts:334`) | `governanceAPI.checkCompliance` (`api.ts:329`) |
| Client-Konsument | `complianceStore` → PropertyPanel/Sidebar | **`ComplianceDashboard.tsx` (AC-4-Ziel)** |

**Der `ComplianceDashboard` ruft `governanceAPI.checkCompliance(projectId)` (Datei `ComplianceDashboard.tsx:44`) und rendert `ComplianceReport.violations` — er liest den persistierten Pfad NICHT.** Damit AC-4 einen operator-bewussten Fix anzeigen kann, muss `operator` im **Report-Pfad** (`ComplianceViolation`) ankommen (Task 3). Der persistierte Pfad (Task 2) ist AC-3 wörtlich und Fundament für den Slice-2-`[Fix]`-Button, wird in Slice 1 aber vom Dashboard NICHT konsumiert. Beide sind billig + additiv; beide gehören in diesen Slice.

### Die wiederverwendete `RemediationAction` (KEIN neuer Typ)

`packages/shared/src/types/advisor.types.ts` (barrel-exportiert via `index.ts:13`):

- `RemediationActionType = 'retire_element' | 'add_connection' | 'update_status' | 'edit_field' | 'batch_edit'` (Zeile 22-27). **`edit_field` existiert bereits — wiederverwenden, keinen neuen Typ definieren (AC-2).**
- `RemediationAction { type: RemediationActionType; label: string; elementId?: string; payload?: Record<string, unknown> }` (Zeile 36-41). Das `payload?: Record<string, unknown>` ist heute nirgends befüllt — `deriveViolationFix` füllt es mit `{ field, value: expectedValue }`.

### Der Operator-Enum (die Wertemenge zum Switchen)

Identisch in `Policy.ts:8` (`IPolicyRule.operator`) und `compliance.types.ts:81` (`PolicyDraftRule.operator`):
`'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex'`.

Die tatsächliche Auswertungs-Semantik steht in `compliance.service.ts:190-203` (`evaluateRule`). Wichtig für die Fix-Formulierung:
- `exists`: `expected ? (value != null && value !== '') : (value == null || value === '')`. Also `exists:true` verletzt wenn Feld leer → **„Add {field}"**; `exists:false` verletzt wenn Feld vorhanden → **„Remove {field}"**.
- `not_equals`: `value !== expected` (verletzt wenn `value === expected`). `expectedValue` ist hier der **verbotene** Wert → **„Change {field} — must not be {expectedValue}"**, `applicable:false` (kein konkreter Zielwert für einen Ein-Klick-Fix; der Mensch wählt einen neuen Wert). Entschieden 2026-07-17 (REQ-Owner), damit die Anzeige nicht auf den verbotenen Wert zeigt.

### `deriveViolationFix` — Kontrakt

Signatur (AC-1): `deriveViolationFix({ operator, field, currentValue, expectedValue })`. `operator` ist **optional** (die ~1992 Legacy/migrierten Violations haben bis zur Re-Evaluation keinen). Rückgabe:

```ts
interface ViolationFix {
  applicable: boolean;              // true → action ist eine anwendbare edit_field-Aktion
  instruction: string;             // immer gesetzt: Imperativ ODER generischer Hinweis
  action?: RemediationAction;      // nur wenn applicable (AC-2); wiederverwendet edit_field
}
```

Mapping (AC-1): `equals` → „Set {field} to {expectedValue}" (applicable, `edit_field`-Action); `not_equals` → „Change {field} — must not be {expectedValue}" (**`applicable:false`, keine Action** — der verbotene Wert ist kein Ein-Klick-Ziel; korrigiert 2026-07-17); `exists:true` → „Add {field}"; `exists:false` → „Remove {field}"; `gt/gte/lt/lte` → „Set {field} {>/≥/</≤} {expectedValue}"; `contains` → „Include '{expectedValue}' in {field}"; `regex` → `applicable:false` + generischer Hinweis (Slice 3); fehlender/unbekannter `operator` → `applicable:false` + generischer „{field} should be {expectedValue}"-Hinweis (AC-3, nie crashen).

### Testkonventionen

- **`packages/shared` hat KEINEN Test-Runner** (nur `build`/`dev`/`clean`/`lint`, keine `*.test.ts`). Deshalb leben die `deriveViolationFix`-Unit-Tests in der **Client-Vitest-Suite** (`packages/client`, `test.include: src/**/*.test.ts`), importiert aus `@thearchitect/shared`. Das ist konform: mehrere Client-Tests importieren bereits aus shared (`complianceStore.mappings.test.ts`, `roadmapProgress.test.ts` …), und der Slice-1-Konsument ist der Client. Lauf: `npx vitest run <pfad>` aus `packages/client`.
- **Server-Jest:** Tests in `packages/server/src/__tests__/*.test.ts`, `ts-jest`, mongodb-memory-server. `policy-evaluation.test.ts` mockt Neo4j/WebSocket/policy-graph (Helper `fakeNeo4jRecord({...})`, Konstanten `PROJECT_ID`/`USER_ID`). Lauf: `npm test --workspace=@thearchitect/server -- --testPathPattern=<name>`.
- **Server-Suite ist teilweise flaky** (9-10 Integrations-Suites brechen vorbestehend beim Setup mit „circular structure JSON" — keine echten Regressionen). Deshalb **nur die gezielten `--testPathPattern`-Suiten laufen lassen**, NICHT die Gesamt-Suite als Gate nehmen.
- **Client-Build-Gate:** `npm run build --workspace=@thearchitect/client` bzw. `tsc -b` bricht KALT mit 19 vorbestehenden `ViolationSeverity`-Fehlern ab (bekannt). Das Gate ist **`npx vitest run` (+ optional `npx vite build`)**, NICHT `tsc -b`/`npm run build`.
- **Parallele Sessions teilen den Git-Index** → immer **pfad-selektiv** `git add <konkrete dateien>` (nie `git add -A`), atomar committen.

### Commit-Konvention

`feat(compliance): <was> (THE-499)` + Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## AC-1-Korrektur `not_equals` (entschieden 2026-07-17)

Die ursprüngliche AC-1 gruppierte `equals`/`not_equals` → „Set {field} to {expectedValue}". Bei `not_equals` ist `expectedValue` (= `rule.value`) aber der **verbotene** Wert (Regel `value !== expected`, verletzt wenn `value === expected`) — die Anweisung wäre invertiert (würde anweisen, das Feld AUF den verbotenen Wert zu setzen) und ein späterer `[Fix]`-Button (AC-2, `payload.value = expectedValue`) würde den verbotenen Wert schreiben.

**Entscheidung des REQ-Owners:** `not_equals` liefert stattdessen `instruction: „Change {field} — must not be {expectedValue}"` mit **`applicable:false`** und **keiner Action** — der verbotene Wert ist kein konkretes Ein-Klick-Ziel; einen neuen Wert wählt der Mensch. Damit zeigt schon Slice 1 (nur Anzeige) die korrekte Aussage, und Slice 2 hat keinen falschen `payload` zu befürchten. `equals` bleibt „Set {field} to {expectedValue}" (applicable, `edit_field`). Task 1 unten setzt das direkt so um (kein `FLAGGED`-Zwischenstand mehr).

---

## File-Struktur (was entsteht / was sich ändert)

| Datei | Aktion | Verantwortung |
|---|---|---|
| `packages/shared/src/utils/violation-fix.ts` | Create | Pure `deriveViolationFix` + `ViolationFix`/`DeriveViolationFixInput`; wiederverwendet `RemediationAction`/`edit_field` (AC-1, AC-2) |
| `packages/shared/src/index.ts` | Modify | Barrel-Export `export * from './utils/violation-fix';` (nach den anderen `./utils/*`, Zeile ~37) |
| `packages/client/src/utils/deriveViolationFix.test.ts` | Create | Vitest-Unit-Tests: jeder Operator, regex-Fallback, missing-operator-Fallback, leeres currentValue (exists) (AC-5) |
| `packages/server/src/models/PolicyViolation.ts` | Modify | `operator?: string` additiv in `IPolicyViolation` + Schema (AC-3, persistierter Pfad) |
| `packages/server/src/services/policy-evaluation.service.ts` | Modify | `operator: rule.operator` in BEIDE Upsert-`$set`-Blöcke (Z.193-212 + Z.279-296) |
| `packages/shared/src/types/compliance.types.ts` | Modify | `operator?: string` in `PolicyViolationDTO` (Z.50-75) |
| `packages/server/src/services/compliance.service.ts` | Modify | `operator?: string` in `ComplianceViolation` (Z.5-17) + `operator: rule.operator` im `violations.push` (Z.96-108) — der Pfad, der den Dashboard speist |
| `packages/server/src/routes/governance.routes.ts` | Verify (kein Code) | `GET /violations` reicht neues Feld automatisch via `v.toObject()`-Spread durch (Z.387-395) — nur verifizieren, ggf. eine Test-Assertion |
| `packages/server/src/__tests__/policy-evaluation.test.ts` | Modify | Assertion: Upsert schreibt `operator` (Task 2) |
| `packages/client/src/components/governance/ComplianceDashboard.tsx` | Modify | `operator?` im lokalen `Violation`-Interface (Z.7-17); `deriveViolationFix` aufrufen; Fix-Zeile rendern (Z.166-174) (AC-4) |
| `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice1-rvtm.md` | Create | RVTM-Stub im Closeout (Task 5) |

**Nicht im Scope:** `[Fix]`-Button/Anwenden der Aktion (Slice 2), `regex`-Vorschläge (Slice 3), LLM, PropertyPanel/Sidebar/3D (bleiben unangetastet), neuer Store/Panel/Engine.

---

## Task 1: `deriveViolationFix` in shared + Unit-Tests (TDD)

**Erfüllt:** AC-1, AC-2, AC-5.

**Files:**
- Create: `packages/shared/src/utils/violation-fix.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/client/src/utils/deriveViolationFix.test.ts`

- [ ] **Step 1: Failing Test schreiben**

`packages/client/src/utils/deriveViolationFix.test.ts`:

```ts
// REQ-FIX-001.1 (THE-499) — Unit-Tests der deterministischen Fix-Ableitung.
// SUT lebt in @thearchitect/shared (shared hat keinen Runner); Import aus dem
// gebauten dist — vorher `npm run build --workspace=@thearchitect/shared`.
import { describe, it, expect } from 'vitest';
import { deriveViolationFix } from '@thearchitect/shared';

describe('deriveViolationFix (REQ-FIX-001.1)', () => {
  it('equals → "Set {field} to {expectedValue}" + edit_field action (AC-1/AC-2)', () => {
    const fix = deriveViolationFix({ operator: 'equals', field: 'status', currentValue: 'draft', expectedValue: 'approved' });
    expect(fix.applicable).toBe(true);
    expect(fix.instruction).toBe('Set status to approved');
    expect(fix.action).toEqual({ type: 'edit_field', label: 'Set status to approved', payload: { field: 'status', value: 'approved' } });
  });

  it('not_equals → "Change {field} — must not be {expectedValue}", applicable:false, keine Action (korrigiert 2026-07-17)', () => {
    const fix = deriveViolationFix({ operator: 'not_equals', field: 'tier', currentValue: 'gold', expectedValue: 'gold' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('Change tier — must not be gold');
    expect(fix.action).toBeUndefined();
  });

  it('exists:true mit leerem currentValue → "Add {field}" (AC-5 empty-case)', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'owner', currentValue: '', expectedValue: true });
    expect(fix.applicable).toBe(true);
    expect(fix.instruction).toBe('Add owner');
    expect(fix.action).toEqual({ type: 'edit_field', label: 'Add owner', payload: { field: 'owner', value: true } });
  });

  it('exists:false → "Remove {field}"', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'legacyFlag', currentValue: 'on', expectedValue: false });
    expect(fix.instruction).toBe('Remove legacyFlag');
    expect(fix.action?.payload).toEqual({ field: 'legacyFlag', value: false });
  });

  it('gt/gte/lt/lte → "Set {field} {>|≥|<|≤} {expectedValue}"', () => {
    expect(deriveViolationFix({ operator: 'gt', field: 'n', currentValue: 1, expectedValue: 5 }).instruction).toBe('Set n > 5');
    expect(deriveViolationFix({ operator: 'gte', field: 'n', currentValue: 1, expectedValue: 5 }).instruction).toBe('Set n ≥ 5');
    expect(deriveViolationFix({ operator: 'lt', field: 'n', currentValue: 9, expectedValue: 5 }).instruction).toBe('Set n < 5');
    expect(deriveViolationFix({ operator: 'lte', field: 'n', currentValue: 9, expectedValue: 5 }).instruction).toBe('Set n ≤ 5');
  });

  it('contains → "Include \'{expectedValue}\' in {field}"', () => {
    const fix = deriveViolationFix({ operator: 'contains', field: 'tags', currentValue: 'a,b', expectedValue: 'pii' });
    expect(fix.instruction).toBe("Include 'pii' in tags");
    expect(fix.action?.payload).toEqual({ field: 'tags', value: 'pii' });
  });

  it('regex → applicable:false + generischer Hinweis, keine action (Slice 3)', () => {
    const fix = deriveViolationFix({ operator: 'regex', field: 'code', currentValue: 'x', expectedValue: '^[A-Z]+$' });
    expect(fix.applicable).toBe(false);
    expect(fix.action).toBeUndefined();
    expect(fix.instruction).toMatch(/pattern/i);
  });

  it('fehlender operator (Legacy-Violation) → generischer "should be"-Hinweis, crasht nie (AC-3)', () => {
    const fix = deriveViolationFix({ operator: undefined, field: 'status', currentValue: 'draft', expectedValue: 'approved' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('status should be approved');
    expect(fix.action).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test laufen lassen — FAIL** (Modul/Export existiert nicht)

Aus `packages/client`:
```bash
npx vitest run src/utils/deriveViolationFix.test.ts
```
Erwartung: FAIL („`deriveViolationFix` is not exported by @thearchitect/shared").

- [ ] **Step 3: `deriveViolationFix` implementieren**

`packages/shared/src/utils/violation-fix.ts`:

```ts
// REQ-FIX-001.1 (THE-499) — deterministische „Here's the fix"-Ableitung für
// eine einzelne Policy-Violation. Pur, kein I/O. Übersetzt
// (operator, field, currentValue, expectedValue) in einen Imperativ-Satz +
// eine wiederverwendbare RemediationAction. Wiederverwendet den
// edit_field-Typ aus advisor.types (KEIN neuer Action-Typ — AC-2).
// Konsumiert vom ComplianceDashboard (Slice 1) und vom [Fix]-Button (Slice 2).
// regex ist auf Slice 3 vertagt (AC-1).
import type { RemediationAction } from '../types/advisor.types';

export interface DeriveViolationFixInput {
  /** PolicyRule-Operator; ABWESEND bei Legacy/migrierten Violations (Graceful Fallback). */
  operator?: string;
  field: string;
  /** Teil des AC-1-Kontrakts + von der Dashboard-Transition-Zeile genutzt; die
   *  Imperativ-Templates referenzieren ihn nicht. */
  currentValue: unknown;
  expectedValue: unknown;
}

export interface ViolationFix {
  /** true → `action` ist eine anwendbare edit_field-RemediationAction. */
  applicable: boolean;
  /** Immer gesetzt: Imperativ („Set X to Y") oder generischer Hinweis. */
  instruction: string;
  /** Nur wenn applicable (AC-2). Wiederverwendet edit_field, nie ein neuer Typ. */
  action?: RemediationAction;
}

/** Menschenlesbare Darstellung eines unbekannten Regelwerts für Instruction-Strings. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'string') return v === '' ? '""' : v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function editField(field: string, value: unknown, label: string): ViolationFix {
  return { applicable: true, instruction: label, action: { type: 'edit_field', label, payload: { field, value } } };
}

export function deriveViolationFix(input: DeriveViolationFixInput): ViolationFix {
  const { operator, field, expectedValue } = input; // currentValue bewusst ungenutzt (s. Typ-Kommentar)

  // AC-3 Graceful Fallback: kein operator (Legacy-Violation) → generischer Hinweis, keine action.
  if (!operator) {
    return { applicable: false, instruction: `${field} should be ${fmt(expectedValue)}` };
  }

  switch (operator) {
    case 'equals':
      return editField(field, expectedValue, `Set ${field} to ${fmt(expectedValue)}`);

    case 'not_equals':
      // expectedValue ist der VERBOTENE Wert → kein Ein-Klick-Ziel. Korrekte
      // Aussage statt invertierter „Set to"-Anweisung (entschieden 2026-07-17,
      // REQ-Owner). Kein payload → applicable:false, keine Action.
      return { applicable: false, instruction: `Change ${field} — must not be ${fmt(expectedValue)}` };

    case 'exists':
      // exists:true verletzt wenn Feld leer → Add; exists:false verletzt wenn
      // Feld vorhanden → Remove. payload.value = expectedValue (AC-2).
      return expectedValue
        ? editField(field, expectedValue, `Add ${field}`)
        : editField(field, expectedValue, `Remove ${field}`);

    case 'gt':  return editField(field, expectedValue, `Set ${field} > ${fmt(expectedValue)}`);
    case 'gte': return editField(field, expectedValue, `Set ${field} ≥ ${fmt(expectedValue)}`);
    case 'lt':  return editField(field, expectedValue, `Set ${field} < ${fmt(expectedValue)}`);
    case 'lte': return editField(field, expectedValue, `Set ${field} ≤ ${fmt(expectedValue)}`);

    case 'contains':
      return editField(field, expectedValue, `Include '${fmt(expectedValue)}' in ${field}`);

    case 'regex':
      // Slice 3 (AC-1): kein deterministischer Einzel-Edit für ein Pattern.
      return { applicable: false, instruction: `Review ${field} to match the required pattern` };

    default:
      // Unbekannter Operator → gleiche graceful Haltung wie fehlender Operator.
      return { applicable: false, instruction: `${field} should be ${fmt(expectedValue)}` };
  }
}
```

Barrel ergänzen — `packages/shared/src/index.ts`, bei den übrigen `./utils/*`-Exporten (nach Zeile ~37 `export * from './utils/register-scoring';`):

```ts
export * from './utils/violation-fix';
```

- [ ] **Step 4: Shared bauen, dann Test — PASS**

```bash
npm run build --workspace=@thearchitect/shared
# aus packages/client:
npx vitest run src/utils/deriveViolationFix.test.ts
```
Erwartung: alle Fälle grün. (Ohne den shared-Build importiert Vitest das alte dist → rot; das ist der Stale-dist-Trap.)

- [ ] **Step 5: Commit** (pfad-selektiv)

```bash
git add packages/shared/src/utils/violation-fix.ts packages/shared/src/index.ts packages/client/src/utils/deriveViolationFix.test.ts
git commit -m "feat(compliance): deriveViolationFix deterministic fix derivation in shared (THE-499)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `operator` additiv auf `PolicyViolation` persistieren (TDD)

**Erfüllt:** AC-3 (persistierter Pfad — Fundament für Slice-2-`[Fix]`-Button; in Slice 1 vom Dashboard NICHT konsumiert). Graceful Fallback: Feld ist **optional**, Legacy-Docs haben es bis zur Re-Evaluation nicht.

**Files:**
- Modify: `packages/server/src/models/PolicyViolation.ts`
- Modify: `packages/server/src/services/policy-evaluation.service.ts`
- Modify: `packages/shared/src/types/compliance.types.ts`
- Modify: `packages/server/src/__tests__/policy-evaluation.test.ts`

- [ ] **Step 1: Failing Test** — in `policy-evaluation.test.ts` einen neuen `describe`-Block am Dateiende ergänzen. Er nutzt die vorhandenen Helper (`fakeNeo4jRecord`, `PROJECT_ID`, `USER_ID`, `mockRunCypher`); `loadElement` liest die Neo4j-Keys `id/name/type/layer/description` (siehe `policy-evaluation.service.ts:24-53`):

```ts
describe('REQ-FIX-001.1: operator persistence (THE-499)', () => {
  it('writes the rule operator onto the upserted violation', async () => {
    const policy = await Policy.create({
      projectId: PROJECT_ID, name: 'Desc', category: 'architecture',
      severity: 'high', enforcementLevel: 'advisory', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'needs desc' }],
      createdBy: USER_ID,
    });
    // Element ohne description → exists:true verletzt
    mockRunCypher.mockResolvedValue([fakeNeo4jRecord({
      id: 'el-op', name: 'X', type: 'application_component', layer: 'application', description: '',
    })]);

    const { evaluateElementPolicies } = await import('../services/policy-evaluation.service');
    await evaluateElementPolicies(PROJECT_ID.toString(), 'el-op', 'create');

    const v = await PolicyViolation.findOne({ elementId: 'el-op' });
    expect(v).not.toBeNull();
    expect(v!.operator).toBe('exists');
    expect(v!.ruleId).toBe(policy.rules[0].ruleId);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npm test --workspace=@thearchitect/server -- --testPathPattern=policy-evaluation -t "operator persistence"
```
Erwartung: FAIL (`v.operator` ist `undefined`).

- [ ] **Step 3: Modell + DTO + Upserts implementieren**

`PolicyViolation.ts` — Interface `IPolicyViolation` (nach `expectedValue: unknown;`, Z.19) ergänzen:
```ts
  operator?: string; // THE-499: PolicyRule-Operator für deterministische Fix-Ableitung; optional (Legacy-Docs ohne)
```
Schema (nach `expectedValue: { type: Schema.Types.Mixed }`, Z.57) ergänzen:
```ts
    operator: { type: String },
```

`policy-evaluation.service.ts` — in BEIDE Upsert-`$set`-Blöcke `operator: rule.operator` ergänzen (jeweils direkt neben `expectedValue: rule.value`). Beide Stellen liegen in `for (const rule of policy.rules)`, `rule.operator` ist also im Scope:
- `evaluateElementPolicies`: `$set` bei Z.193-212 (currentValue Z.205, expectedValue Z.206) → `operator: rule.operator,` ergänzen.
- `evaluateAllForPolicy`: `$set` bei Z.279-296 (currentValue Z.289, expectedValue Z.290) → `operator: rule.operator,` ergänzen.

`compliance.types.ts` — `PolicyViolationDTO` (Z.50-75), nach `expectedValue: unknown;` (Z.66):
```ts
  operator?: string; // THE-499
```

- [ ] **Step 4: Shared bauen (DTO-Änderung!), dann Test — PASS**

```bash
npm run build --workspace=@thearchitect/shared
npm test --workspace=@thearchitect/server -- --testPathPattern=policy-evaluation
```
Erwartung: neuer Test grün, bestehende policy-evaluation-Tests weiter grün.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/models/PolicyViolation.ts packages/server/src/services/policy-evaluation.service.ts packages/shared/src/types/compliance.types.ts packages/server/src/__tests__/policy-evaluation.test.ts
git commit -m "feat(compliance): persist rule operator on PolicyViolation + DTO (THE-499)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `operator` durch den Report-Pfad reichen — der Pfad, der den Dashboard speist (TDD)

**Erfüllt:** AC-3 (Report-Pfad) + Voraussetzung für AC-4. **Dies ist die Stelle, die AC-3 wörtlich NICHT nennt, von der AC-4 aber abhängt** (der Dashboard liest `checkCompliance`, nicht `getViolations`).

**Files:**
- Modify: `packages/server/src/services/compliance.service.ts`
- Verify (kein Code): `packages/server/src/routes/governance.routes.ts`
- (optional) Modify: `packages/server/src/__tests__/compliance-score.test.ts` oder ein neuer gezielter Test

- [ ] **Step 1: Failing Test** — leichtgewichtig gegen `checkCompliance`. Neuer Test `packages/server/src/__tests__/compliance-operator.test.ts` (Muster: `policy-evaluation.test.ts`-Header mit Neo4j-Mock). `checkCompliance` liest Elemente via `runCypher` und Policies via Mongo:

```ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Policy } from '../models/Policy';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn(), runCypherTransaction: jest.fn().mockResolvedValue([]) }));
const mockRunCypher = jest.requireMock('../config/neo4j').runCypher as jest.Mock;
const rec = (d: Record<string, unknown>) => ({ get: (k: string) => d[k] ?? null });

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await Policy.deleteMany({}); mockRunCypher.mockReset(); });

const PROJECT_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

describe('REQ-FIX-001.1: checkCompliance surfaces operator (THE-499)', () => {
  it('includes rule.operator on each ComplianceViolation', async () => {
    await Policy.create({
      projectId: PROJECT_ID, name: 'Desc', category: 'architecture',
      severity: 'high', enforcementLevel: 'advisory', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'needs desc' }],
      createdBy: USER_ID,
    });
    mockRunCypher.mockResolvedValue([rec({
      id: 'el-1', name: 'X', type: 'application_component', layer: 'application', description: '',
    })]);

    const { checkCompliance } = await import('../services/compliance.service');
    const report = await checkCompliance(PROJECT_ID.toString());

    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations[0].operator).toBe('exists');
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npm test --workspace=@thearchitect/server -- --testPathPattern=compliance-operator
```
Erwartung: FAIL (`operator` fehlt auf `ComplianceViolation`).

- [ ] **Step 3: Implementieren** — `compliance.service.ts`:

`ComplianceViolation`-Interface (Z.5-17), nach `expectedValue: unknown;`:
```ts
  operator?: string; // THE-499: optional, damit getBuiltInChecks (setzt kein operator) unangetastet bleibt
```
Im `violations.push({...})` innerhalb `checkCompliance` (Z.96-108, im `for (const rule of policy.rules)`, `rule.operator` im Scope), nach `expectedValue: rule.value,`:
```ts
            operator: rule.operator,
```
**`getBuiltInChecks` (Z.143-176) NICHT anfassen** — es setzt bewusst keinen operator; weil das Feld optional ist, kompiliert es weiter (und es fließt ohnehin nicht in den `checkCompliance`-Report ein).

- [ ] **Step 4: `GET /violations`-Passthrough verifizieren (kein Code)**

`governance.routes.ts:387-395` mappt via `const doc = v.toObject(); return { ...doc, policyId, policyName }`. Ein neues Schema-Feld (`operator` aus Task 2) wird durch den `...doc`-Spread **automatisch** durchgereicht — keine explizite Mapping-Änderung nötig. Gleiches gilt für `by-element` (Z.421-429). Kurz gegenlesen und im PR notieren: „operator passthrough = toObject-Spread, kein Route-Code geändert".

- [ ] **Step 5: Run — PASS**

```bash
npm test --workspace=@thearchitect/server -- --testPathPattern=compliance-operator
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/compliance.service.ts packages/server/src/__tests__/compliance-operator.test.ts
git commit -m "feat(compliance): surface rule operator on ComplianceViolation for dashboard fix line (THE-499)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: `ComplianceDashboard` — Fix-Zeile rendern (AC-4)

**Erfüllt:** AC-4. KEIN `[Fix]`-Button, KEIN neues Panel, PropertyPanel/3D unberührt.

**Files:**
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`

Kontext: Der Dashboard rendert `report.violations` (aus `checkCompliance`, nach Task 3 mit `operator`). Das lokale `Violation`-Interface (Z.7-17) spiegelt `ComplianceViolation` von Hand und trägt bereits `field`, `currentValue`, `expectedValue` — es fehlt nur `operator`. Der Render-Block liegt bei Z.166-174; Z.171 rendert heute `{v.message}`.

- [ ] **Step 1: `operator` ins lokale Interface** — `Violation` (Z.7-17), nach `expectedValue: unknown;`:
```ts
  operator?: string;
```

- [ ] **Step 2: Import + Fix-Ableitung** — oben bei den Imports (`@thearchitect/shared` wird schon für `ViolationSeverity` importiert, Z.4) `deriveViolationFix` mit aufnehmen:
```ts
import type { ViolationSeverity } from '@thearchitect/shared';
import { deriveViolationFix } from '@thearchitect/shared';
```
Eine kleine lokale Wert-Formatierung neben `severityIcon` (Z.53) ergänzen (hält die Transition-Zeile bei leeren/Objekt-Werten lesbar):
```tsx
  const fmtValue = (v: unknown): string => {
    if (v === null || v === undefined) return '(none)';
    if (v === '') return '(empty)';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
```

- [ ] **Step 3: Fix-Zeile in den Violation-Block (Z.166-174)** — den bestehenden `.map` so erweitern, dass pro Violation `deriveViolationFix` aufgerufen und (a) der Imperativ + (b) die AC-4-Transition-Zeile gerendert werden:

```tsx
{report.violations.slice(0, 20).map((v, i) => {
  const fix = deriveViolationFix({
    operator: v.operator,
    field: v.field,
    currentValue: v.currentValue,
    expectedValue: v.expectedValue,
  });
  return (
    <div key={i} className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-[var(--surface-raised)]">
      {severityIcon(v.severity)}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white block truncate">{v.elementName}</span>
        <span className="text-xs text-[var(--text-tertiary)]">{v.message}</span>
        <span className="text-xs text-[var(--text-disabled)] block">Policy: {v.policyName} · Field: {v.field}</span>
        {/* REQ-FIX-001.1: deterministischer Fix-Hinweis (konsumiert deriveViolationFix) */}
        <span className="text-xs text-[#22c55e] block mt-0.5">Fix: {fix.instruction}</span>
        {/* AC-4: Transition-Zeile "Field {field}: {currentValue} → {expectedValue}" */}
        <span className="text-xs text-[var(--text-disabled)] block">
          Field {v.field}: {fmtValue(v.currentValue)} → {fmtValue(v.expectedValue)}
        </span>
      </div>
    </div>
  );
})}
```

Hinweis zur AC-4-Wörtlichkeit: `fmtValue` zeigt leeres `currentValue` als `(empty)` statt als Leerstring — rein kosmetisch für Lesbarkeit; der geforderte Zeilenaufbau „Field {field}: {currentValue} → {expectedValue}" bleibt erhalten. Der `Fix:`-Imperativ (grün) macht `deriveViolationFix` in Slice 1 tatsächlich nutzbar (sonst wäre die shared-Funktion toter Code); das ist die eigentliche „Here's the fix"-Ebene, die AC-4-Transition-Zeile ist das konkrete Vorher→Nachher.

- [ ] **Step 4: Shared bauen (falls seit Task 3 nicht geschehen) + Client-Vitest grün**

```bash
npm run build --workspace=@thearchitect/shared
# aus packages/client:
npx vitest run src/utils/deriveViolationFix.test.ts
```
(Ein Render-Test des Dashboards ist optional; der Fix-Logik-Test aus Task 1 deckt die Ableitung ab. Falls ein Komponenten-Smoke-Test gewünscht ist: `@testing-library/react` ist im Client vorhanden — Muster `GapAnalysis.test.tsx`.) **Gate ist Vitest, NICHT `tsc -b`** (kalter `tsc -b` bricht mit 19 vorbestehenden `ViolationSeverity`-Fehlern ab). Optional zusätzlich `npx vite build` als Bundling-Check.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/governance/ComplianceDashboard.tsx
git commit -m "feat(compliance): show deterministic fix line in ComplianceDashboard (THE-499)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Closeout — gezielte Suiten grün, RVTM-Stub, PR

- [ ] **Step 1: Gezielte Suiten grün** (NICHT die volle Server-Suite — vorbestehend flaky)

```bash
npm run build --workspace=@thearchitect/shared
npm test --workspace=@thearchitect/server -- --testPathPattern="policy-evaluation|compliance-operator"
# aus packages/client:
npx vitest run src/utils/deriveViolationFix.test.ts
```
Erwartung: alle drei gezielten Läufe grün.

- [ ] **Step 2: AC-Selbstcheck**

- AC-1: `deriveViolationFix` deckt jeden Operator + regex-Fallback (Task 1). ✓
- AC-2: applicable-Fälle liefern `edit_field` mit `payload {field, value: expectedValue}` (Task 1-Test). ✓
- AC-3: `operator` additiv auf `PolicyViolation` (Task 2) + `PolicyViolationDTO` (Task 2) + `getViolations`-Passthrough verifiziert (Task 3 Step 4) + Graceful Fallback bei fehlendem operator (Task 1-Test „missing operator"). ✓
- AC-4: `ComplianceDashboard` zeigt Fix-Imperativ + Transition-Zeile, kein `[Fix]`-Button/Panel (Task 4). ✓
- AC-5: jeder Operator, regex, missing-operator, leeres currentValue (exists) (Task 1). ✓

- [ ] **Step 3: RVTM-Stub anlegen** — `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice1-rvtm.md` (Muster: `2026-07-11-uc-choice-003-preflight-rvtm.md`). Mindest-Tabelle REQ→AC→Task→Verification→Evidence:

| REQ | AC | Task | Verification | Evidence |
|---|---|---|---|---|
| REQ-FIX-001.1 | AC-1 | Task 1 | `deriveViolationFix.test.ts` (alle Operatoren) | Vitest grün |
| REQ-FIX-001.1 | AC-2 | Task 1 | edit_field/payload-Assertions | Vitest grün |
| REQ-FIX-001.1 | AC-3 | Task 2/3 | operator persistiert + DTO + Passthrough + Fallback | Jest grün |
| REQ-FIX-001.1 | AC-4 | Task 4 | Dashboard Fix-Zeile | Vitest/manuell |
| REQ-FIX-001.1 | AC-5 | Task 1 | edge cases (regex, missing op, empty) | Vitest grün |

(Die `rvtm-traceability`-Skill kann das Gerüst erzeugen.)

- [ ] **Step 4: PR** — gegen `master`, Titel `feat(compliance): UC-FIX-001 Slice 1 — deterministic violation fix (THE-499)`. In die Beschreibung aufnehmen: (1) die zwei Datenflüsse + warum `operator` an beiden Stellen; (2) die **offene AC-Frage zu `not_equals`** (semantische Inversion — vor Slice 2 klären); (3) `getViolations`-Passthrough via `toObject` (kein Route-Code); (4) Hinweis, dass die ~1992 Legacy-Violations erst nach Re-Evaluation `operator` tragen und bis dahin den generischen „should be"-Hinweis zeigen (Graceful Fallback, kein Crash). THE-499 → Done; THE-498 bleibt offen.

---

## Zusammenfassung der Reihenfolge

1. **Task 1** — `deriveViolationFix` (shared) + Vitest-Unit-Tests. Baut die Kern-Ableitung.
2. **Task 2** — `operator` auf `PolicyViolation` + beide Upserts + `PolicyViolationDTO` (persistierter Pfad, AC-3).
3. **Task 3** — `operator` auf `ComplianceViolation` + `checkCompliance` (Report-Pfad — speist den Dashboard) + `getViolations`-Passthrough verifizieren.
4. **Task 4** — `ComplianceDashboard` konsumiert `deriveViolationFix`, rendert Fix-Imperativ + AC-4-Transition-Zeile.
5. **Task 5** — gezielte Suiten grün, RVTM-Stub, PR mit den geflaggten Punkten.

**Nach jeder shared-Änderung: `npm run build --workspace=@thearchitect/shared` vor den Tests.** Gates: Server = gezielte `--testPathPattern`; Client = `npx vitest run` (nicht `tsc -b`).
