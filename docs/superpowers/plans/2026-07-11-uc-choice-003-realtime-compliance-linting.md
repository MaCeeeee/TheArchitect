# UC-CHOICE-003: Real-time Compliance Linting (Editor) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die bestehende Policy-Engine wird vom Viewer zum Enforcer: strukturierte Violations mit Rule-Identität, drei Enforcement-Levels (advisory/soft/hard) mit synchronem Hard-Block im Write-Path, auditierter Override, Severity-Cutoff und Dry-Run — „ESLint für Architektur-Entscheidungen" (THE-190, Slice 1: Haupteditor, KEINE Scenario-Sandbox).

**Architecture:** Zuerst eine einmalige Schema-Welle (severity-Domain-Migration `error/warning/info`→`low/medium/high/critical`, `ruleId`-Einführung, `enforcementLevel`-Achse) — danach bauen alle Features auf stabilem Grund. Hard-Mandatory-Policies werden synchron VOR dem Neo4j-Write evaluiert (Muster: `CreateElementSchema.parse`-Gate in `architecture.routes.ts`); Advisory/Soft bleiben auf dem bestehenden asynchronen `violation:update`-WebSocket-Pfad. Der non-persisting Evaluator `checkCompliance` wird mit dem persistierenden Pfad auf einen gemeinsamen Loader konsolidiert und als Dry-Run parametrisiert.

**Tech Stack:** Express + Mongoose (MongoDB), Neo4j (runCypher), Socket.IO, Zustand + React (Client), Jest + mongodb-memory-server (Server-Tests), Vitest (Client-Tests), ajv (NEU, devDependency Server — JSON-Schema-Validierung in Tests).

**RVTM:** `docs/superpowers/rvtm/2026-07-11-uc-choice-003-preflight-rvtm.md` (§9 Plan-Traceability)

**Linear:** THE-190 (Parent) · Bau-Reihenfolge: THE-442 (003.0) → THE-202 (003.2) → THE-203 (003.3) → THE-204 (003.4) → THE-206 (003.6) → THE-205 (003.5) → THE-201 (003.1)

**Branch:** `mganzmanninfo/the-190-uc-choice-003-real-time-compliance-linting-editor` (von `master`)

---

## Kontext für den Implementierer (zero context)

Monorepo: `packages/shared` (Types, baut ZUERST) → `packages/server` (Express) → `packages/client` (React). Nach jeder Änderung an `packages/shared`: `npm run build --workspace=@thearchitect/shared`, sonst sieht der Server alte Types.

**Die Engine heute:**
- `packages/server/src/models/Policy.ts` — Policies mit `rules: IPolicyRule[]` (`{field, operator, value, message}`, subdocs mit `_id: false` → **Rules haben keine Identität**), `severity: 'error'|'warning'|'info'`.
- `packages/server/src/models/PolicyViolation.ts` — persistiertes Lint-Ergebnis, Unique-Index `{policyId, elementId, field}`.
- `packages/server/src/services/compliance.service.ts` — Rule-Primitiven (`evaluateRule`, `elementMatchesScope`, `getFieldValue`) + `checkCompliance` (non-persisting Whole-Project-Report; liest `e.metadata` — **divergiert** vom persistierenden Pfad, der `e.metadataJson` liest).
- `packages/server/src/services/policy-evaluation.service.ts` — persistierender Pfad: `evaluateElementPolicies` (per Element, upsert/auto-resolve), `evaluateAllForPolicy`, `emitViolationUpdate` → WS `violation:update`.
- Trigger: `packages/server/src/routes/architecture.routes.ts:656` (create), `:761` (update), `:853` (delete) — **fire-and-forget NACH `res.json(...)`**. Es gibt heute keinen Blocking-Punkt.
- Client: `packages/client/src/stores/complianceStore.ts` `loadViolations` (max 500, baut Count-Maps `violationsByElement`/`violationsByPolicy`), Subscriber in `packages/client/src/components/ui/ProjectView.tsx:98` (1s-Debounce).

**Testkonvention Server** (`src/__tests__/*.test.ts`, siehe `policy-evaluation.test.ts`): mongodb-memory-server, `jest.mock('../config/neo4j')`, `jest.mock('../websocket/socketServer')`, `jest.mock('../services/policy-graph.service')`. Tests laufen mit `npm test --workspace=@thearchitect/server -- --testPathPattern=<name>`.

**Commit-Konvention:** `feat(compliance): <was> (THE-XXX)` + Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File-Struktur (was entsteht / was sich ändert)

| Datei | Aktion | Verantwortung |
|---|---|---|
| `packages/shared/src/types/compliance.types.ts` | Modify | Neue Domains: `ViolationSeverity`, `EnforcementLevel`; DTO-Felder `ruleId`, `resourcePath`, `docLink`, `enforcementLevel` |
| `packages/server/src/models/Policy.ts` | Modify | severity-Enum neu, `enforcementLevel`, `ruleId` im Rule-Schema |
| `packages/server/src/models/PolicyViolation.ts` | Modify | severity-Enum neu, `ruleId`, `resourcePath`, `docLink`, Override-Felder, Index-Umstellung |
| `packages/server/src/scripts/migrate-severity-enforcement.ts` | Create | Einmalige Daten-Migration (severity-Mapping, ruleId-Backfill, Index-Rebuild) |
| `packages/server/src/__tests__/migrate-severity-enforcement.test.ts` | Create | Migrations-Test (Memory-DB) |
| `packages/server/src/services/compliance.service.ts` | Modify | Score-Formel auf neue Domain (regressionsstabil), `checkCompliance` → konsolidierter Loader |
| `packages/server/src/services/policy-evaluation.service.ts` | Modify | schreibt `ruleId`/`resourcePath`/`docLink`/`enforcementLevel`; `loadProjectElements` exportieren |
| `packages/server/src/services/enforcement-gate.service.ts` | Create | Synchrones Hard-Mandatory-Gate für den Write-Path |
| `packages/server/src/__tests__/enforcement-gate.test.ts` | Create | Gate-Tests |
| `packages/server/src/services/policy-dryrun.service.ts` | Create | Dry-Run-Evaluation (Kandidaten-Policies, kein Persist) |
| `packages/server/src/__tests__/policy-dryrun.test.ts` | Create | Dry-Run-Tests |
| `packages/server/src/routes/architecture.routes.ts` | Modify | Hard-Gate vor Create/Update (422) |
| `packages/server/src/routes/governance.routes.ts` | Modify | Override-Route, Audit-Export, Dry-Run-Route, Override-Stats |
| `packages/server/src/models/Project.ts` | Modify | `settings.governance.enforcementCutoff` |
| `packages/server/src/schemas/validation-violation.schema.json` | Create | Violation-Output-Kontrakt (REQ-003.2) |
| `packages/server/src/__tests__/violation-schema.test.ts` | Create | ajv-Schema-Check aller Violation-Outputs |
| `packages/server/src/__tests__/policy-perf.test.ts` | Create | p95-Perf-Gate (50 Elemente × 100 Policies) |
| `packages/server/src/data/seed-policies.ts` | Modify | Seeds auf neue severity-Domain |
| `.github/workflows/ci.yml` | Create | Test-Workflow (shared build → server jest inkl. perf) |
| `packages/client/src/stores/complianceStore.ts` | Modify | Violation-DETAILS-Map (nicht nur Counts), Override-Action, Loading>500ms-Flag |
| `packages/client/src/components/governance/EnforcementBlockDialog.tsx` | Create | 422-Block-Dialog (hard) |
| `packages/client/src/components/governance/OverrideDialog.tsx` | Create | Soft-Override mit ≥50-Zeichen-Begründung |
| `packages/client/src/components/governance/PolicyDraftReview.tsx` | Modify | severity-Domain, „Preview violations" (Dry-Run) |
| `packages/client/src/components/governance/ComplianceDashboard.tsx` | Modify | severity-Domain, Enforcement-Icons, Override-Button, Alert-Fatigue-Banner |
| `packages/client/src/components/governance/PolicyManager.tsx` | Modify | enforcementLevel-Select, severity-Domain, ruleId-Durchreichung, Promotion-Hint |
| `packages/client/src/components/ui/PropertyPanel.tsx` | Modify | Violation-Glyph/Farben auf 4er-severity-Domain (Review-Fund 2026-07-14) |
| `packages/client/src/components/ui/Sidebar.tsx` | Modify | Violation-Buckets 3→4 Tiles + Icon-Branches auf neue Domain (Review-Fund 2026-07-14) |
| `packages/server/src/services/ai.service.ts` | Modify | Draft-Prompt-Wertemenge (Z.764 JSON-Beispiel + Z.767 Instruktion) + Remediation-Priority-Guidance (Z.966) auf neue Domain (Review-Funde 2026-07-14) |
| `packages/client/src/stores/architectureStore.ts` | Modify | 422-`policy_violation`-Handling bei create/update |

**Nicht im Scope (deskopiert):** Scenario-/Sandbox-Eval (Seed dokumentiert), E-Mail-Versand für Admin-Warnungen (Banner statt Mail), Anonymisierungs-Routen (Export nutzt IDs statt Klarnamen).

---

## Chunk 1: REQ-003.0 Schema-Fundament (THE-442)

### Task 1: Shared Types — neue Domains

**Files:**
- Modify: `packages/shared/src/types/compliance.types.ts`

- [ ] **Step 1: Types erweitern**

In `compliance.types.ts` NACH Zeile 5 (`export type PolicySource = string;`) einfügen:

```typescript
// ─── Severity & Enforcement (UC-CHOICE-003, THE-442) ───
// severity = WIE SCHLIMM ist ein Verstoß (Klassifikation, Score-Gewicht).
// enforcementLevel = WAS PASSIERT bei Verstoß (advisory: anzeigen |
// soft_mandatory: Override mit Begründung | hard_mandatory: Write blockt).
// Zwei orthogonale Achsen — severity war vorher überladen (THE-442).

export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type EnforcementLevel = 'advisory' | 'soft_mandatory' | 'hard_mandatory';

export const VIOLATION_SEVERITIES: readonly ViolationSeverity[] = ['low', 'medium', 'high', 'critical'];
export const ENFORCEMENT_LEVELS: readonly EnforcementLevel[] = ['advisory', 'soft_mandatory', 'hard_mandatory'];

/** Mapping der Alt-Domain (pre-THE-442) für Migration + Abwärtskompatibilität. */
export const LEGACY_SEVERITY_MAP: Record<string, ViolationSeverity> = {
  error: 'high',
  warning: 'medium',
  info: 'low',
};

/**
 * Wire-Form einer Violation (REQ-003.2, OPA/Kyverno-Stil) — SHARED, weil
 * Server (violation-format.ts, Gate-422-Response) UND Client
 * (EnforcementBlockDialog, architectureStore) sie typisieren.
 */
export interface ViolationMessage {
  ruleId: string;
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
  message: string;
  resourcePath: string;
  docLink?: string;
}
```

`PolicyViolationDTO` (Zeile 11-29) ändern — `severity`-Zeile ersetzen und neue Felder ergänzen:

```typescript
export interface PolicyViolationDTO {
  _id: string;
  projectId: string;
  policyId: string;
  policyName?: string;
  elementId: string;
  elementName?: string;
  violationType: 'violation' | 'partial';
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
  ruleId: string;
  message: string;
  field: string;
  resourcePath: string;
  docLink?: string;
  currentValue: unknown;
  expectedValue: unknown;
  status: PolicyViolationStatus;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  overrideReason?: string;
  suppressedAt?: string;
  suppressedBy?: string;
  details: string;
}
```

`PolicyDraft` (Zeile 46-55): `severity: 'error' | 'warning' | 'info';` ersetzen durch:

```typescript
  severity: ViolationSeverity;
  enforcementLevel?: EnforcementLevel; // optional: Drafts default zu 'advisory'
```

- [ ] **Step 2: Shared bauen + Typfehler-Inventur**

Run: `npm run build --workspace=@thearchitect/shared && npm run build --workspace=@thearchitect/server 2>&1 | head -50`
Expected: Server-Build FAILT mit Typfehlern an allen severity-Konsumenten — das ist die Blast-Radius-Liste. Notieren; die nächsten Tasks arbeiten sie ab. (Client-Fehler analog später.)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/compliance.types.ts
git commit -m "feat(compliance): severity/enforcement domains in shared types (THE-442)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Policy- und PolicyViolation-Modelle

**Files:**
- Modify: `packages/server/src/models/Policy.ts`
- Modify: `packages/server/src/models/PolicyViolation.ts`
- Test: `packages/server/src/__tests__/policy-evaluation.test.ts` (bestehende Fixtures anpassen)

- [ ] **Step 1: Failing Test — Rule-Identität + neue Enums**

In `policy-evaluation.test.ts` neuen describe-Block ergänzen (am Ende der Datei):

```typescript
describe('THE-442: schema foundation', () => {
  it('assigns a stable ruleId to every rule and persists enforcementLevel', async () => {
    const policy = await Policy.create({
      projectId: PROJECT_ID,
      name: 'Sec Policy',
      category: 'security',
      severity: 'high',
      enforcementLevel: 'soft_mandatory',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'needs description' }],
      createdBy: USER_ID,
    });
    expect(policy.severity).toBe('high');
    expect(policy.enforcementLevel).toBe('soft_mandatory');
    expect(policy.rules[0].ruleId).toMatch(/^r-[0-9a-f-]{36}$/);
  });

  it('defaults enforcementLevel to advisory and severity to medium', async () => {
    const policy = await Policy.create({
      projectId: PROJECT_ID, name: 'Min', category: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'name', operator: 'exists', value: true, message: 'm' }],
      createdBy: USER_ID,
    });
    expect(policy.enforcementLevel).toBe('advisory');
    expect(policy.severity).toBe('medium');
  });

  it('rejects legacy severity values', async () => {
    await expect(Policy.create({
      projectId: PROJECT_ID, name: 'Legacy', category: 'custom', severity: 'error',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'name', operator: 'exists', value: true, message: 'm' }],
      createdBy: USER_ID,
    })).rejects.toThrow(/is not a valid enum value/);
  });
});
```

- [ ] **Step 2: Test laufen lassen — FAIL**

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=policy-evaluation -t "THE-442"`
Expected: FAIL (`ruleId` undefined, enum `high` invalid).

- [ ] **Step 3: Policy.ts umbauen**

```typescript
// Imports ergänzen:
import { randomUUID } from 'crypto';
import { isNormSource, ViolationSeverity, EnforcementLevel } from '@thearchitect/shared';

export interface IPolicyRule {
  ruleId: string; // stabile Identität (THE-442) — bleibt über Edits erhalten
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex';
  value: unknown;
  message: string;
}
```

In `IPolicy`: `severity: ViolationSeverity;` und neu `enforcementLevel: EnforcementLevel;`.

`policyRuleSchema`:

```typescript
const policyRuleSchema = new Schema<IPolicyRule>({
  ruleId: { type: String, default: () => `r-${randomUUID()}` },
  field: { type: String, required: true },
  operator: {
    type: String,
    enum: ['equals', 'not_equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'exists', 'regex'],
    required: true,
  },
  value: { type: Schema.Types.Mixed, required: true },
  message: { type: String, required: true },
}, { _id: false });
```

Im `policySchema`: severity-Zeile ersetzen + enforcementLevel ergänzen:

```typescript
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    enforcementLevel: {
      type: String,
      enum: ['advisory', 'soft_mandatory', 'hard_mandatory'],
      default: 'advisory', // Audit-Mode-First (REQ-003.3 AC-5)
    },
```

WICHTIG — Identitäts-Stabilität über Updates: `findByIdAndUpdate` mit `{...req.body}` würde client-seitig fehlende ruleIds neu würfeln. Pre-Hook im Schema ergänzen (nach den Index-Definitionen):

```typescript
// ruleId-Stabilität: Client-Payloads ohne ruleId bekommen serverseitig eine;
// mitgeschickte ruleIds bleiben unangetastet (THE-442). Duplikate INNERHALB
// eines Payloads (Buggy-Client, Copy-Paste-Rule) werden neu gewürfelt — sonst
// kollidiert später der Unique-Index (policyId,elementId,ruleId). AC-3: „je
// Policy eindeutige ruleId" wird hier an der Schreibgrenze erzwungen.
export function ensureRuleIds<T extends { ruleId?: string }>(rules: T[]): (T & { ruleId: string })[] {
  const seen = new Set<string>();
  return rules.map((r) => {
    let ruleId = r.ruleId || `r-${randomUUID()}`;
    if (seen.has(ruleId)) ruleId = `r-${randomUUID()}`; // Duplikat → frische Identität
    seen.add(ruleId);
    return { ...r, ruleId };
  });
}
```

- [ ] **Step 4: PolicyViolation.ts umbauen**

```typescript
import { ViolationSeverity, EnforcementLevel } from '@thearchitect/shared';

export interface IPolicyViolation extends Document {
  projectId: mongoose.Types.ObjectId;
  policyId: mongoose.Types.ObjectId;
  elementId: string; // Neo4j UUID
  ruleId: string;    // THE-442: referenziert Policy.rules[].ruleId
  violationType: 'violation' | 'partial';
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
  message: string;
  field: string;
  resourcePath: string; // REQ-003.2: /elements/{elementId}/{field}
  docLink?: string;     // REQ-003.2: Norm-Registry oder Knowledge-Base
  currentValue: unknown;
  expectedValue: unknown;
  status: PolicyViolationStatus;
  detectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  overrideReason?: string;              // REQ-003.4
  suppressedAt?: Date;                  // REQ-003.4
  suppressedBy?: mongoose.Types.ObjectId; // REQ-003.4
  details: string;
}
```

Schema-Felder entsprechend (severity-enum `['low','medium','high','critical']` default `'medium'`; `enforcementLevel` enum default `'advisory'`; `ruleId: { type: String, required: true }`; `resourcePath: { type: String, default: '' }`; `docLink: { type: String }`; `overrideReason: { type: String }`; `suppressedAt: { type: Date }`; `suppressedBy: { type: Schema.Types.ObjectId, ref: 'User' }`).

Index-Umstellung (alte Zeile 56 ERSETZEN):

```typescript
policyViolationSchema.index({ policyId: 1, elementId: 1, ruleId: 1 }, { unique: true });
```

(Der alte `{policyId, elementId, field}`-Index wird in der Migration gedroppt — Task 4.)

- [ ] **Step 5: Bestehende Test-Fixtures in `policy-evaluation.test.ts` und `governance-routes.test.ts` anpassen** (`complianceFacts.test.ts` hat KEINE severity-Fixtures — verifiziert, nicht anfassen)

Mechanisch: `severity: 'error'` → `'high'`, `'warning'` → `'medium'`, `'info'` → `'low'`. Suchen mit:

Run: `grep -rn "severity: '\(error\|warning\|info\)'" packages/server/src/__tests__/ packages/server/src/data/ packages/server/src/scripts/`

`packages/server/src/data/seed-policies.ts` ebenfalls jetzt migrieren (gleiche Ersetzung; jede Seed-Policy bekommt KEIN explizites enforcementLevel → Default advisory greift).

- [ ] **Step 6: Tests laufen lassen — PASS**

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=policy-evaluation`
Expected: PASS inkl. der drei THE-442-Tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/models/ packages/server/src/__tests__/ packages/server/src/data/seed-policies.ts
git commit -m "feat(compliance): severity domain, ruleId, enforcementLevel on models (THE-442)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Score-Formel regressionsstabil umstellen

**Files:**
- Modify: `packages/server/src/services/compliance.service.ts`
- Test: `packages/server/src/__tests__/compliance-score.test.ts` (Create)

**Kontext:** Alte Formel (`compliance.service.ts:86-90`): `score = (max − errors·3 − warnings·1 − infos·0) / max`. Migrierte Daten (error→high, warning→medium, info→low) MÜSSEN denselben Score ergeben → Gewichte: **critical=4, high=3, medium=1, low=0**.

- [ ] **Step 1: Failing Regressionstest**

`packages/server/src/__tests__/compliance-score.test.ts`:

```typescript
// THE-442: Score-Regressionsstabilität — migrierte severity-Werte ergeben
// exakt den Score der Alt-Formel (error·3 + warning·1 + info·0).
import { computeComplianceScore } from '../services/compliance.service';

describe('computeComplianceScore (THE-442)', () => {
  it('reproduces legacy scores for migrated data', () => {
    // Alt: 10 Elemente × 2 Policies = max 20; 2 errors + 3 warnings
    // → (20 − 2·3 − 3·1) / 20 = 55%
    const score = computeComplianceScore(
      { critical: 0, high: 2, medium: 3, low: 0 },
      20,
    );
    expect(score).toBe(55);
  });

  it('weights critical at 4', () => {
    // (20 − 1·4) / 20 = 80%
    expect(computeComplianceScore({ critical: 1, high: 0, medium: 0, low: 0 }, 20)).toBe(80);
  });

  it('clamps to [0, 100]', () => {
    expect(computeComplianceScore({ critical: 10, high: 10, medium: 0, low: 0 }, 5)).toBe(0);
    expect(computeComplianceScore({ critical: 0, high: 0, medium: 0, low: 0 }, 0)).toBe(100);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`computeComplianceScore` existiert nicht)

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=compliance-score`

- [ ] **Step 3: Implementieren**

In `compliance.service.ts` — `ComplianceViolation.severity` auf `ViolationSeverity` umtypen, `ComplianceReport.summary` ersetzen und die Formel extrahieren:

```typescript
import { ViolationSeverity } from '@thearchitect/shared';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

// THE-442: Gewichte so gewählt, dass migrierte Alt-Daten (error→high,
// warning→medium, info→low) exakt den Alt-Score reproduzieren.
const SEVERITY_SCORE_WEIGHTS: Record<ViolationSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 1,
  low: 0,
};

export function computeComplianceScore(counts: SeverityCounts, maxPossible: number): number {
  const max = Math.max(maxPossible, 1);
  const penalty =
    counts.critical * SEVERITY_SCORE_WEIGHTS.critical +
    counts.high * SEVERITY_SCORE_WEIGHTS.high +
    counts.medium * SEVERITY_SCORE_WEIGHTS.medium +
    counts.low * SEVERITY_SCORE_WEIGHTS.low;
  return Math.max(0, Math.min(100, Math.round(((max - penalty) / max) * 100)));
}
```

In `checkCompliance` (Zeile 86-110) `summary` umbauen:

```typescript
  const counts = {
    critical: violations.filter((v) => v.severity === 'critical').length,
    high: violations.filter((v) => v.severity === 'high').length,
    medium: violations.filter((v) => v.severity === 'medium').length,
    low: violations.filter((v) => v.severity === 'low').length,
  };
  const maxPossible = Math.max(elements.length * policies.length, 1);
  // summary shape: errors/warnings/infos → bySeverity (Konsumenten: ComplianceDashboard)
  return {
    /* ...wie bisher..., */
    summary: {
      ...counts,
      complianceScore: computeComplianceScore(counts, maxPossible),
    },
    byCategory,
  };
```

`ComplianceReport.summary`-Interface: `{ critical: number; high: number; medium: number; low: number; complianceScore: number }`. `getBuiltInChecks`-Literale mit anpassen (`'warning'`→`'medium'`, `'error'`→`'high'`).

- [ ] **Step 4: Run — PASS**, dann gesamte Server-Suite

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=compliance-score && npm test --workspace=@thearchitect/server`
Expected: compliance-score PASS. Gesamt-Suite: verbleibende severity-Literal-Fehler fixen (Konsument `governance.routes.ts:363-368` Filter validiert nichts → keine Änderung nötig; `apply-compliance-facts.ts` enthält KEINE severity-Literale — verifiziert).

**Pflicht-Konsument (Task-1-Inventur 2026-07-14, in keinem früheren Sweep!):** `advisor.service.ts:305-330` `detectComplianceIssues` konsumiert `checkCompliance` direkt — `report.summary.errors/warnings` (Z.308, Shape existiert nach diesem Task nicht mehr) UND `v.severity === 'error'/'warning'`-Filter (Z.310-311). Umstellen auf `summary.critical+high` / `summary.medium` und Filter auf `['critical','high'].includes(v.severity)` bzw. `'medium'`. ACHTUNG: Die `InsightSeverity`-Werte des Advisors selbst (`'critical'|'high'|'warning'|'info'`, advisor.types.ts) sind eine ANDERE Domäne — nicht anfassen.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/compliance.service.ts packages/server/src/__tests__/compliance-score.test.ts
git commit -m "feat(compliance): severity-domain score formula, regression-stable (THE-442)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: Daten-Migration

**Files:**
- Create: `packages/server/src/scripts/migrate-severity-enforcement.ts`
- Test: `packages/server/src/__tests__/migrate-severity-enforcement.test.ts`
- Modify: `packages/server/package.json` (Script `migrate:severity`)

**Muster:** `packages/server/src/scripts/migrate-to-norms.ts` + zugehöriger Test (THE-413) — gleiche Struktur: exportierte `runMigration(uri)`-Funktion, CLI-Wrapper, idempotent.

- [ ] **Step 1: Failing Test**

```typescript
// packages/server/src/__tests__/migrate-severity-enforcement.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeverityEnforcementMigration } from '../scripts/migrate-severity-enforcement';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

// RAW-Insert (umgeht Mongoose-Enums — simuliert Alt-Daten)
async function insertLegacy() {
  const db = mongoose.connection.db!;
  const { insertedId: policyId } = await db.collection('policies').insertOne({
    projectId: new mongoose.Types.ObjectId(), name: 'Legacy', category: 'security',
    severity: 'error', enabled: true, status: 'active', source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [
      { field: 'description', operator: 'exists', value: true, message: 'm1' },
      { field: 'riskLevel', operator: 'equals', value: 'low', message: 'm2' },
    ],
    createdBy: new mongoose.Types.ObjectId(), version: 1,
  });
  await db.collection('policyviolations').insertOne({
    projectId: new mongoose.Types.ObjectId(), policyId, elementId: 'el-1',
    violationType: 'violation', severity: 'warning', message: 'm1',
    field: 'description', status: 'open', detectedAt: new Date(), details: '',
  });
  return policyId;
}

describe('migrate-severity-enforcement (THE-442)', () => {
  it('maps legacy severities, backfills ruleIds + enforcementLevel, rewires violations', async () => {
    const policyId = await insertLegacy();
    const result = await runSeverityEnforcementMigration();

    const db = mongoose.connection.db!;
    const policy = await db.collection('policies').findOne({ _id: policyId });
    expect(policy!.severity).toBe('high');                 // error → high
    expect(policy!.enforcementLevel).toBe('advisory');     // Default
    expect(policy!.rules[0].ruleId).toMatch(/^r-/);
    expect(policy!.rules[1].ruleId).toMatch(/^r-/);
    expect(policy!.rules[0].ruleId).not.toBe(policy!.rules[1].ruleId);

    const violation = await db.collection('policyviolations').findOne({ policyId });
    expect(violation!.severity).toBe('medium');            // warning → medium
    expect(violation!.enforcementLevel).toBe('advisory');
    expect(violation!.ruleId).toBe(policy!.rules[0].ruleId); // via field-Match
    expect(violation!.resourcePath).toBe('/elements/el-1/description');

    expect(result.policiesMigrated).toBe(1);
    expect(result.violationsMigrated).toBe(1);

    // Idempotenz: zweiter Lauf ändert nichts
    const second = await runSeverityEnforcementMigration();
    expect(second.policiesMigrated).toBe(0);
    expect(second.violationsMigrated).toBe(0);
  });

  it('resolves violations whose rule cannot be identified', async () => {
    const db = mongoose.connection.db!;
    const { insertedId: policyId } = await db.collection('policies').insertOne({
      projectId: new mongoose.Types.ObjectId(), name: 'P', category: 'custom',
      severity: 'info', enabled: true, status: 'active', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'name', operator: 'exists', value: true, message: 'm' }],
      createdBy: new mongoose.Types.ObjectId(), version: 1,
    });
    await db.collection('policyviolations').insertOne({
      projectId: new mongoose.Types.ObjectId(), policyId, elementId: 'el-2',
      violationType: 'violation', severity: 'info', message: 'stale',
      field: 'deletedField', status: 'open', detectedAt: new Date(), details: '',
    });
    await runSeverityEnforcementMigration();
    const v = await db.collection('policyviolations').findOne({ elementId: 'el-2' });
    expect(v!.status).toBe('resolved');
    expect(v!.details).toContain('THE-442');
  });

  it('is counter-idempotent for policies with empty rules arrays (rules.0-Guard)', async () => {
    const db = mongoose.connection.db!;
    await db.collection('policies').insertOne({
      projectId: new mongoose.Types.ObjectId(), name: 'NoRules', category: 'custom',
      severity: 'warning', enabled: true, status: 'active', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [],
      createdBy: new mongoose.Types.ObjectId(), version: 1,
    });
    const first = await runSeverityEnforcementMigration();
    expect(first.policiesMigrated).toBe(1); // severity warning→medium gemappt
    const second = await runSeverityEnforcementMigration();
    expect(second.policiesMigrated).toBe(0); // ohne rules.0-Guard bliebe das >0
  });
});
```

- [ ] **Step 2: Run — FAIL** (Modul existiert nicht)

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=migrate-severity`

- [ ] **Step 3: Migration implementieren**

```typescript
// packages/server/src/scripts/migrate-severity-enforcement.ts
// THE-442: Einmalige Migration — severity-Domain, ruleId-Backfill,
// enforcementLevel-Default, Violation-Rewire, Index-Umbau.
// Idempotent: bereits migrierte Dokumente werden übersprungen.
// Aufruf: npm run migrate:severity --workspace=@thearchitect/server
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

import { LEGACY_SEVERITY_MAP } from '@thearchitect/shared';

const SEVERITY_MAP = LEGACY_SEVERITY_MAP; // single source (Task 1) — nicht duplizieren
const LEGACY = Object.keys(LEGACY_SEVERITY_MAP);

export interface MigrationResult {
  policiesMigrated: number;
  violationsMigrated: number;
  violationsResolvedUnmappable: number;
}

export async function runSeverityEnforcementMigration(): Promise<MigrationResult> {
  const db = mongoose.connection.db!;
  const policies = db.collection('policies');
  const violations = db.collection('policyviolations');
  const result: MigrationResult = { policiesMigrated: 0, violationsMigrated: 0, violationsResolvedUnmappable: 0 };

  // 1) Policies: severity mappen, enforcementLevel + ruleIds backfillen
  // ('rules.0' als Guard: Policies mit rules:[] würden 'rules.ruleId $exists:false'
  //  auf jedem Lauf matchen und den Idempotenz-Zähler verfälschen — Review 2026-07-14)
  const legacyPolicies = await policies
    .find({ $or: [
      { severity: { $in: LEGACY } },
      { enforcementLevel: { $exists: false } },
      { 'rules.0': { $exists: true }, 'rules.ruleId': { $exists: false } },
    ] })
    .toArray();

  for (const p of legacyPolicies) {
    const rules = (p.rules || []).map((r: Record<string, unknown>) => ({
      ...r,
      ruleId: r.ruleId || `r-${randomUUID()}`,
    }));
    await policies.updateOne(
      { _id: p._id },
      {
        $set: {
          severity: SEVERITY_MAP[p.severity as string] || p.severity,
          enforcementLevel: p.enforcementLevel || 'advisory',
          rules,
        },
      },
    );
    result.policiesMigrated++;
  }

  // 2) Violations: severity mappen, ruleId via (policyId, field) auflösen,
  //    resourcePath + enforcementLevel setzen. Nicht auflösbare → resolved.
  const legacyViolations = await violations
    .find({ $or: [{ severity: { $in: LEGACY } }, { ruleId: { $exists: false } }] })
    .toArray();

  const policyCache = new Map<string, Record<string, unknown>>();
  for (const v of legacyViolations) {
    const pid = String(v.policyId);
    if (!policyCache.has(pid)) {
      const p = await policies.findOne({ _id: v.policyId });
      policyCache.set(pid, (p || {}) as Record<string, unknown>);
    }
    const policy = policyCache.get(pid)!;
    const rules = (policy.rules || []) as Array<{ ruleId: string; field: string }>;
    const matched = rules.find((r) => r.field === v.field);

    if (!matched) {
      await violations.updateOne(
        { _id: v._id },
        {
          $set: {
            status: 'resolved',
            resolvedAt: new Date(),
            severity: SEVERITY_MAP[v.severity as string] || v.severity,
            enforcementLevel: 'advisory',
            ruleId: `r-orphaned-${randomUUID()}`,
            resourcePath: `/elements/${v.elementId}/${v.field}`,
            details: `${v.details || ''} | auto-resolved: rule identity not resolvable (THE-442 migration)`.trim(),
          },
        },
      );
      result.violationsResolvedUnmappable++;
      continue;
    }

    await violations.updateOne(
      { _id: v._id },
      {
        $set: {
          severity: SEVERITY_MAP[v.severity as string] || v.severity,
          enforcementLevel: (policy.enforcementLevel as string) || 'advisory',
          ruleId: matched.ruleId,
          resourcePath: `/elements/${v.elementId}/${v.field}`,
        },
      },
    );
    result.violationsMigrated++;
  }

  // 3) Index-Umbau: alter Unique-Key (policyId,elementId,field) → (policyId,elementId,ruleId)
  try { await violations.dropIndex('policyId_1_elementId_1_field_1'); } catch { /* nicht vorhanden — ok */ }
  await violations.createIndex({ policyId: 1, elementId: 1, ruleId: 1 }, { unique: true });

  return result;
}

// CLI-Wrapper (Muster: migrate-to-norms.ts)
if (require.main === module) {
  (async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    await mongoose.connect(uri);
    const result = await runSeverityEnforcementMigration();
    console.log('[THE-442] migration done:', JSON.stringify(result, null, 2));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
```

`packages/server/package.json` scripts ergänzen: `"migrate:severity": "ts-node src/scripts/migrate-severity-enforcement.ts"`.

**Typ-Härtung (Quality-Review 2026-07-15):** `LEGACY_SEVERITY_MAP` in shared von `Record<string, ViolationSeverity>` auf `Record<'error' | 'warning' | 'info', ViolationSeverity>` verengen (sonst ist `MAP['medium']` typseitig defined, runtime undefined) und daneben Helper exportieren: `export function mapLegacySeverity(s: string): ViolationSeverity | undefined { return (LEGACY_SEVERITY_MAP as Record<string, ViolationSeverity | undefined>)[s]; }`. Die Migration nutzt den Helper statt Raw-Indexing: `mapLegacySeverity(p.severity as string) || p.severity`. Shared danach neu bauen.

- [ ] **Step 4: Run — PASS**

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=migrate-severity`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/scripts/migrate-severity-enforcement.ts packages/server/src/__tests__/migrate-severity-enforcement.test.ts packages/server/package.json
git commit -m "feat(compliance): severity/ruleId data migration, idempotent (THE-442)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Deploy-Hinweis (in PR-Beschreibung übernehmen):** Auf dem VPS **sofort nach dem Deploy, vor Edit-Traffic**, einmalig `npm run migrate:severity` im Server-Container ausführen (Mac: nicht nötig, Memory-DB in Tests). **Tasks 2–5 sind EIN Deploy-Unit** (Quality-Review 2026-07-15: der temporäre ruleId-Default aus Task 2 ist ohne die Task-5-Upsert-Umstellung nicht concurrency-sicher — ein Teil-Deploy 2–4 shipped ein Silent-Duplicate-Fenster). Erwartbares Fenster-Verhalten (Review 2026-07-14): Mongoose versucht beim ersten Boot mit neuem Code den Unique-Index `{policyId,elementId,ruleId}` VOR der Migration zu bauen — auf Legacy-Daten mit ≥2 Violations pro Policy+Element schlägt der Build laut fehl (nicht fatal); Migration Schritt 3 baut ihn danach korrekt. Im selben Fenster upserten Evaluations mit `ruleId: undefined` — heilt sich durch die Migration ebenfalls selbst.

### Task 5: Evaluation schreibt ruleId — und Routen normalisieren Rules

**Files:**
- Modify: `packages/server/src/services/policy-evaluation.service.ts`
- Modify: `packages/server/src/models/PolicyViolation.ts` (temp-Default entfernen, Step 0)
- Modify: `packages/server/src/routes/governance.routes.ts` (Create/Update-Policy)
- Test: bestehende `policy-evaluation.test.ts`-Assertions erweitern + `governance-routes.test.ts` seedViolation-Fixtures

- [ ] **Step 0: Pflicht-Vorarbeiten (Quality-Review 2026-07-15, BINDEND)**

1. **Temp-ruleId-Default entfernen:** `PolicyViolation.ts` — der in Task 2 eingeführte `default: () => r-${randomUUID()}` auf `ruleId` MUSS raus, sobald die Upserts echte ruleIds schreiben (dieser Task). Empirisch belegt: Unter dem Default sind 4 parallele Upserts = 4 Duplikate (Unique-Index deckt den Dedupe-Key des alten Filters nicht mehr). `governance-routes.test.ts:115` (`seedViolation`) verlässt sich auf den Default → Fixtures bekommen explizite ruleIds.
2. **Identity-Tests diskriminierend machen:** Die zwei in Task 2 umgeschriebenen Tests (policy-evaluation.test.ts ~227-270) ko-variieren field mit ruleId und würden auch unter dem ALTEN Index bestehen. Fix: Dedupe-Test → gleiche ruleId, VERSCHIEDENE fields (muss weiter E11000 werfen); Koexistenz-Test → verschiedene ruleIds, GLEICHES field (unter Alt-Index unmöglich, muss durchgehen).
3. **Update-Pfad-Domain-Enforcement:** `governance.routes.ts:241` + `:277` (`findByIdAndUpdate` ohne runValidators) lassen Legacy-severity ROH in die DB (empirisch belegt — re-kontaminiert Task-3-Gewichte, Task-7-Sweep sieht nur Code, nicht Daten). Fix: eingehende severity an der Grenze via `LEGACY_SEVERITY_MAP` normalisieren (graceful für stale Clients) UND `runValidators: true` als Backstop.

- [ ] **Step 1: Failing Test**

In `policy-evaluation.test.ts` (describe `THE-442`) ergänzen:

```typescript
  it('writes ruleId + enforcementLevel + resourcePath into upserted violations', async () => {
    const policy = await Policy.create({
      projectId: PROJECT_ID, name: 'Desc', category: 'architecture',
      severity: 'high', enforcementLevel: 'soft_mandatory',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'needs desc' }],
      createdBy: USER_ID,
    });
    mockRunCypher.mockResolvedValue([mockNeo4jRecord({ id: 'el-9', name: 'X', type: 'application_component', layer: 'application', description: '' })]);

    const { evaluateElementPolicies } = await import('../services/policy-evaluation.service');
    await evaluateElementPolicies(PROJECT_ID.toString(), 'el-9', 'create');

    const v = await PolicyViolation.findOne({ elementId: 'el-9' });
    expect(v!.ruleId).toBe(policy.rules[0].ruleId);
    expect(v!.enforcementLevel).toBe('soft_mandatory');
    expect(v!.severity).toBe('high');
    expect(v!.resourcePath).toBe('/elements/el-9/description');
  });
```

(Der Helper in der Datei heißt **`fakeNeo4jRecord`** — im Testcode oben `mockNeo4jRecord` durch `fakeNeo4jRecord` ersetzen und dessen reale Signatur verwenden.)

- [ ] **Step 2: Run — FAIL**, dann implementieren

In `policy-evaluation.service.ts`, beide Upsert-Stellen (`evaluateElementPolicies` Zeile ~172 und `evaluateAllForPolicy` Zeile ~249):
- Filter: `{ policyId: policy._id, elementId, ruleId: rule.ruleId }` (statt `field`)
- `$set` ergänzen: `ruleId: rule.ruleId, enforcementLevel: policy.enforcementLevel, resourcePath: \`/elements/${elementId}/${rule.field}\`, docLink: deriveDocLink(policy)` — `field` bleibt als Datenfeld erhalten.
- Auto-Resolve-Filter (Zeile ~201) ebenfalls auf `ruleId` umstellen.
- `deriveDocLink` kommt in Chunk 2 (Task 7) — hier zunächst Helper-Stub einführen:

```typescript
/** REQ-003.2 — docLink-Ableitung; Registry-Anbindung in THE-202. */
function deriveDocLink(policy: { standardId?: unknown; sourceSectionNumber?: string }): string | undefined {
  return undefined;
}
```

In `governance.routes.ts` Create (Zeile ~196) und Update (Zeile ~241): Rules durch `ensureRuleIds(rules)` normalisieren (Import aus `../models/Policy`). Beim Update: `req.body.rules && (req.body.rules = ensureRuleIds(req.body.rules));` VOR `findByIdAndUpdate`.

**Ebenfalls in der Create-Route (verifiziert 2026-07-14):** Zeile 202 hat den Legacy-Fallback `severity: severity || 'warning'` → auf `|| 'medium'` ändern — exakt das Pendant zu `standards.routes.ts:604` (Task 6); ohne Fix wirft jeder Policy-Create ohne severity nach der Migration einen Mongoose-Enum-Fehler.

- [ ] **Step 3: Run — PASS** (`--testPathPattern=policy-evaluation`), **Step 4: Commit**

```bash
git add packages/server/src/services/policy-evaluation.service.ts packages/server/src/routes/governance.routes.ts packages/server/src/__tests__/policy-evaluation.test.ts
git commit -m "feat(compliance): evaluation writes ruleId/enforcementLevel/resourcePath (THE-442)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: LLM-Draft-Pipeline + Client auf neue Domain

**Files:**
- Modify: `packages/server/src/services/ai.service.ts` — Draft-Prompt: JSON-Beispiel Z.764 + Instruktionszeile Z.767 (`Set severity: "error" for SHALL/MUST..., "warning" for SHOULD, "info" for MAY`) auf `low|medium|high|critical` umstellen (SHALL/MUST→`high`, SHOULD→`medium`, MAY→`low`; `critical` dem LLM NICHT anbieten — Eskalation ist menschliche Entscheidung); Remediation-Guidance Z.966 (siehe unten). `enforcementLevel` NICHT vom LLM erfragen (immer advisory).
- Modify: `packages/server/src/routes/standards.routes.ts` — Fallback Z.604 (siehe unten).
- Modify: `packages/client/src/components/governance/PolicyDraftReview.tsx`
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`
- Modify: `packages/client/src/components/governance/PolicyManager.tsx`

- [ ] **Step 1: Server-Draft-Pipeline**

Im Draft-Generierungs-Prompt (severity-Aufzählung) `error|warning|info` → `low|medium|high|critical` ersetzen; Beispiel-JSON im Prompt mitziehen. Beim Persistieren approved Drafts (`approvePolicies`-Endpoint) `enforcementLevel: 'advisory'` explizit setzen. **Konkret verifiziert:** `standards.routes.ts:604` hat den Fallback `severity: draft.severity || 'warning'` → auf `|| 'medium'` ändern (sonst Enum-Fehler bei leerem Draft-severity).

**Zweiter LLM-Prompt (Review-Fund 2026-07-14, für beide Sweep-Greps unsichtbar!):** `ai.service.ts` Remediation-Suggestions — Zeile ~940 interpoliert `p.severity` in den Policy-Kontext (neue Werte fließen automatisch rein), aber Zeile ~966 instruiert `Priority: "high" for SHALL/MUST or Error-severity policies, "medium" for SHOULD/Warning, "low" for MAY/Info`. Guidance umschreiben auf: `Priority: "high" for SHALL/MUST or critical/high-severity policies, "medium" for SHOULD/medium, "low" for MAY/low`. Ohne Fix sieht das LLM nach der Migration Labels wie `(critical)`, die in der Anleitung nicht vorkommen.

- [ ] **Step 2: Client — SEVERITY_CONFIG-Domänen**

`PolicyDraftReview.tsx:13-17` ersetzen:

```typescript
const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Critical' },
  high: { icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'High' },
  medium: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Medium' },
  low: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Low' },
};
```

Die Badge-Beschriftung „Enforcement severity" (Zeile ~346-353) in **„Severity"** umbenennen (Entwirrung severity ≠ enforcement, THE-442). `ComplianceDashboard.tsx`: `severityIcon`-Map (Zeile ~51-55) auf 4 Werte erweitern; die Summary-Tiles `errors/warnings/infos` auf `summary.critical/high/medium/low` umstellen (Server-Shape aus Task 3). `PolicyManager.tsx`: severity-`<select>`-Options auf neue Domain; ruleId bei Edits unangetastet mitschicken (Rules-State 1:1 durchreichen, kein Strippen unbekannter Felder). **Konkrete Anker (verifiziert 2026-07-14):** Interface-Typ Zeile 19, `SEVERITIES`-Const Zeile 27, und `useState<string>('warning')` Zeile 46 → Default `'medium'` — Letzteres ist ein Runtime-Enum-Fehler, KEIN Compile-Fehler (useState ist `<string>` getypt), fällt also nicht bei der Typfehler-Inventur aus Task 1 auf.

- [ ] **Step 2b: Violation-Renderer außerhalb governance/ (Review-Fund 2026-07-14 — sonst Post-Migration-Rendering-Regression: alles fällt in den else-/Info-Zweig)**

Einheitliche Farbsprache wie `SEVERITY_CONFIG` aus Step 2 (critical=rot `#ef4444`, high=orange `#f97316`, medium=gelb `#eab308`, low=blau `#3b82f6`):

- `packages/client/src/components/ui/PropertyPanel.tsx`: Glyph-Branch Zeile ~372 (`error→'!'` / `warning→'○'` / else `'i'`) → `critical|high→'!'`, `medium→'○'`, `low→'i'` (Unterscheidung critical/high trägt die Farbe); `SEVERITY_COLORS`-Map Zeile ~1578-1582 auf die 4 neuen Keys umstellen (genutzt an ~1638/~1707); severity-Vergleiche Zeile ~1708 mitziehen.
- `packages/client/src/components/ui/Sidebar.tsx`: Bucket-Reducer Zeile ~439-447 von `{errors, warnings, infos}` auf `{critical, high, medium, low}` umstellen und **4 Count-Tiles** rendern (statt 3, gleiche Optik wie die ComplianceDashboard-Tiles aus diesem Task); Icon-Branches Zeile ~739-741: `critical|high→AlertCircle` (rot/orange), `medium→AlertTriangle` (gelb), `low→Info` (blau).

- [ ] **Step 3: Builds grün**

Run: `npm run build --workspace=@thearchitect/shared && npm run build --workspace=@thearchitect/server && npm run build --workspace=@thearchitect/client`
Expected: Alle drei PASS. Verbleibende severity-Literale findet: `grep -rn "'error'\|'warning'\|'info'" packages/client/src --include="*.tsx" -l | xargs grep -ln "severity"` — nur policy-/compliance-bezogene Treffer anfassen (NICHT Toast-/Log-Level!).

- [ ] **Step 4: Commit**

```bash
git add packages/server packages/client
git commit -m "feat(compliance): draft pipeline + governance UIs on new severity domain (THE-442)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 7: Chunk-Abschluss — Blast-Radius-Sweep

- [ ] **Step 1: Vollständigkeits-Check gegen RVTM §4**

Run: `grep -rn "severity: '\(error\|warning\|info\)'\|severity === '\(error\|warning\|info\)'\|severity || '\(error\|warning\|info\)'\|error' | 'warning' | 'info" packages/server/src packages/shared/src packages/client/src --include="*.ts" --include="*.tsx" | grep -iv "toast\|console\|InsightSeverity\|advisor"`
Expected: Keine policy-/violation-bezogenen Treffer mehr. (Grep gehärtet 2026-07-14: fängt jetzt auch `|| 'warning'`-Fallbacks und Einzel-Literale — der ursprüngliche Union-Type-only-Grep übersah `governance.routes.ts:202`. Bekannte Ist-Treffer vor dem Sweep, u. a.: Modelle/DTOs aus Task 1–2, Fixtures in `governance-routes.test.ts`/`policy-evaluation.test.ts`/`norm-pipeline.test.ts:268`, `seed-policies.ts`, `demo-seed.ts` (9 Sites ab Z.166), `demo-seed-bsh.ts` (6 Sites: 182/195/208/221/234/248), `PolicyManager.tsx:19/27/46`, `PropertyPanel.tsx:372/1578-1582/1708`, `Sidebar.tsx:439-447/739-741` — die Liste ist NICHT exhaustiv, der Grep ist die Autorität.)

Zusätzlicher Prompt-Sweep (LLM-Prompts sind Prosa/double-quoted — obiger Grep sieht sie nicht):

Run: `grep -rn "Error-severity\|for SHOULD/Warning\|MAY/Info\|error|warning|info\|\"error\"\|\"warning\"\|\"info\"" packages/server/src/services/ai.service.ts packages/server/src/routes/standards.routes.ts packages/server/src/prompts/`
Expected: Keine Treffer (Task 6 hat alle drei Prompt-Sites umgestellt). Vor dem Sweep fängt dieses Muster exakt `ai.service.ts:764` (JSON-Beispiel), `:767` (Instruktionszeile `Set severity: "error" for SHALL/MUST...`) und `:966` (Remediation-Guidance) — empirisch verifiziert 2026-07-14, kein Rauschen. Die Double-Quote-Literale sind Pflicht: Zeile 767 entging sowohl dem Haupt-Sweep (single-quoted-Muster) als auch der ersten Fassung dieses Greps. `syncViolationToNeo4j`-Signatur prüfen (`policy-graph.service.ts` — nimmt severity als string entgegen → kompiliert, keine Änderung nötig, aber Neo4j-severity-Property enthält jetzt neue Werte: PolicyBoard/NodeObject3D keyen auf Counts, nicht auf severity → unkritisch).

- [ ] **Step 2: Gesamte Test-Suite + THE-442 in Linear auf Done**

Run: `npm test --workspace=@thearchitect/server && npm test --workspace=@thearchitect/client`
Expected: PASS. Danach: Linear THE-442 → Done mit Kommentar (Datei-Liste).

---

## Chunk 2: REQ-003.2 Strukturierte Violation-Messages (THE-202)

### Task 8: JSON-Schema + Schema-Test (CI-Gate)

**Files:**
- Create: `packages/server/src/schemas/validation-violation.schema.json`
- Create: `packages/server/src/__tests__/violation-schema.test.ts`
- Modify: `packages/server/package.json` (devDependency `ajv@^8`)

- [ ] **Step 1: Schema-File anlegen**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "validation-violation.schema.json",
  "title": "PolicyViolation output contract (REQ-CHOICE-003.2, OPA/Kyverno style)",
  "type": "object",
  "required": ["ruleId", "severity", "message", "resourcePath"],
  "properties": {
    "ruleId": { "type": "string", "minLength": 1 },
    "severity": { "enum": ["low", "medium", "high", "critical"] },
    "enforcementLevel": { "enum": ["advisory", "soft_mandatory", "hard_mandatory"] },
    "message": { "type": "string", "minLength": 1 },
    "resourcePath": { "type": "string", "pattern": "^/elements/.+" },
    "docLink": { "type": "string", "format": "uri-reference" }
  }
}
```

- [ ] **Step 2: ajv installieren + failing Test**

Run: `npm install -D ajv@^8 ajv-formats@^3 --workspace=@thearchitect/server`
(**Verifiziert:** ohne `ajv-formats` wirft `ajv.compile` bei `"format": "uri-reference"` — `addFormats(ajv)` ist Pflicht.)

```typescript
// packages/server/src/__tests__/violation-schema.test.ts
// REQ-003.2 AC-4: Jeder Violation-Output ist schema-konform (CI-Gate via jest).
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../schemas/validation-violation.schema.json';
import { toViolationMessage } from '../services/violation-format';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

describe('validation-violation.schema.json (THE-202)', () => {
  it('accepts a well-formed violation message', () => {
    const msg = toViolationMessage({
      ruleId: 'r-123e4567-e89b-42d3-a456-426614174000',
      severity: 'high',
      enforcementLevel: 'soft_mandatory',
      message: 'Element needs a description',
      elementId: 'el-1',
      field: 'description',
      docLink: '/compliance/standards/abc#3.1',
    });
    expect(validate(msg)).toBe(true);
  });

  it('rejects legacy severities and missing ruleId', () => {
    expect(validate({ severity: 'error', message: 'x', resourcePath: '/elements/e/f', ruleId: 'r-1' })).toBe(false);
    expect(validate({ severity: 'high', message: 'x', resourcePath: '/elements/e/f' })).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL**, dann `violation-format.ts` implementieren

```typescript
// packages/server/src/services/violation-format.ts
// REQ-003.2: kanonische Wire-Form einer Violation (OPA/Kyverno-Stil).
// ViolationMessage lebt in SHARED (Task 1) — Client typisiert damit.
import { ViolationSeverity, EnforcementLevel, ViolationMessage } from '@thearchitect/shared';

export type { ViolationMessage };

export interface ViolationMessageInput {
  ruleId: string;
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
  message: string;
  elementId: string;
  field: string;
  docLink?: string;
}

export function toViolationMessage(input: ViolationMessageInput): ViolationMessage {
  const msg: ViolationMessage = {
    ruleId: input.ruleId,
    severity: input.severity,
    enforcementLevel: input.enforcementLevel,
    message: input.message,
    resourcePath: `/elements/${input.elementId}/${input.field}`,
  };
  if (input.docLink) msg.docLink = input.docLink;
  return msg;
}
```

- [ ] **Step 4: Run — PASS · Step 5: Commit** (`feat(compliance): violation output schema + ajv gate (THE-202)`)

### Task 9: docLink-Ableitung (Norm-Registry first)

**Files:**
- Modify: `packages/server/src/services/policy-evaluation.service.ts` (Stub aus Task 5 ersetzen)
- Test: `packages/server/src/__tests__/policy-evaluation.test.ts`

- [ ] **Step 1: Failing Test**

```typescript
  it('derives docLink from standardId + sourceSectionNumber, else undefined', async () => {
    const { deriveDocLink } = await import('../services/policy-evaluation.service');
    expect(deriveDocLink({ standardId: 'std-1', sourceSectionNumber: '4.2' }))
      .toBe('/compliance/standards/std-1#4.2');
    expect(deriveDocLink({ standardId: 'std-1' })).toBe('/compliance/standards/std-1');
    expect(deriveDocLink({})).toBeUndefined();
  });
```

- [ ] **Step 2: Implementieren + exportieren**

```typescript
/**
 * REQ-003.2: docLink zeigt auf die Quelle der Policy — Standards/Norm-Registry
 * (THE-413/414) wenn die Policy daraus generiert wurde; sonst undefined
 * (Client rendert dann keinen Link). Relative App-Route, KEINE externe URL.
 */
export function deriveDocLink(policy: { standardId?: unknown; sourceSectionNumber?: string }): string | undefined {
  if (!policy.standardId) return undefined;
  const base = `/compliance/standards/${String(policy.standardId)}`;
  return policy.sourceSectionNumber ? `${base}#${policy.sourceSectionNumber}` : base;
}
```

Beide Upsert-`$set`-Blöcke: `docLink: deriveDocLink(policy)`.

- [ ] **Step 3: Run — PASS · Commit** (`feat(compliance): docLink derivation from norm registry (THE-202)`)

### Task 10: Client — Violation-Details statt Count-Maps + 3D-Inline

**Files:**
- Modify: `packages/client/src/stores/complianceStore.ts`
- Modify: `packages/client/src/components/3d/NodeObject3D.tsx` (Tooltip-Teil, ~Zeile 470-480)
- Test: `packages/client/src/stores/complianceStore.details.test.ts` (Create — FLACH neben dem Store, Konvention verifiziert: `complianceStore.mappings.test.ts` liegt dort. **Diese Datei als Vorlage nehmen** — insbesondere deren vi.mock-Factory für `../services/api` vollständig kopieren: sie muss `governanceAPI`, `compliancePipelineAPI`, `complianceMappingAPI` etc. exportieren, sonst brechen Import-Ketten.)

- [ ] **Step 1: Failing Store-Test** — `loadViolations` baut zusätzlich `violationDetailsByElement: Map<string, PolicyViolationDTO[]>` (top-N je Element, N=5, sortiert critical→low).

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComplianceStore } from '../complianceStore';
import { governanceAPI } from '../../services/api';

vi.mock('../../services/api', () => ({
  governanceAPI: { getViolations: vi.fn() },
  compliancePipelineAPI: {},
}));

describe('complianceStore.loadViolations (THE-202)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds detail map sorted by severity, capped at 5 per element', async () => {
    const mk = (i: number, severity: string) => ({
      _id: `v${i}`, projectId: 'p', policyId: 'pol', elementId: 'el-1',
      violationType: 'violation', severity, enforcementLevel: 'advisory',
      ruleId: `r-${i}`, message: `m${i}`, field: 'f', resourcePath: `/elements/el-1/f`,
      currentValue: null, expectedValue: null, status: 'open',
      detectedAt: '', details: '',
    });
    (governanceAPI.getViolations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [mk(1, 'low'), mk(2, 'critical'), mk(3, 'medium'), mk(4, 'high'), mk(5, 'low'), mk(6, 'low')] },
    });

    await useComplianceStore.getState().loadViolations('p');
    const details = useComplianceStore.getState().violationDetailsByElement.get('el-1')!;
    expect(details).toHaveLength(5);
    expect(details[0].severity).toBe('critical');
    expect(details[1].severity).toBe('high');
    expect(useComplianceStore.getState().violationsByElement.get('el-1')).toBe(6);
  });
});
```

- [ ] **Step 2: Run — FAIL · Step 3: Implementieren**

In `loadViolations` (nach dem Count-Map-Aufbau, `complianceStore.ts:~337`):

```typescript
      const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const detailsByElement = new Map<string, PolicyViolationDTO[]>();
      for (const v of violations) {
        const list = detailsByElement.get(v.elementId) || [];
        list.push(v);
        detailsByElement.set(v.elementId, list);
      }
      for (const [k, list] of detailsByElement) {
        list.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
        detailsByElement.set(k, list.slice(0, 5));
      }
```

State-Feld `violationDetailsByElement: Map<string, PolicyViolationDTO[]>` (Initial `new Map()`) + ins `set({...})`. In `NodeObject3D.tsx`: Die Detail-Map ist per **verletzendem Element** gekeyt — gerendert wird am Element-Tooltip/-Label (der rote Dot bei `violationCount > 0`, Zeile ~424-430), NICHT am Policy-Node („N violations"-Branch ist der isPolicyNode-Pfad). Top-3 aus der Detail-Map: `{details.slice(0,3).map(v => `${v.severity.toUpperCase()}: ${v.message}`)}`, Rest als „+N more". Kein neues Fetch — Map kommt aus dem Store.

- [ ] **Step 4: Run — PASS** (`npm test --workspace=@thearchitect/client -- complianceStore`) · **Step 5: Commit** (`feat(compliance): violation details in store + 3D inline messages (THE-202)`)

### Task 11: Chunk-Abschluss THE-202

- [ ] Alle Suites grün (`npm test --workspace=@thearchitect/server && npm test --workspace=@thearchitect/client`), Linear THE-202 → Done (AC-2 „Doku-Link": erfüllt via deriveDocLink — Registry-Route; AC-4: jest = CI-Lauf, siehe Chunk 7).

---

## Chunk 3: REQ-003.3 Enforcement-Gating (THE-203)

**Architektur-Entscheidung (aus Pre-Flight):** Nur `hard_mandatory`-Policies laufen synchron im Write-Request (Latenz-Schutz); advisory/soft bleiben auf dem asynchronen Pfad. Das Gate evaluiert den **Kandidaten-Zustand** (req.body bzw. bestehendes Element + Patch), NICHT den Neo4j-Stand — sonst prüft man das Element von gestern.

### Task 12: enforcement-gate.service.ts

**Files:**
- Create: `packages/server/src/services/enforcement-gate.service.ts`
- Test: `packages/server/src/__tests__/enforcement-gate.test.ts`

- [ ] **Step 1: Failing Tests**

```typescript
// packages/server/src/__tests__/enforcement-gate.test.ts
// REQ-003.3: Hard-Mandatory blockt synchron; advisory/soft passieren.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Policy } from '../models/Policy';
import { checkHardMandatoryGate } from '../services/enforcement-gate.service';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn().mockResolvedValue([]) }));

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await Policy.deleteMany({}); });

const PROJECT_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

function hardPolicy(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID, name: 'No critical risk on retired', category: 'security',
    severity: 'critical', enforcementLevel: 'hard_mandatory', enabled: true, status: 'active',
    source: 'custom', scope: { domains: [], elementTypes: [], layers: [] },
    rules: [{ field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'Critical risk not allowed' }],
    createdBy: USER_ID, ...overrides,
  };
}

const candidate = {
  id: 'el-1', name: 'Mainframe', type: 'node', layer: 'technology',
  togafDomain: 'technology', maturityLevel: 3, riskLevel: 'critical',
  status: 'current', description: 'legacy box', metadata: {},
};

describe('checkHardMandatoryGate (THE-203)', () => {
  it('blocks a candidate violating a hard_mandatory policy', async () => {
    await Policy.create(hardPolicy());
    const result = await checkHardMandatoryGate(PROJECT_ID.toString(), candidate);
    expect(result.blocked).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      severity: 'critical',
      enforcementLevel: 'hard_mandatory',
      resourcePath: '/elements/el-1/riskLevel',
      message: 'Critical risk not allowed',
    });
    expect(result.violations[0].ruleId).toMatch(/^r-/);
  });

  it('does NOT block for soft_mandatory or advisory policies', async () => {
    await Policy.create(hardPolicy({ enforcementLevel: 'soft_mandatory' }));
    const result = await checkHardMandatoryGate(PROJECT_ID.toString(), candidate);
    expect(result.blocked).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('respects scope, enabled, status and effective dates', async () => {
    await Policy.create(hardPolicy({ enabled: false }));
    await Policy.create(hardPolicy({ name: 'p2', status: 'draft' }));
    await Policy.create(hardPolicy({ name: 'p3', effectiveFrom: new Date(Date.now() + 86400000) }));
    await Policy.create(hardPolicy({ name: 'p4', scope: { domains: [], elementTypes: ['application_component'], layers: [] } }));
    const result = await checkHardMandatoryGate(PROJECT_ID.toString(), candidate);
    expect(result.blocked).toBe(false);
  });

  it('skips motivation-layer candidates (parity with async path)', async () => {
    await Policy.create(hardPolicy());
    const result = await checkHardMandatoryGate(PROJECT_ID.toString(), { ...candidate, layer: 'motivation' });
    expect(result.blocked).toBe(false);
  });

  it('passes a compliant candidate', async () => {
    await Policy.create(hardPolicy());
    const result = await checkHardMandatoryGate(PROJECT_ID.toString(), { ...candidate, riskLevel: 'low' });
    expect(result.blocked).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`--testPathPattern=enforcement-gate`)

- [ ] **Step 3: Implementieren**

```typescript
// packages/server/src/services/enforcement-gate.service.ts
// REQ-003.3 (THE-203): Synchrones Hard-Mandatory-Gate im Write-Path.
// Bewusst NUR hard_mandatory — advisory/soft laufen weiter asynchron über
// evaluateElementPolicies (Latenz-Schutz). Evaluiert den KANDIDATEN-Zustand,
// nicht Neo4j. Muster: Zod-Gate an der Schreibgrenze (THE-417).
import { Policy } from '../models/Policy';
import { evaluateRule, elementMatchesScope, getFieldValue } from './compliance.service';
import { toViolationMessage, ViolationMessage } from './violation-format';
import { deriveDocLink } from './policy-evaluation.service';
import type { EnforcementLevel } from '@thearchitect/shared';

export interface ElementCandidate {
  id: string;
  name: string;
  type: string;
  layer: string;
  togafDomain?: string;
  maturityLevel?: number;
  riskLevel?: string;
  status?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GateResult {
  blocked: boolean;
  violations: ViolationMessage[];
}

/**
 * getEffectiveEnforcementLevel — Single Point of Truth für die effektive
 * Enforcement-Stufe. THE-206 (Cutoff-Dämpfung) erweitert GENAU diese
 * Funktion; bis dahin Identität.
 */
export function getEffectiveEnforcementLevel(
  policy: { enforcementLevel: EnforcementLevel; severity: string },
  governanceSettings?: { enforcementCutoff?: string },
): EnforcementLevel {
  void governanceSettings; // THE-206
  return policy.enforcementLevel;
}

export async function checkHardMandatoryGate(
  projectId: string,
  candidate: ElementCandidate,
  governanceSettings?: { enforcementCutoff?: string },
): Promise<GateResult> {
  // Parität mit dem asynchronen Pfad (policy-evaluation.service.ts):
  if (candidate.layer === 'motivation') return { blocked: false, violations: [] };
  if (candidate.metadata?.isPolicyNode) return { blocked: false, violations: [] };
  if (candidate.metadata?.source === 'compliance-policy') return { blocked: false, violations: [] };

  const policies = await Policy.find({
    projectId,
    enabled: true,
    status: { $in: ['active', undefined, null] },
    enforcementLevel: 'hard_mandatory',
  });

  const now = new Date();
  const violations: ViolationMessage[] = [];

  // Scope-Matching erwartet {type, domain, layer} — Kandidat mappen
  const scopeView = { type: candidate.type, domain: String(candidate.togafDomain || ''), layer: candidate.layer };

  for (const policy of policies) {
    if (policy.effectiveFrom && policy.effectiveFrom > now) continue;
    if (policy.effectiveUntil && policy.effectiveUntil < now) continue;
    if (getEffectiveEnforcementLevel(policy, governanceSettings) !== 'hard_mandatory') continue;
    if (!elementMatchesScope(scopeView, policy)) continue;

    for (const rule of policy.rules) {
      const fieldValue = getFieldValue(candidate as Record<string, unknown>, rule.field);
      if (!evaluateRule(fieldValue, rule.operator, rule.value)) {
        violations.push(
          toViolationMessage({
            ruleId: rule.ruleId,
            severity: policy.severity,
            enforcementLevel: 'hard_mandatory',
            message: rule.message,
            elementId: candidate.id,
            field: rule.field,
            docLink: deriveDocLink(policy),
          }),
        );
      }
    }
  }

  return { blocked: violations.length > 0, violations };
}
```

**Feld-Namen-Falle (Update-Pfad-sicher):** Der asynchrone Pfad evaluiert Neo4j-Feldnamen (`maturity`, `domain`). Create-Kandidaten kommen aus `CreateElementSchema` mit `maturityLevel`/`togafDomain`; **Update-Kandidaten sind `{...loadElement(existing), ...parsed}` und tragen bereits `maturity`/`domain`** — ein naiver Alias würde sie mit `undefined` überschreiben. Deshalb Koaleszenz in beide Richtungen:

```typescript
  const evalView = {
    ...candidate,
    maturity: (candidate as Record<string, unknown>).maturityLevel ?? (candidate as Record<string, unknown>).maturity,
    domain: candidate.togafDomain ?? (candidate as Record<string, unknown>).domain,
  };
```

`getFieldValue(evalView, ...)` verwenden; `scopeView.domain` analog: `String(candidate.togafDomain ?? (candidate as Record<string, unknown>).domain ?? '')`. ZWEI Tests ergänzen: (a) Create-Form (`maturityLevel: 1` gegen `field: 'maturity'`-Policy), (b) **Update-Form** (Kandidat mit `maturity: 1`/`domain: 'technology'` OHNE `maturityLevel`/`togafDomain` — domain-gescope-te Hard-Policy MUSS greifen).

- [ ] **Step 4: Run — PASS · Step 5: Commit** (`feat(compliance): synchronous hard-mandatory gate service (THE-203)`)

### Task 13: Gate in Write-Routen einhängen (422)

**Files:**
- Modify: `packages/server/src/routes/architecture.routes.ts` (Create ~:586, Update ~:700-760)
- Test: `packages/server/src/__tests__/governance-routes.test.ts` oder neue `architecture-gate.test.ts` — dem bestehenden Route-Test-Stil folgen (supertest? prüfen mit `grep -l supertest packages/server/src/__tests__/`; falls Routen bisher nicht per HTTP getestet werden, Service-Level-Test aus Task 12 gilt als Kern-Coverage und die Route wird per manueller Verifikation + In-Browser-Test abgenommen — im RVTM dokumentieren)

- [ ] **Step 1: Create-Route** — in `architecture.routes.ts` NACH `CreateElementSchema.parse` (Zeile ~586) und VOR dem Cypher:

```typescript
      // REQ-003.3: Hard-Mandatory-Gate — synchron, VOR dem Persist.
      const gate = await checkHardMandatoryGate(String(projectId), {
        ...parsed,
        id: parsed.id || element.id,
        metadata: parsed.metadata || {},
      });
      if (gate.blocked) {
        res.status(422).json({
          success: false,
          error: 'policy_violation',
          message: 'Blocked by hard-mandatory policy',
          violations: gate.violations,
        });
        return;
      }
```

(Import oben ergänzen. ACHTUNG Reihenfolge: `element` wird erst nach parse gebaut — Gate-Aufruf entsprechend NACH `const element = {...}` platzieren und `element` direkt übergeben.)

- [ ] **Step 2: Update-Route** — hier ist der Kandidat `bestehendes Element + Patch`. Vor dem `runCypher(MATCH...SET...)` (Zeile ~751):

```typescript
      // REQ-003.3: Effektiven Zielzustand prüfen (bestehend + Patch)
      const existing = await loadElementForGate(String(elementId));
      if (existing) {
        const gate = await checkHardMandatoryGate(String(req.params.projectId), { ...existing, ...parsed, id: String(elementId) });
        if (gate.blocked) {
          res.status(422).json({ success: false, error: 'policy_violation', message: 'Blocked by hard-mandatory policy', violations: gate.violations });
          return;
        }
      }
```

`loadElementForGate`: `loadElement` aus `policy-evaluation.service.ts` exportieren (heute privat, Zeile 24; ab Task 23 in `element-loader.service.ts`) und mit Import-Alias einbinden: `import { loadElement as loadElementForGate } from '../services/policy-evaluation.service';` — KEINE Kopie.

**Latenz-Optimierung Update-Pfad:** Der Neo4j-`loadElement`-Read darf NICHT unconditional laufen. Erst prüfen, ob überhaupt Hard-Policies existieren, dann laden:

```typescript
      const hasHardPolicies = await Policy.exists({
        projectId: String(req.params.projectId), enabled: true,
        status: { $in: ['active', undefined, null] }, enforcementLevel: 'hard_mandatory',
      });
      if (hasHardPolicies) {
        const existing = await loadElementForGate(String(elementId));
        // ...Gate wie oben
      }
```

- [ ] **Step 3: Latenz-Schutz dokumentieren** — Kommentar an beiden Stellen: Gate lädt NUR `enforcementLevel: 'hard_mandatory'`-Policies (indexierte Query); bei 0 Hard-Policies kostet der Create-Pfad eine Mongo-Query (~1ms), der Update-Pfad dank `Policy.exists`-Guard keinen Neo4j-Read. Index ergänzen in `Policy.ts`:

```typescript
policySchema.index({ projectId: 1, enforcementLevel: 1, enabled: 1 });
```

- [ ] **Step 4: Verifikation**

Run: `npm test --workspace=@thearchitect/server` (Regression) + manueller curl-Test gegen dev-Server:

```bash
# Mac, Repo-Root — Server läuft via npm run dev (PORT=4000, siehe .env)
# 1) Hard-Policy anlegen (via UI oder curl auf /api/projects/:id/policies mit enforcementLevel hard_mandatory)
# 2) Element mit Verstoß anlegen:
curl -s -X POST http://localhost:4000/api/projects/$PROJECT/elements \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"node","name":"Bad","layer":"technology","riskLevel":"critical", ...}' | jq
# Expected: {"success":false,"error":"policy_violation","violations":[{"ruleId":"r-...","severity":"critical",...}]} + HTTP 422
```

- [ ] **Step 5: Commit** (`feat(compliance): hard-mandatory gate wired into element write path (THE-203)`)

### Task 14: Client — 422-Handling + Block-Dialog + Enforcement-Icons

**Files:**
- Create: `packages/client/src/components/governance/EnforcementBlockDialog.tsx`
- Modify: `packages/client/src/stores/architectureStore.ts` (create/update-Element-Actions)
- Modify: `packages/client/src/components/governance/PolicyManager.tsx` (enforcementLevel-Select)
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx` (Icons)

- [ ] **Step 1: Store-Handling — ACHTUNG, der Store ist OPTIMISTISCH.** `addElement`/`updateElement` (`architectureStore.ts:~217-250`) wenden Änderungen synchron auf den lokalen State an und feuern die API fire-and-forget (`.catch` schluckt Fehler). Ein Gate-422 muss deshalb **zurückrollen**, sonst steht das geblockte Element trotzdem im 3D:

```typescript
// In addElement: nach dem optimistischen set(...) im API-.catch:
      .catch((err: unknown) => {
        const resp = (err as { response?: { status?: number; data?: { error?: string; violations?: ViolationMessage[] } } }).response;
        if (resp?.status === 422 && resp.data?.error === 'policy_violation') {
          // Rollback: optimistisch hinzugefügtes Element wieder entfernen
          set((s) => ({
            elements: s.elements.filter((e) => e.id !== element.id),
            enforcementBlock: { violations: resp.data!.violations || [], elementName: element.name },
          }));
          return;
        }
        /* bestehendes Fehler-Logging beibehalten */
      });

// In updateElement: VOR dem optimistischen Apply Snapshot ziehen:
      const prev = get().elements.find((e) => e.id === elementId);
      // ...optimistisches set(...) wie bisher; im API-.catch bei 422/policy_violation:
      //    Snapshot wiederherstellen + enforcementBlock setzen:
      set((s) => ({
        elements: s.elements.map((e) => (e.id === elementId && prev ? prev : e)),
        enforcementBlock: { violations: resp.data!.violations || [], elementName: prev?.name || elementId },
      }));
```

(`ViolationMessage` kommt aus `@thearchitect/shared` — Task 1.) Neuer State: `enforcementBlock: { violations: ViolationMessage[]; elementName: string } | null` + `clearEnforcementBlock()`. Die exakten Action-Namen/Zeilen beim Einbau verifizieren: `grep -n "addElement\|updateElement" packages/client/src/stores/architectureStore.ts`.

- [ ] **Step 2: Dialog** — `EnforcementBlockDialog.tsx` (Dark-Theme-Palette `bg-[#0f172a]`/`border-[#334155]`, Muster: bestehende Dialoge in `components/governance/`):

```tsx
// Rendert enforcementBlock aus dem architectureStore als Modal:
// rotes Block-Icon (Ban aus lucide), Titel "Blocked by policy",
// Liste der Violations (severity-Badge, message, docLink als <Link>),
// Restoration-Text: "This change violates a hard-mandatory policy.
// You can adjust the element, or ask an admin to lower the policy's
// enforcement level." — ein Button: "Understood" (clearEnforcementBlock).
// Kein Override-Button: hard_mandatory ist nicht overridebar (REQ-003.4).
```

Mount in `ProjectView.tsx` neben bestehenden Overlays.

- [ ] **Step 3: PolicyManager** — `enforcementLevel`-`<select>` (Advisory/Soft Mandatory/Hard Mandatory, Default advisory) neben dem severity-Select; Hilfetext: „Severity = how bad. Enforcement = what happens." Icons in ComplianceDashboard: advisory=gelbes `AlertTriangle`, soft=oranges `AlertTriangle` + „Override possible"-Hint, hard=rotes `Ban` (REQ-AC-2).

- [ ] **Step 4: Build + Sichtprüfung**

Run: `npm run build --workspace=@thearchitect/client` · dev-Server: Element gegen Hard-Policy anlegen → Dialog erscheint, Änderung nicht persistiert, kein Konsolen-Error.

- [ ] **Step 5: Commit** (`feat(compliance): enforcement block dialog + level select (THE-203)`)

### Task 15: Chunk-Abschluss THE-203 — Linear Done + Suite grün

- [ ] `npm test --workspace=@thearchitect/server && npm run build --workspace=@thearchitect/client` → PASS. THE-203 → Done (AC-3 „Save-Button disabled" wurde per Pre-Flight-Präzisierung zu „422 + Block-Dialog, Änderung nicht stillschweigend verworfen").

---

## Chunk 4: REQ-003.4 Override + Audit-Trail (THE-204)

### Task 16: Override-Route

**Files:**
- Modify: `packages/server/src/routes/governance.routes.ts`
- Test: `packages/server/src/__tests__/governance-routes.test.ts` (bestehende Datei — Stil übernehmen; falls kein HTTP-Test-Harness: `override.service.ts` + Service-Test, Route dünn halten)

- [ ] **Step 1: Failing Test (Service-Ebene)** — `packages/server/src/services/violation-override.service.ts` mit Test `violation-override.test.ts`:

```typescript
// Kern-Assertions:
// 1. overrideViolation(...) mit reason < 50 chars → wirft OverrideValidationError
// 2. Violation mit enforcementLevel 'hard_mandatory' → wirft (nicht overridebar)
// 3. advisory → wirft (nichts zu overriden)
// 4. Happy path (soft_mandatory, reason ≥ 50): status='suppressed',
//    overrideReason/suppressedAt/suppressedBy gesetzt,
//    AuditLog-Eintrag mit action='policy_violation_override' und
//    after={policyId, ruleId, elementId, enforcementLevel, severity, reason}
// 5. Bereits suppressed → idempotenter Fehler ('already overridden')
```

Vollständiger Testcode analog Task-12-Stil (Memory-DB, PolicyViolation + AuditLog real, kein Neo4j nötig).

- [ ] **Step 2: Run — FAIL · Step 3: Service implementieren**

```typescript
// packages/server/src/services/violation-override.service.ts
// REQ-003.4 (THE-204): Soft-Override mit Begründungspflicht + Audit-Trail.
import mongoose from 'mongoose';
import { PolicyViolation } from '../models/PolicyViolation';
import { createAuditEntry } from '../middleware/audit.middleware';

export const MIN_REASON_LENGTH = 50;

export class OverrideValidationError extends Error {
  constructor(message: string, public readonly statusCode = 422) { super(message); }
}

export async function overrideViolation(params: {
  projectId: string;
  violationId: string;
  reason: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ violationId: string; status: 'suppressed' }> {
  const reason = (params.reason || '').trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new OverrideValidationError(`Override reason must be at least ${MIN_REASON_LENGTH} characters (got ${reason.length})`);
  }

  const violation = await PolicyViolation.findOne({ _id: params.violationId, projectId: params.projectId });
  if (!violation) throw new OverrideValidationError('Violation not found', 404);
  if (violation.status === 'suppressed') throw new OverrideValidationError('Violation already overridden', 409);
  if (violation.status !== 'open') throw new OverrideValidationError('Only open violations can be overridden');
  if (violation.enforcementLevel === 'hard_mandatory') {
    throw new OverrideValidationError('hard_mandatory violations cannot be overridden', 403);
  }
  if (violation.enforcementLevel === 'advisory') {
    throw new OverrideValidationError('advisory violations need no override — they never block');
  }

  violation.status = 'suppressed';
  violation.overrideReason = reason;
  violation.suppressedAt = new Date();
  violation.suppressedBy = new mongoose.Types.ObjectId(params.userId);
  await violation.save();

  // Append-only Audit (AuditLog hat keine UPDATE/DELETE-Routen — REQ-AC-3)
  await createAuditEntry({
    userId: params.userId,
    projectId: params.projectId,
    action: 'policy_violation_override',
    entityType: 'policy_violation',
    entityId: String(violation._id),
    after: {
      policyId: String(violation.policyId),
      ruleId: violation.ruleId,
      elementId: violation.elementId,
      enforcementLevel: violation.enforcementLevel,
      severity: violation.severity,
      reason,
    },
    ip: params.ip,
    userAgent: params.userAgent,
    riskLevel: 'medium',
  });

  return { violationId: String(violation._id), status: 'suppressed' };
}
```

Route in `governance.routes.ts` (nach den Violation-GETs):

```typescript
// Override a soft-mandatory violation (REQ-003.4)
router.post(
  '/:projectId/violations/:violationId/override',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const result = await overrideViolation({
        projectId: String(req.params.projectId),
        violationId: String(req.params.violationId),
        reason: String(req.body?.reason || ''),
        userId: String(req.user!._id),
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof OverrideValidationError) {
        return res.status(err.statusCode).json({ success: false, error: err.message });
      }
      console.error('Override violation error:', err);
      res.status(500).json({ success: false, error: 'Failed to override violation' });
    }
  },
);
```

Hinweis: Audit läuft hier bewusst über `createAuditEntry` im Service (nicht `audit()`-Middleware), weil der Eintrag die violation-Felder braucht, die erst der Service lädt.

- [ ] **Step 4: Run — PASS · Step 5: Commit** (`feat(compliance): soft-override with mandatory reason + audit trail (THE-204)`)

### Task 17: Audit-Export (CSV/JSON)

**Files:**
- Modify: `packages/server/src/routes/governance.routes.ts`
- Test: `packages/server/src/__tests__/audit-export.test.ts` (Create — Service-Level)

- [ ] **Step 1: Failing Test** — `packages/server/src/services/audit-export.service.ts`: `exportAuditLog(projectId, {action?, format})` liefert `{ contentType, body, filename }` (filename: `audit-log-${projectId}-${yyyymmdd}.${format}`); CSV: Header `timestamp,userId,action,entityType,entityId,riskLevel,detail` + RFC-4180-Quoting (Kommas/Quotes in reason!); JSON: Array der Log-Objekte. Test: 2 Einträge einfügen (einer mit Komma+Anführungszeichen in `after.reason`) → CSV hat 3 Zeilen, Quoting korrekt, `detail`-Spalte enthält `JSON.stringify(after)`.

- [ ] **Step 2: Run — FAIL · Step 3: Implementieren** (Service ~40 Zeilen: `AuditLog.find(filter).sort({timestamp:-1}).limit(10000).lean()`; CSV-Escaper `const q = (s:string) => '"' + s.replace(/"/g, '""') + '"'`). Route:

```typescript
// Export audit log as CSV or JSON (REQ-003.4 AC-5)
router.get(
  '/:projectId/audit-log/export',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const format = req.query.format === 'csv' ? 'csv' : 'json';
      const { contentType, body, filename } = await exportAuditLog(String(req.params.projectId), {
        action: req.query.action as string | undefined,
        format,
      });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(body);
    } catch (err) {
      console.error('Audit export error:', err);
      res.status(500).json({ success: false, error: 'Failed to export audit log' });
    }
  },
);
```

**DSGVO-AC (präzisiert):** Export enthält `userId` (ObjectId), KEINE Klarnamen (kein populate) — Anonymisierung = bestehender User-Lifecycle, Audit-Trail bleibt vollständig. Als Kommentar an der Route dokumentieren.

- [ ] **Step 4: Run — PASS · Step 5: Commit** (`feat(compliance): audit log export csv/json (THE-204)`)

### Task 18: Client — OverrideDialog + Dashboard-Wiring

**Files:**
- Create: `packages/client/src/components/governance/OverrideDialog.tsx`
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`
- Modify: `packages/client/src/stores/complianceStore.ts` (`overrideViolation`-Action + api-Client-Methode in `services/api.ts`)

- [ ] **Step 1: Store-Action + api** — `governanceAPI.overrideViolation(projectId, violationId, reason)` (POST); Store-Action ruft sie, bei Erfolg `loadViolations(projectId)` (Refresh). Fehler 422/403/409 → `error`-State mit Server-Message.

- [ ] **Step 2: OverrideDialog** — Textarea mit Live-Zähler `{reason.length}/50 min`, Submit disabled bis ≥50; zeigt Violation-Kontext (message, policy, severity). Öffnet aus ComplianceDashboard-Zeilen: Override-Button NUR bei `enforcementLevel === 'soft_mandatory' && status === 'open'` (REQ-003.3 AC-4).

- [ ] **Step 3: Suppressed-Anzeige** — `loadViolations` hardcodet heute `status: 'open'` → Signatur erweitern: `loadViolations(projectId, status: 'open' | 'suppressed' = 'open')`; die Count-/Detail-Maps werden NUR aus open-Violations gebaut (3D-Dots dürfen suppressed nicht zählen), die Dashboard-Liste rendert den jeweils geladenen Status. Dashboard-Filter bekommt Status-Toggle (open/suppressed); suppressed Zeilen zeigen `overrideReason` als Tooltip + „Overridden"-Badge (grau).

- [ ] **Step 4: Build + Sichtprüfung · Step 5: Commit** (`feat(compliance): override dialog + suppressed view (THE-204)`)

### Task 19: Chunk-Abschluss THE-204

- [ ] **Step 1: Suite grün** — Run: `npm test --workspace=@thearchitect/server && npm test --workspace=@thearchitect/client` · Expected: PASS
- [ ] **Step 2: Linear THE-204 → Done** (Kommentar mit Datei-Liste; DSGVO-AC-Präzisierung „Export nutzt IDs statt Klarnamen" erwähnen)

---

## Chunk 5: REQ-003.6 Severity-Cutoff + Override-Telemetrie (THE-206)

### Task 20: Governance-Settings am Projekt

**Files:**
- Modify: `packages/server/src/models/Project.ts` (settings-Block, ~Zeile 33-48 Interface + ~106-121 Schema)
- Test: bestehende Project-Tests erweitern falls vorhanden, sonst Assertion im Gate-Test (Task 21)

- [ ] **Step 1: Schema erweitern**

```typescript
    settings: {
      // ...bestehend: defaultLayer, gridSize, criticality...
      governance: {
        // REQ-003.6: Severities >= cutoff dürfen enforcen; darunter wird
        // die effektive Stufe auf advisory gedämpft (reversibel — Policies
        // behalten ihr konfiguriertes enforcementLevel).
        enforcementCutoff: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical'],
          default: 'high',
        },
      },
    },
```

Interface analog: `governance?: { enforcementCutoff: ViolationSeverity }`.

- [ ] **Step 2: Dedizierten Governance-PATCH anlegen** — Die Datei heißt `packages/server/src/routes/project.routes.ts` (SINGULAR — verifiziert). Deren generisches Update (Zeile ~158-163: `update.settings = settings`) **ersetzt das komplette settings-Objekt** — ein governance-only-Payload würde `criticality`-Gewichte und `defaultLayer` plattmachen. Deshalb NICHT den generischen Pfad nutzen, sondern dedizierte Route:

```typescript
// PATCH /:projectId/settings/governance (REQ-003.6 AC-3) — gezieltes $set,
// klobbert die übrigen settings NICHT (im Gegensatz zum generischen Update).
router.patch('/:projectId/settings/governance', authenticate, requireProjectAccess('editor'), async (req, res) => {
  const cutoff = req.body?.enforcementCutoff;
  if (!['low', 'medium', 'high', 'critical'].includes(cutoff)) {
    return res.status(400).json({ success: false, error: 'enforcementCutoff must be low|medium|high|critical' });
  }
  const project = await Project.findByIdAndUpdate(
    req.params.projectId,
    { $set: { 'settings.governance.enforcementCutoff': cutoff } },
    { new: true },
  ).select('settings');
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
  res.json({ success: true, data: project.settings });
});
```

(Middleware-Namen an die real in `project.routes.ts` verwendeten anpassen — beim Einbau prüfen.)

### Task 21: Cutoff-Dämpfung im Gate + asynchronem Pfad

**Files:**
- Modify: `packages/server/src/services/enforcement-gate.service.ts` (`getEffectiveEnforcementLevel`)
- Modify: `packages/server/src/routes/architecture.routes.ts` (Settings an Gate durchreichen)
- Test: `enforcement-gate.test.ts` erweitern

- [ ] **Step 1: Failing Tests**

```typescript
describe('getEffectiveEnforcementLevel with cutoff (THE-206)', () => {
  it('dampens below-cutoff policies to advisory', () => {
    const soft = { enforcementLevel: 'soft_mandatory' as const, severity: 'medium' };
    expect(getEffectiveEnforcementLevel(soft, { enforcementCutoff: 'high' })).toBe('advisory');
    expect(getEffectiveEnforcementLevel(soft, { enforcementCutoff: 'medium' })).toBe('soft_mandatory');
  });
  it('never dampens at-or-above cutoff', () => {
    const hard = { enforcementLevel: 'hard_mandatory' as const, severity: 'critical' };
    expect(getEffectiveEnforcementLevel(hard, { enforcementCutoff: 'high' })).toBe('hard_mandatory');
  });
  it('defaults to cutoff high when settings missing', () => {
    const hard = { enforcementLevel: 'hard_mandatory' as const, severity: 'medium' };
    expect(getEffectiveEnforcementLevel(hard, undefined)).toBe('advisory');
  });
});
```

Plus Gate-Integrationstest: Hard-Policy mit `severity: 'medium'` + Default-Cutoff `high` → `blocked: false`.

- [ ] **Step 2: Implementieren**

```typescript
const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const DEFAULT_CUTOFF = 'high'; // REQ-003.6 AC-1/2: initial nur high/critical enforcen

export function getEffectiveEnforcementLevel(
  policy: { enforcementLevel: EnforcementLevel; severity: string },
  governanceSettings?: { enforcementCutoff?: string },
): EnforcementLevel {
  const cutoff = governanceSettings?.enforcementCutoff || DEFAULT_CUTOFF;
  if ((SEVERITY_RANK[policy.severity] ?? 0) < (SEVERITY_RANK[cutoff] ?? 2)) return 'advisory';
  return policy.enforcementLevel;
}
```

`checkHardMandatoryGate`: Project-Settings laden (`Project.findById(projectId).select('settings.governance').lean()`) statt Parameter-Durchreichung durch die Route — ein Query, gecacht pro Call. Die Mongo-Query auf `enforcementLevel: 'hard_mandatory'` bleibt (Dämpfung filtert danach zusätzlich).
Asynchroner Pfad (`policy-evaluation.service.ts`): `evaluateElementPolicies` und `evaluateAllForPolicy` laden die Settings EINMAL am Funktionsanfang (eigenes `Project.findById(projectId).select('settings.governance').lean()` — Project-Model dort importieren) und schreiben beim Violation-Upsert `enforcementLevel: getEffectiveEnforcementLevel(policy, settings)` — damit zeigt die UI die EFFEKTIVE Stufe (Override-Button-Logik stimmt automatisch).

- [ ] **Step 3: Run — PASS · Step 4: Commit** (`feat(compliance): severity cutoff dampens enforcement (THE-206)`)

### Task 22: Override-Rate-Telemetrie + Admin-Banner + Onboarding-Hint

**Files:**
- Modify: `packages/server/src/routes/governance.routes.ts` (`GET /:projectId/governance/override-stats`)
- Test: `packages/server/src/__tests__/override-stats.test.ts`
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`

- [ ] **Step 1: Failing Test** — `computeOverrideStats(projectId)` (neuer Export in `violation-override.service.ts`): Aggregation über `AuditLog` (action `policy_violation_override`, letzte 30 Tage, gruppiert nach `after.severity`) + `PolicyViolation`-Counts (detectedAt ≥ 30d, je severity, alle Status) → `{ bySeverity: { high: { overrides, violations, rate } }, alert: boolean }`; `alert: true` wenn irgendeine severity `rate > 0.3` UND `violations >= 10` (Mindest-N gegen Rausch-Alarme bei 1/2 Violations).

- [ ] **Step 2: Implementieren** (Mongo-Aggregation `AuditLog.aggregate([{$match}, {$group: {_id: '$after.severity', overrides: {$sum: 1}}}])` + `PolicyViolation.aggregate` analog; join in JS). Route: viewer-Recht, `res.json({success:true, data: stats})`.

- [ ] **Step 3: Client** — ComplianceDashboard lädt Stats; bei `alert`: gelbes Banner „Override rate above 30% for severity X — policies may be too strict (REQ-003.6)". Onboarding-Hint (AC-4): beim ersten Dashboard-Besuch (localStorage-Key `governance-cutoff-hint-v1`) Info-Box „Enforcement starts with high/critical only — adjust in project settings." mit Dismiss.

- [ ] **Step 4: Run — PASS · Step 5: Commit** (`feat(compliance): override-rate telemetry + alert banner (THE-206)`) · **Linear THE-206 → Done** (AC-5 „Warnung an Admin gesendet" = In-App-Banner, kein Mail-Versand — bewusste Scope-Entscheidung, im Issue kommentieren)

---

## Chunk 6: REQ-003.5 Dry-Run-Modus (THE-205)

**Kernidee:** Der non-persisting Evaluator existiert (`checkCompliance`), lügt aber potenziell: er liest `e.metadata`, der persistierende Pfad liest `e.metadataJson`. Konsolidierung = `checkCompliance` und Dry-Run nutzen `loadProjectElements` aus `policy-evaluation.service.ts` (der korrekte Loader mit metadataJson + Skip-Regeln). Danach ist Dry-Run nur noch „gleiche Evaluation, übergebene Kandidaten-Policies, kein Persist".

### Task 23: Eval-Pfad konsolidieren + dryRunPolicies

**Files:**
- Create: `packages/server/src/services/policy-dryrun.service.ts`
- Modify: `packages/server/src/services/policy-evaluation.service.ts` (`loadProjectElements` exportieren)
- Modify: `packages/server/src/services/compliance.service.ts` (`checkCompliance` auf gemeinsamen Loader)
- Test: `packages/server/src/__tests__/policy-dryrun.test.ts`

- [ ] **Step 1: Failing Tests**

```typescript
// packages/server/src/__tests__/policy-dryrun.test.ts
// REQ-003.5: Dry-Run evaluiert ohne Persist, ohne Audit, ohne Score-Impact.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PolicyViolation } from '../models/PolicyViolation';
import { AuditLog } from '../models/AuditLog';
import { dryRunPolicies } from '../services/policy-dryrun.service';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn() }));
const mockRunCypher = jest.requireMock('../config/neo4j').runCypher as jest.Mock;

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

// Neo4j-Record-Mock im Stil von policy-evaluation.test.ts (get(key)-Interface)
function neo4jRecord(fields: Record<string, unknown>) {
  return { get: (k: string) => fields[k] ?? null };
}

const PROJECT_ID = new mongoose.Types.ObjectId().toString();

const candidatePolicy = {
  name: 'Draft: descriptions required',
  severity: 'high' as const,
  enforcementLevel: 'advisory' as const,
  category: 'architecture',
  scope: { domains: [], elementTypes: [], layers: [] },
  rules: [{ field: 'description', operator: 'exists' as const, value: true, message: 'needs description' }],
};

describe('dryRunPolicies (THE-205)', () => {
  it('reports would-be violations without persisting anything', async () => {
    mockRunCypher.mockResolvedValue([
      neo4jRecord({ id: 'el-1', name: 'App', type: 'application_component', layer: 'application', description: '', metadataJson: '{}' }),
      neo4jRecord({ id: 'el-2', name: 'Svc', type: 'application_service', layer: 'application', description: 'has one', metadataJson: '{}' }),
    ]);

    const report = await dryRunPolicies(PROJECT_ID, [candidatePolicy]);

    expect(report.dryRun).toBe(true);
    expect(report.wouldViolate).toHaveLength(1);
    expect(report.wouldViolate[0]).toMatchObject({
      elementId: 'el-1',
      severity: 'high',
      message: 'needs description',
      resourcePath: '/elements/el-1/description',
    });
    expect(report.wouldViolate[0].ruleId).toBeTruthy();
    expect(report.summary).toMatchObject({ elementsEvaluated: 2, policiesEvaluated: 1, violationCount: 1 });

    // KEIN Persist, KEIN Audit (AC-3)
    expect(await PolicyViolation.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('assigns transient ruleIds to candidate rules lacking one', async () => {
    mockRunCypher.mockResolvedValue([]);
    const report = await dryRunPolicies(PROJECT_ID, [candidatePolicy]);
    expect(report.summary.policiesEvaluated).toBe(1);
  });
});
```

- [ ] **Step 2: Run — FAIL · Step 3: Implementieren**

`policy-evaluation.service.ts`: `loadProjectElements` mit `export` versehen (Funktion bleibt identisch).

```typescript
// packages/server/src/services/policy-dryrun.service.ts
// REQ-003.5 (THE-205): Kandidaten-Policies gegen den Live-Bestand evaluieren
// — gleiche Semantik wie der persistierende Pfad (gleicher Loader, gleiche
// Rule-Primitiven), aber: kein PolicyViolation-Write, kein Audit-Eintrag,
// kein Score-Impact. Output ist als Dry-Run markiert (AC-3).
import { randomUUID } from 'crypto';
import { loadProjectElements } from './policy-evaluation.service';
import { evaluateRule, elementMatchesScope, getFieldValue } from './compliance.service';
import { toViolationMessage, ViolationMessage } from './violation-format';
import type { ViolationSeverity, EnforcementLevel } from '@thearchitect/shared';

export interface CandidatePolicy {
  name: string;
  severity: ViolationSeverity;
  enforcementLevel?: EnforcementLevel;
  category?: string;
  scope: { domains: string[]; elementTypes: string[]; layers: string[] };
  rules: Array<{ ruleId?: string; field: string; operator: string; value: unknown; message: string }>;
  effectiveFrom?: Date | string;
  effectiveUntil?: Date | string;
}

export interface DryRunViolation extends ViolationMessage {
  elementId: string;
  elementName: string;
  policyName: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
}

export interface DryRunReport {
  dryRun: true;
  projectId: string;
  timestamp: string;
  wouldViolate: DryRunViolation[];
  summary: { elementsEvaluated: number; policiesEvaluated: number; violationCount: number };
}

export async function dryRunPolicies(projectId: string, candidates: CandidatePolicy[]): Promise<DryRunReport> {
  const elements = await loadProjectElements(projectId);
  const wouldViolate: DryRunViolation[] = [];

  for (const policy of candidates) {
    const rules = policy.rules.map((r) => ({ ...r, ruleId: r.ruleId || `r-dryrun-${randomUUID()}` }));
    const matching = elements.filter((el) => elementMatchesScope(el, policy as never));

    for (const el of matching) {
      for (const rule of rules) {
        const fieldValue = getFieldValue(el as unknown as Record<string, unknown>, rule.field);
        if (!evaluateRule(fieldValue, rule.operator, rule.value)) {
          wouldViolate.push({
            ...toViolationMessage({
              ruleId: rule.ruleId,
              severity: policy.severity,
              enforcementLevel: policy.enforcementLevel || 'advisory',
              message: rule.message,
              elementId: el.id,
              field: rule.field,
            }),
            elementId: el.id,
            elementName: el.name,
            policyName: policy.name,
            field: rule.field,
            currentValue: fieldValue,
            expectedValue: rule.value,
          });
        }
      }
    }
  }

  return {
    dryRun: true,
    projectId,
    timestamp: new Date().toISOString(),
    wouldViolate,
    summary: {
      elementsEvaluated: elements.length,
      policiesEvaluated: candidates.length,
      violationCount: wouldViolate.length,
    },
  };
}
```

`checkCompliance`-Konsolidierung (`compliance.service.ts:37-57`): den eigenen Cypher-Block + Element-Mapping ERSETZEN durch `const elements = await loadProjectElements(projectId);` (Import). **Zirkularitäts-Check:** `policy-evaluation.service.ts` importiert aus `compliance.service.ts` — der Rück-Import würde einen Zyklus schaffen. Lösung: `loadProjectElements` (+ `loadElement`, Task 13) in NEUE Datei `packages/server/src/services/element-loader.service.ts` verschieben; `policy-evaluation.service.ts`, `compliance.service.ts` und `enforcement-gate.service.ts` importieren von dort. (Reiner Move, keine Logik-Änderung — bestehende Tests decken das Verhalten.)

- [ ] **Step 4: Run — PASS** (`--testPathPattern=policy-dryrun`, danach volle Suite: der checkCompliance-Umbau darf `governance-routes`/`complianceFacts`-Tests nicht brechen; falls deren Mocks auf den alten Cypher-Query matchen, Mocks auf `element-loader` umstellen)

- [ ] **Step 5: Commit** (`feat(compliance): dry-run evaluation + unified element loader (THE-205)`)

### Task 24: Dry-Run-Route + Draft-Preview im Client

**Files:**
- Modify: `packages/server/src/routes/governance.routes.ts`
- Modify: `packages/client/src/components/governance/PolicyDraftReview.tsx`
- Modify: `packages/client/src/components/governance/PolicyManager.tsx` (Promotion-Hint)

- [ ] **Step 1: Route**

```typescript
// Dry-run candidate policies against live elements (REQ-003.5)
router.post(
  '/:projectId/policies/dry-run',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const candidates = req.body?.policies;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ success: false, error: 'policies array required' });
      }
      const report = await dryRunPolicies(String(req.params.projectId), candidates);
      res.json({ success: true, data: report });
    } catch (err) {
      console.error('Dry-run error:', err);
      res.status(500).json({ success: false, error: 'Dry-run failed' });
    }
  },
);
```

Bewusst KEINE `audit()`-Middleware (AC-3: kein Audit-Eintrag). JSON-Export (AC-4) = Response selbst; Client bekommt Download-Button.

- [ ] **Step 2: PolicyDraftReview** — pro Draft-Card Button „Preview violations": POST dry-run mit `[draft]` → Inline-Ergebnis `would create N violations` + aufklappbare Liste (elementName, message, severity-Badge); Download-Icon speichert den Report als JSON (`Blob` + `URL.createObjectURL`, Dateiname `dryrun-${draft.name}.json`). Toggle „Dry Run" im PolicyManager-Create-Formular (AC-1): statt „Create" → „Preview only" ruft dieselbe Route mit dem Formular-Stand.

- [ ] **Step 3: Promotion-Hint (AC-5)** — statischer Hinweis im PolicyManager-Formular unter dem enforcementLevel-Select: „Maturity path: Dry-Run → advisory (log only) → soft/hard mandatory (enforce)."

- [ ] **Step 4: Build + Sichtprüfung im dev-Server · Step 5: Commit** (`feat(compliance): dry-run route + draft violation preview (THE-205)`) · **Linear THE-205 → Done**

---

## Chunk 7: REQ-003.1 Performance p95 < 2s + CI-Gate (THE-201)

**Messpunkte (Pre-Flight-Präzisierung):** (a) asynchroner Pfad: `evaluateElementPolicies`-Latenz (Server-Anteil des 2s-Budgets; Client-Debounce 1000ms + Refetch kommen obendrauf — Server-Budget deshalb ≤ 800ms p95); (b) synchroner Hard-Gate-Pfad: `checkHardMandatoryGate` ≤ 300ms p95 (sitzt in JEDEM Element-Write).

### Task 25: Perf-Test (jest, deterministisch)

**Files:**
- Create: `packages/server/src/__tests__/policy-perf.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// packages/server/src/__tests__/policy-perf.test.ts
// REQ-003.1: Perf-Gate — 50 Elemente × 100 Policies (Memory-DB, Neo4j gemockt).
// Misst die SERVER-Anteile der Budgets: async eval ≤ 800ms p95 (2s-Gesamt-
// Budget minus 1s Client-Debounce minus Netz/Refetch), hard gate ≤ 300ms p95.
// Läuft im normalen jest-Lauf → jeder CI-/Lokal-Testlauf ist das Quality-Gate.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Policy } from '../models/Policy';
import { PolicyViolation } from '../models/PolicyViolation';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn() }));
jest.mock('../websocket/socketServer', () => ({
  getIO: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }),
}));
jest.mock('../services/policy-graph.service', () => ({
  syncViolationToNeo4j: jest.fn().mockResolvedValue(undefined),
  removeViolationFromNeo4j: jest.fn().mockResolvedValue(undefined),
}));
const mockRunCypher = jest.requireMock('../config/neo4j').runCypher as jest.Mock;

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const PROJECT_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

function neo4jRecord(fields: Record<string, unknown>) {
  return { get: (k: string) => fields[k] ?? null };
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

describe('policy evaluation performance (THE-201)', () => {
  beforeAll(async () => {
    // 100 Policies à 2 Rules — Hälfte hard_mandatory für den Gate-Test
    const policies = Array.from({ length: 100 }, (_, i) => ({
      projectId: PROJECT_ID,
      name: `Perf Policy ${i}`,
      category: 'architecture',
      severity: (['low', 'medium', 'high', 'critical'] as const)[i % 4],
      enforcementLevel: i % 2 === 0 ? 'hard_mandatory' : 'advisory',
      enabled: true, status: 'active', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [
        { field: 'description', operator: 'exists', value: true, message: `needs desc ${i}` },
        { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: `no crit ${i}` },
      ],
      createdBy: USER_ID, version: 1,
    }));
    await Policy.insertMany(policies);
  }, 30000);

  it('async per-element evaluation stays under 800ms p95 (20 runs)', async () => {
    const { evaluateElementPolicies } = await import('../services/policy-evaluation.service');
    mockRunCypher.mockResolvedValue([
      neo4jRecord({ id: 'el-perf', name: 'X', type: 'node', layer: 'technology', description: '', riskLevel: 'critical', metadataJson: '{}' }),
    ]);

    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      await evaluateElementPolicies(PROJECT_ID.toString(), 'el-perf', 'update');
      samples.push(performance.now() - t0);
    }
    expect(p95(samples)).toBeLessThan(800);
  }, 60000);

  it('hard-mandatory gate stays under 300ms p95 (20 runs, 50 hard policies)', async () => {
    const { checkHardMandatoryGate } = await import('../services/enforcement-gate.service');
    const candidate = {
      id: 'el-gate', name: 'X', type: 'node', layer: 'technology',
      riskLevel: 'critical', description: '', metadata: {},
    };
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      await checkHardMandatoryGate(PROJECT_ID.toString(), candidate);
      samples.push(performance.now() - t0);
    }
    expect(p95(samples)).toBeLessThan(300);
  }, 60000);

  afterAll(async () => { await Policy.deleteMany({}); await PolicyViolation.deleteMany({}); });
});
```

- [ ] **Step 2: Run — Ergebnis interpretieren**

Run: `npm test --workspace=@thearchitect/server -- --testPathPattern=policy-perf`
Expected: PASS auf dem Mac. FAILT der async-Test: die 200 sequenziellen Upserts pro Run sind der Treiber → dann Optimierung in `evaluateElementPolicies`: Upserts über `PolicyViolation.bulkWrite([...])` bündeln statt N × `findOneAndUpdate` (Verhalten identisch, ein Roundtrip; bestehende policy-evaluation-Tests müssen grün bleiben). NICHT vorab optimieren — erst messen (YAGNI).

- [ ] **Step 3: Commit** (`test(compliance): perf gate p95 async 800ms / gate 300ms (THE-201)`)

### Task 26: Loading-State > 500ms (Client)

**Files:**
- Modify: `packages/client/src/stores/complianceStore.ts`
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`

- [ ] **Step 1:** `loadViolations` setzt `isLoadingViolations` bereits — Anzeige-Regel (AC-4: sichtbar erst >500ms, kein Flackern): kleines Hook `useDelayedFlag(isLoadingViolations, 500)` (setTimeout, cleanup) in `ComplianceDashboard.tsx` + dezenter Spinner „Validating…" im Header. Gleicher Spinner im 3D-HUD ist NICHT nötig (Violations aktualisieren dots passiv).

- [ ] **Step 2: Build + Sichtprüfung · Commit** (`feat(compliance): delayed validation loading indicator (THE-201)`)

### Task 27: CI-Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow anlegen**

```yaml
# CI: build shared → server tests (inkl. Perf-Gate policy-perf.test.ts).
# ACHTUNG: GitHub-Actions-Account ist derzeit geflaggt (siehe CLAUDE.md) —
# der Workflow ist vorbereitet; bis zur Freischaltung ist der lokale
# jest-Lauf das verbindliche Gate (Perf-Test läuft in JEDEM npm test).
name: ci
on:
  pull_request:
  push:
    branches: [master]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build --workspace=@thearchitect/shared
      - run: npm test --workspace=@thearchitect/server
      - run: npm test --workspace=@thearchitect/client
```

- [ ] **Step 2: Commit** (`ci: test workflow with perf gate (THE-201)`) · **Linear THE-201 → Done** (AC-2/AC-3 mit Einschränkung „Actions geflaggt — lokaler jest-Lauf ist das Gate" im Issue kommentieren; AC-5 incremental: bereits erfüllt durch Per-Element-Architektur, verifiziert durch bestehenden Test `writes ruleId...` der nur EIN Element evaluiert)

---

## Abschluss

### Task 28: End-to-End-Verifikation + PR

- [ ] **Step 1: Volle Suite + Builds**

Run: `npm run build --workspace=@thearchitect/shared && npm run build --workspace=@thearchitect/server && npm run build --workspace=@thearchitect/client && npm test --workspace=@thearchitect/server && npm test --workspace=@thearchitect/client && npm run lint`
Expected: alles PASS. (Vorbestehende Lint-Baustellen sind dokumentiert — nur KEINE NEUEN Fehler einführen.)

- [ ] **Step 2: In-Browser E2E (dev-Server, Mac)** — Drehbuch:
  1. Policy „Descriptions required" anlegen: severity high, enforcement hard_mandatory → Element ohne Description anlegen → **422-Block-Dialog** erscheint, Element nicht im 3D.
  2. Policy auf soft_mandatory ändern → Element anlegen klappt, Violation erscheint ≤2s als roter Dot → ComplianceDashboard: Override-Button → Dialog, 30 Zeichen → disabled, 60 Zeichen → Submit → Badge „Overridden", Audit-Log-Export CSV enthält `policy_violation_override`-Zeile.
  3. Policy severity auf medium ändern (Cutoff high) → Element-Edit blockt NICHT mehr (Dämpfung), Dashboard zeigt advisory.
  4. PolicyDraftReview: Draft generieren → „Preview violations" → Zahl plausibel, JSON-Download funktioniert, keine neuen PolicyViolations in Mongo (`db.policyviolations.countDocuments()` vorher/nachher gleich).
  5. Migration: `npm run migrate:severity` gegen die lokale DB → Log zeigt Counts, zweiter Lauf zeigt 0.

- [ ] **Step 3: RVTM §9 „Plan-Traceability" ANLEGEN** (die Pre-Flight-RVTM endet bei §8) — jede REQ → Tasks → Verifikations-Evidenz. THE-190 Parent → Done erst NACH Review-Merge.

- [ ] **Step 4: PR**

```bash
git push -u origin mganzmanninfo/the-190-uc-choice-003-real-time-compliance-linting-editor
gh pr create --title "feat(compliance): real-time compliance linting — enforcement, override, dry-run (THE-190)" --body "..."
```

PR-Body: Chunk-Zusammenfassung, Migrations-Hinweis (VPS: `npm run migrate:severity` einmalig im Server-Container VOR Traffic), Scope-Note (Sandbox deskopiert), Test-Evidenz.

### Risiken & Wachhunde (aus Pre-Flight)

1. **severity-Migration zuerst, komplett, einmalig** — Chunk 1 MUSS gemerged/deployt sein, bevor Chunks 2-7 Daten schreiben. Auf dem VPS: Migration VOR dem neuen Code-Rollout laufen zu lassen geht nicht (Script ist im neuen Image) → Reihenfolge: Deploy → sofort `migrate:severity` → erst dann UI benutzen. Kurzes Wartungsfenster einplanen. **Bekannter Boot-Effekt:** Zwischen Container-Start und Migrationslauf versucht Mongoose den neuen Unique-Index `(policyId,elementId,ruleId)` zu bauen und schlägt fehl, weil alle Alt-Violations `ruleId: null` haben (Duplikate) — noisy Log + kurzes Fenster ohne Unique-Schutz, heilt sich mit dem Migrationslauf (der droppt/baut die Indexe explizit). Kein Datenverlust; im Deploy-Log nicht erschrecken.
2. **Nur Hard-Policies im Request-Pfad** — jede Erweiterung des Gates auf soft/advisory ist ein Latenz-Regressions-Risiko; `getEffectiveEnforcementLevel` ist der einzige legitime Erweiterungspunkt.
3. **Score-Regression** — `computeComplianceScore`-Test ist das Wachhund-Artefakt; bei Gewichts-Änderungen schlägt er an.
4. **Kein zweiter Eval-Pfad** — nach Task 23 gibt es genau EINEN Element-Loader (`element-loader.service.ts`). Wer einen neuen Cypher-Element-Read für Evaluation schreibt, macht einen Fehler.
5. **LLM-Draft-Pipeline** emittiert severity — nach Domain-Wechsel Prompt-Beispiele zwingend mitziehen (Task 6), sonst produziert die Generierung Enum-Fehler.


