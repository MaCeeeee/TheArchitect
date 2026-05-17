# UC-CHOICE-001 Pre-Validated Pattern Library — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foundation-Service für eine Pattern-Library mit Compliance/Cost/Risk/Lifecycle-Metadaten, die als Datenquelle für 5 weitere UCs (CHOICE-002/003/004/006/007) dient.

**Architecture:** Mongoose `DecisionPattern` Model + REST `/api/decision-patterns` + React-Browse-UI mit Cards. Adoption-Telemetrie als separate `patternAdoptions` Collection mit Compound-Index für CHOICE-007 Stats-Queries.

**Tech Stack:** Express/TypeScript, Mongoose, React 18 + Vite, Tailwind, vitest/jest.

**Linear-Parent:** [THE-189](https://linear.app/thearchitect/issue/THE-189) — UC-CHOICE-001
**Linear-REQs:** THE-196, THE-197, THE-198, THE-199, THE-200

---

## WSJF-Scoring (8 Kriterien: BV·BR·IC·CoS·Compliance·Rel·Urg)

| REQ | Titel | Sum/35 | WSJF | Slice |
|---|---|---|---|---|
| REQ-CHOICE-001.1 | 3-5 vorgeprüfte Optionen | 26 | **74.3** | Slice 1 |
| REQ-CHOICE-001.4 | Adoption-Telemetrie persistieren | 26 | **74.3** | Slice 2 |
| REQ-CHOICE-001.2 | Compliance/Cost/Risk/Lifecycle | 23 | **65.7** | Slice 1 (zusammen mit 001.1) |
| REQ-CHOICE-001.5 | "Why this?"-Affordance | 18 | **51.4** | Slice 3 |
| REQ-CHOICE-001.3 | Versionierung mit Successor | 14 | **40.0** | Sprint 4 (verschoben) |

**Sprint-3-Scope:** REQ-001.1 + 001.2 + 001.4 + 001.5 (4 von 5 REQs).
**Sprint-4-Scope:** REQ-001.3 (Versionierung, nicht zeitkritisch).

---

## Naming-Convention

- **`DecisionPattern`** (NEU) = Pre-Validated Architecture-Decision-Patterns (Microservice-Queue, OAuth-Provider, Event-Streaming, …)
- **`ModelingPattern`/`PatternTemplate`** (EXISTIERT) = ArchiMate-Mini-Strukturen für Canvas-Insert (siehe `pattern-templates.ts`)

Keine Namens-Kollision: existierende Codebase nutzt `PatternTemplate`/`PatternCatalog`/`SavePatternDialog` für ArchiMate-Modeling. Neuer Code nutzt `DecisionPattern`/`DecisionPatternLibrary`/`PatternCard`.

---

## File Structure

**Server:**
- Create: `packages/server/src/models/DecisionPattern.ts`
- Create: `packages/server/src/models/PatternAdoption.ts`
- Create: `packages/server/src/routes/decisionPatterns.routes.ts`
- Create: `packages/server/src/seeds/decision-patterns.seed.ts`
- Modify: `packages/server/src/index.ts` (route-mount)
- Create: `packages/server/src/routes/__tests__/decisionPatterns.routes.test.ts`

**Shared:**
- Create: `packages/shared/src/types/decision-pattern.types.ts`

**Client:**
- Create: `packages/client/src/components/patterns/DecisionPatternLibrary.tsx` (Modal mit Browse-UI)
- Create: `packages/client/src/components/patterns/PatternCard.tsx`
- Create: `packages/client/src/hooks/useDecisionPatterns.ts`
- Create: `packages/client/src/services/decisionPatterns.api.ts`
- Modify: `packages/client/src/components/ui/Toolbar.tsx` (Open-Library-Button)
- Create: `packages/client/src/components/patterns/__tests__/PatternCard.test.tsx`

---

## Chunk 1: Backend Foundation (Slice 1)

### Task 1: Shared Types

**Files:**
- Create: `packages/shared/src/types/decision-pattern.types.ts`

- [ ] **Step 1: Define types**

```ts
export type LifecycleStatus =
  | 'approved'
  | 'conditional'
  | 'investigate'
  | 'retiring'
  | 'unapproved';

export type RiskLevel = 'low' | 'medium' | 'high';
export type CostRange = '€' | '€€' | '€€€';
export type PatternCategory =
  | 'integration'
  | 'data'
  | 'security'
  | 'observability'
  | 'compute'
  | 'messaging';

export interface DecisionPatternComplianceScore {
  togaf?: number; // 0-100
  dora?: number;  // 0-100
  nis2?: number;  // 0-100
}

export interface DecisionPattern {
  id: string;
  slug: string;            // url-safe identifier
  name: string;
  description: string;
  category: PatternCategory;
  decisionContext: string; // "When you need a managed queue ..."
  complianceScore: DecisionPatternComplianceScore;
  costRange: CostRange;
  riskLevel: RiskLevel;
  lifecycleStatus: LifecycleStatus;
  whyThis: string;         // detector-style explanation
  detectorRefs: string[];  // referenced AI-Advisor detector IDs
  tags: string[];
  version: string;         // semver, default '1.0.0'
  deprecatedAt: string | null;
  successorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatternAdoptionEvent {
  patternId: string;
  projectId: string;
  userId: string;
  version: string;
  timestamp: string;
}
```

- [ ] **Step 2: Export from shared index**

```ts
// packages/shared/src/index.ts (append)
export * from './types/decision-pattern.types';
```

- [ ] **Step 3: Build shared package**

Run: `npm run build --workspace=@thearchitect/shared`
Expected: `dist/index.d.ts` includes new types.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/decision-pattern.types.ts packages/shared/src/index.ts
git commit -m "feat(shared): REQ-CHOICE-001 DecisionPattern types + adoption event"
```

### Task 2: Mongoose Models

**Files:**
- Create: `packages/server/src/models/DecisionPattern.ts`
- Create: `packages/server/src/models/PatternAdoption.ts`

- [ ] **Step 1: DecisionPattern model**

```ts
import { Schema, model } from 'mongoose';

const DecisionPatternSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: ['integration', 'data', 'security', 'observability', 'compute', 'messaging'],
    required: true,
    index: true,
  },
  decisionContext: { type: String, required: true },
  complianceScore: {
    togaf: { type: Number, min: 0, max: 100 },
    dora: { type: Number, min: 0, max: 100 },
    nis2: { type: Number, min: 0, max: 100 },
  },
  costRange: { type: String, enum: ['€', '€€', '€€€'], required: true },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
  lifecycleStatus: {
    type: String,
    enum: ['approved', 'conditional', 'investigate', 'retiring', 'unapproved'],
    required: true,
    index: true,
  },
  whyThis: { type: String, required: true },
  detectorRefs: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  version: { type: String, default: '1.0.0' },
  deprecatedAt: { type: Date, default: null },
  successorId: { type: Schema.Types.ObjectId, ref: 'DecisionPattern', default: null },
}, { timestamps: true });

export const DecisionPatternModel = model('DecisionPattern', DecisionPatternSchema);
```

- [ ] **Step 2: PatternAdoption model**

```ts
import { Schema, model } from 'mongoose';

const PatternAdoptionSchema = new Schema({
  patternId: { type: Schema.Types.ObjectId, ref: 'DecisionPattern', required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

PatternAdoptionSchema.index({ patternId: 1, projectId: 1 });
PatternAdoptionSchema.index({ patternId: 1, timestamp: -1 });

export const PatternAdoptionModel = model('PatternAdoption', PatternAdoptionSchema);
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/models/DecisionPattern.ts packages/server/src/models/PatternAdoption.ts
git commit -m "feat(server): REQ-CHOICE-001 DecisionPattern + PatternAdoption Mongoose models"
```

### Task 3: Seed-Data (6 DACH-relevant Patterns)

**Files:**
- Create: `packages/server/src/seeds/decision-patterns.seed.ts`

- [ ] **Step 1: Seed function with 6 patterns**

Categories to cover: messaging, security, observability, integration, compute, data.

```ts
import { DecisionPatternModel } from '../models/DecisionPattern';

const SEED_PATTERNS = [
  {
    slug: 'managed-message-queue',
    name: 'Managed Message Queue',
    description: 'Use a managed cloud queue (SQS/RabbitMQ-Cloud) instead of self-hosted.',
    category: 'messaging',
    decisionContext: 'You need async processing with at-least-once delivery and < 100k msgs/sec.',
    complianceScore: { togaf: 85, dora: 90, nis2: 80 },
    costRange: '€€',
    riskLevel: 'low',
    lifecycleStatus: 'approved',
    whyThis: 'Reduces operational burden, complies with DORA outage-resilience requirements.',
    detectorRefs: ['async-processing', 'resilience-required'],
    tags: ['queue', 'async', 'managed'],
  },
  // ... 5 more (oauth-provider, otel-stack, api-gateway, postgres-managed, k8s-managed)
];

export async function seedDecisionPatterns() {
  for (const p of SEED_PATTERNS) {
    await DecisionPatternModel.updateOne(
      { slug: p.slug },
      { $setOnInsert: p },
      { upsert: true }
    );
  }
}
```

- [ ] **Step 2: Test seed runs idempotently**

```bash
node -e "require('./packages/server/dist/seeds/decision-patterns.seed').seedDecisionPatterns()"
```

Expected: 6 documents in collection, re-running doesn't duplicate.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/seeds/decision-patterns.seed.ts
git commit -m "feat(server): REQ-CHOICE-001 seed 6 DACH-relevant decision patterns"
```

### Task 4: GET Endpoint

**Files:**
- Create: `packages/server/src/routes/decisionPatterns.routes.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Route file**

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { DecisionPatternModel } from '../models/DecisionPattern';

const router = Router();

router.get('/', authenticate, async (req, res) => {
  const { category, lifecycleStatus } = req.query;
  const filter: any = {};
  if (category) filter.category = category;
  if (lifecycleStatus) filter.lifecycleStatus = lifecycleStatus;
  const patterns = await DecisionPatternModel
    .find(filter)
    .sort({ name: 1 })
    .lean();
  res.json({ patterns });
});

router.get('/:slug', authenticate, async (req, res) => {
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug }).lean();
  if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
  res.json(pattern);
});

export { router as decisionPatternsRouter };
```

- [ ] **Step 2: Mount in index.ts**

```ts
import { decisionPatternsRouter } from './routes/decisionPatterns.routes';
// ...
app.use('/api/decision-patterns', decisionPatternsRouter);
```

- [ ] **Step 3: Run seed in dev startup** (idempotent)

Add to existing server-startup-hook or `seedAll.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/decisionPatterns.routes.ts packages/server/src/index.ts
git commit -m "feat(server): REQ-CHOICE-001 GET /api/decision-patterns endpoint"
```

### Task 5: Supertest

**Files:**
- Create: `packages/server/src/routes/__tests__/decisionPatterns.routes.test.ts`

- [ ] **Step 1: 4 tests**
  - GET / returns array
  - GET / filters by category
  - GET / filters by lifecycleStatus
  - GET /:slug returns single pattern or 404

- [ ] **Step 2: Run + commit**

```bash
npx jest packages/server/src/routes/__tests__/decisionPatterns.routes.test.ts
git commit -m "test(server): REQ-CHOICE-001 4 supertests for decision-patterns endpoint"
```

## Chunk 2: Frontend Browse-UI (Slice 1 cont.)

### Task 6: API-Service + Hook

**Files:**
- Create: `packages/client/src/services/decisionPatterns.api.ts`
- Create: `packages/client/src/hooks/useDecisionPatterns.ts`

- [ ] **Step 1: API wrapper using authFetch**

```ts
import { authFetch } from './authFetch';
import type { DecisionPattern } from '@thearchitect/shared';

export async function fetchDecisionPatterns(
  filter?: { category?: string; lifecycleStatus?: string }
): Promise<DecisionPattern[]> {
  const params = new URLSearchParams();
  if (filter?.category) params.set('category', filter.category);
  if (filter?.lifecycleStatus) params.set('lifecycleStatus', filter.lifecycleStatus);
  const r = await authFetch(`/api/decision-patterns?${params}`);
  if (!r.ok) throw new Error(`Fetch patterns failed: ${r.status}`);
  const data = await r.json();
  return data.patterns;
}
```

- [ ] **Step 2: useDecisionPatterns hook**

```ts
import { useEffect, useState } from 'react';
import type { DecisionPattern } from '@thearchitect/shared';
import { fetchDecisionPatterns } from '../services/decisionPatterns.api';

export function useDecisionPatterns(filter?: { category?: string }) {
  const [patterns, setPatterns] = useState<DecisionPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchDecisionPatterns(filter)
      .then(setPatterns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter?.category]);

  return { patterns, loading, error };
}
```

- [ ] **Step 3: Commit**

### Task 7: PatternCard Component

**Files:**
- Create: `packages/client/src/components/patterns/PatternCard.tsx`

- [ ] **Step 1: Card with Compliance/Cost/Risk/Lifecycle badges**

Visual: name + category-chip, then 4 rows with icons:
- Compliance: 3 mini-bars (TOGAF/DORA/NIS2) or aggregate score
- Cost: € / €€ / €€€ pill
- Risk: low (green) / medium (yellow) / high (red) dot
- Lifecycle: status badge (approved=green / conditional=yellow / investigate=orange / retiring=red / unapproved=gray)

- [ ] **Step 2: Vitest snapshot + 2 functional tests**

- [ ] **Step 3: Commit**

### Task 8: DecisionPatternLibrary Modal

**Files:**
- Create: `packages/client/src/components/patterns/DecisionPatternLibrary.tsx`
- Modify: `packages/client/src/components/ui/Toolbar.tsx`

- [ ] **Step 1: Modal with category-tabs + filter-bar + card-grid**

Show max 5 cards per "choice-set" view (Chernev), with "Show More" affordance if >5.

- [ ] **Step 2: Toolbar-Button (BookOpen icon)**

- [ ] **Step 3: Commit + dev-server-test**

## Chunk 3: Adoption-Telemetrie (Slice 2)

### Task 9: Adopt-Endpoint + Audit

**Files:**
- Modify: `packages/server/src/routes/decisionPatterns.routes.ts`

- [ ] **Step 1: POST /:slug/adopt route**

```ts
router.post('/:slug/adopt', authenticate, async (req, res) => {
  const { projectId } = req.body;
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
  if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
  await PatternAdoptionModel.create({
    patternId: pattern._id,
    projectId,
    userId: req.user!.id,
    version: pattern.version,
  });
  await createAuditEntry({
    userId: req.user!.id,
    projectId,
    action: 'pattern_adopted',
    risk: 'low',
    details: { patternSlug: pattern.slug, version: pattern.version },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ ok: true });
});
```

- [ ] **Step 2: Frontend Apply-Button in PatternCard**

- [ ] **Step 3: Test (supertest + vitest)**

- [ ] **Step 4: Commit**

## Chunk 4: Why-This-Affordance (Slice 3)

### Task 10: Tooltip mit Detector-Begründung

**Files:**
- Modify: `packages/client/src/components/patterns/PatternCard.tsx`

- [ ] **Step 1: Popover-Tooltip mit `whyThis`-Text + `detectorRefs`**

- [ ] **Step 2: Vitest**

- [ ] **Step 3: Commit**

## Chunk 5: Production-Deploy

- [ ] **Step 1: Full test-suite grün** (server + client)
- [ ] **Step 2: rsync zum VPS + docker compose up -d --build**
- [ ] **Step 3: Manual smoke-test gegen https://thearchitect.site**
- [ ] **Step 4: Linear: alle REQs auf Done, Parent auf Done**
- [ ] **Step 5: Daily-Note + Memory-Update + Obsidian-Feature-Doku**

---

## Remember
- DRY/YAGNI/TDD/frequent commits
- Pre-Flight ✅ erledigt (Linear-IDs vorhanden, Codebase scanned, kein Konflikt)
- 4 von 5 REQs Sprint-3, REQ-001.3 (Versionierung) → Sprint-4
- Naming-Convention: `DecisionPattern` ≠ existing `ModelingPattern`
