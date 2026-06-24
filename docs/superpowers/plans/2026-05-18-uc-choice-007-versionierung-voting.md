# UC-CHOICE-001.3 + UC-CHOICE-007 — Combined Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selbst-heilender Pattern-Katalog mit (a) Versionierung + Deprecation-Migration und (b) sozialem Beweis durch Adoption-Telemetrie + Voting.

**Architecture:** Erweitert die bestehende UC-CHOICE-001 Foundation (Mongoose-Schema mit `version`/`deprecatedAt`/`successorId` ist schon da, Stats-Endpoint liefert schon `totalUses/last30Days/uniqueProjects`). Wir ergänzen: Endorsement-Collection, Badge-Computation-Service, Lifecycle-Mutation-Endpoint, Deprecated-Banner-UI, Architect-Vote-UI.

**Tech Stack:** Express/TypeScript, Mongoose, React 18, Tailwind, vitest/jest.

**Linear-Parents:** [THE-198](https://linear.app/thearchitect/issue/THE-198) (Versionierung) + [THE-191](https://linear.app/thearchitect/issue/THE-191) (UC-CHOICE-007)

**Linear-REQs:**
- THE-198 = REQ-CHOICE-001.3 (Versionierung mit Successor)
- THE-207 = REQ-CHOICE-007.1 (Adoption-Counts) — **Backend schon LIVE, nur Frontend fehlt**
- THE-208 = REQ-CHOICE-007.2 (Auto-Badges)
- THE-261 = REQ-CHOICE-007.3 (Architect-Endorsement) — neu angelegt
- THE-262 = REQ-CHOICE-007.4 (Cold-Start "New"-Badge) — neu angelegt
- THE-263 = REQ-CHOICE-007.5 (Deprecation-Indikator) — neu angelegt

---

## Foundation (schon LIVE seit 2026-05-17)

✅ `DecisionPattern` Model hat `version: '1.0.0'`, `deprecatedAt: Date|null`, `successorId: ObjectId|null`
✅ `PatternAdoption` Collection + Compound-Indexes für Stats-Queries
✅ `GET /api/decision-patterns/:slug/stats` liefert `totalUses / last30Days / uniqueProjects`
✅ `POST /api/decision-patterns/:slug/adopt` mit Audit + Lifecycle-Gate
✅ Frontend `PatternCard` + `DecisionPatternLibrary` Modal rendern alle Patterns

→ **Wir bauen "nur" 3 Backend-Mutations + 1 neue Collection + Frontend-Erweiterung. Kein neues Foundation-Work.**

---

## WSJF-Scoring (8 Kriterien: BV·BR·IC·CoS·Compliance·Rel·Urg)

| REQ | Titel | Sum/35 | WSJF | Slice |
|---|---|---|---|---|
| REQ-007.1 | Adoption-Counts FE-Wiring | 24 | **68.6** | Slice 1 (schnell, Foundation für 007.2) |
| REQ-007.2 | Auto-Badges (Most Used / Trending / Architects' Choice) | 28 | **80.0** | Slice 2 (Hauptwert) |
| REQ-007.5 | Deprecation-Banner + Successor-Link | 27 | **77.1** | Slice 3 (Bridge zu 001.3) |
| REQ-001.3 | Lifecycle-Mutation-API (deprecate/successor) | 22 | **62.9** | Slice 3 (paired mit 007.5) |
| REQ-007.3 | Architect-Endorsement + Reason | 24 | **68.6** | Slice 4 |
| REQ-007.4 | Cold-Start "New"-Badge | 18 | **51.4** | Slice 5 (Polish) |

**Sprint-Scope:** ALLE 6 REQs (ca. 7-8h Tag 1 + Deploy Tag 2).

---

## Naming-Convention

- **`PatternEndorsement`** (NEU) = Architect-Vote-Collection (separate von `PatternAdoption`)
- **`PatternBadge`** (NEU) = Computed, nicht persistiert (live aus Stats berechnet)
- **`lifecycle.deprecate`** = Server-Service-Action für Deprecation-Flow

---

## File Structure

**Server (NEU):**
- Create: `packages/server/src/models/PatternEndorsement.ts`
- Create: `packages/server/src/services/patternBadge.service.ts`
- Modify: `packages/server/src/routes/decisionPatterns.routes.ts` (+5 routes)
- Create: `packages/server/src/__tests__/decisionPatterns.lifecycle.test.ts`
- Create: `packages/server/src/__tests__/patternBadge.service.test.ts`

**Shared:**
- Modify: `packages/shared/src/types/decision-pattern.types.ts` (add `PatternBadgeKind`, `PatternEndorsementSummary`, `EnrichedPatternStats`)

**Client (modifiziert):**
- Modify: `packages/client/src/services/decisionPatterns.api.ts` (+3 functions)
- Modify: `packages/client/src/hooks/useDecisionPatterns.ts` (+ stats-enrichment)
- Modify: `packages/client/src/components/patterns/PatternCard.tsx` (badges + endorsement + deprecation-banner)
- Modify: `packages/client/src/components/patterns/DecisionPatternLibrary.tsx` (sort by "New" boost)
- Create: `packages/client/src/components/patterns/EndorsementDialog.tsx` (reason-input modal)
- Modify: `packages/client/src/services/decisionPatterns.api.test.ts` (+ 5 tests)

---

## Chunk 1: Backend Foundation (Slice 1 + 2)

### Task 1: Shared Types extension

**Files:**
- Modify: `packages/shared/src/types/decision-pattern.types.ts`

- [ ] **Step 1: Add new types**

```ts
export type PatternBadgeKind = 'most-used' | 'trending' | 'architects-choice' | 'new';

export interface PatternBadge {
  kind: PatternBadgeKind;
  label: string;
  reason?: string;
}

export interface PatternEndorsementSummary {
  count: number;
  topReasons: { userId: string; userName: string; reason: string; timestamp: string }[];
  hasMyEndorsement: boolean;
}

export interface EnrichedPatternStats extends PatternAdoptionStats {
  badges: PatternBadge[];
  endorsements: PatternEndorsementSummary;
  isNew: boolean;
  isDeprecated: boolean;
  successorSlug?: string;
  successorName?: string;
}
```

### Task 2: PatternEndorsement Model

**Files:**
- Create: `packages/server/src/models/PatternEndorsement.ts`

- [ ] **Step 1: Mongoose schema with reason**

```ts
import { Schema, model, Types } from 'mongoose';

export interface PatternEndorsementDoc extends Document {
  patternId: Types.ObjectId;
  userId: Types.ObjectId;
  reason: string;
  timestamp: Date;
}

const PatternEndorsementSchema = new Schema({
  patternId: { type: Schema.Types.ObjectId, ref: 'DecisionPattern', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, minlength: 30, maxlength: 500 },
  timestamp: { type: Date, default: Date.now },
});

// User can only endorse a pattern once
PatternEndorsementSchema.index({ patternId: 1, userId: 1 }, { unique: true });

export const PatternEndorsementModel = model('PatternEndorsement', PatternEndorsementSchema);
```

### Task 3: Badge-Computation-Service

**Files:**
- Create: `packages/server/src/services/patternBadge.service.ts`

- [ ] **Step 1: Pure computation logic (testable)**

```ts
export interface BadgeComputationInput {
  patternId: string;
  totalUses: number;
  last30Days: number;
  uniqueProjects: number;
  endorsementCount: number;
  createdAt: Date;
  // For "Trending" calculation:
  medianLast30DaysAcrossAllPatterns: number;
  // For "Most Used" calculation:
  totalUsesThreshold: number; // Top 10% cutoff
  now: Date;
}

export function computeBadges(input: BadgeComputationInput): PatternBadge[] {
  const badges: PatternBadge[] = [];

  // "New" — younger than 30 days
  const ageMs = input.now.getTime() - input.createdAt.getTime();
  if (ageMs < 30 * 24 * 60 * 60 * 1000) {
    badges.push({ kind: 'new', label: 'New' });
  }

  // "Most Used" — total uses >= Top 10% threshold
  if (input.totalUses >= input.totalUsesThreshold && input.totalUsesThreshold > 0) {
    badges.push({ kind: 'most-used', label: 'Most Used' });
  }

  // "Trending" — last-30-days > 3× median, and at least 3 adoptions
  if (
    input.last30Days >= 3 &&
    input.last30Days > 3 * Math.max(input.medianLast30DaysAcrossAllPatterns, 1)
  ) {
    badges.push({ kind: 'trending', label: 'Trending' });
  }

  // "Architects' Choice" — at least 1 architect endorsement
  if (input.endorsementCount >= 1) {
    badges.push({ kind: 'architects-choice', label: "Architects' Choice" });
  }

  return badges;
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeTop10PercentThreshold(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a); // DESC
  const cutoffIdx = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  return sorted[cutoffIdx] ?? 0;
}
```

- [ ] **Step 2: 8 unit tests** (`patternBadge.service.test.ts`)
  - "New" badge if age < 30 days
  - "Most Used" badge if total >= top-10%-cutoff
  - "Trending" if last30 > 3× median + min 3 adoptions
  - "Architects' Choice" if endorsement >= 1
  - Multiple badges can co-exist
  - Empty pattern (0 adoptions) gets only "New" (if recent)
  - median computation correct for even/odd arrays
  - top10-threshold computation handles small datasets

### Task 4: Routes — Lifecycle + Endorsement + Stats-All

**Files:**
- Modify: `packages/server/src/routes/decisionPatterns.routes.ts`

- [ ] **Step 1: PATCH /:slug/lifecycle (chief_architect only)**

```ts
router.patch(
  '/:slug/lifecycle',
  authenticate,
  requireRole('chief_architect'),
  async (req, res) => {
    const { lifecycleStatus, deprecatedAt, successorSlug, reason } = req.body;
    const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });

    let successorId = pattern.successorId;
    if (successorSlug) {
      const successor = await DecisionPatternModel.findOne({ slug: successorSlug });
      if (!successor) return res.status(400).json({ error: 'Successor not found' });
      successorId = successor._id;
    }

    const before = { lifecycleStatus: pattern.lifecycleStatus, deprecatedAt: pattern.deprecatedAt };

    pattern.lifecycleStatus = lifecycleStatus ?? pattern.lifecycleStatus;
    if (deprecatedAt !== undefined) {
      pattern.deprecatedAt = deprecatedAt ? new Date(deprecatedAt) : null;
    }
    pattern.successorId = successorId;
    await pattern.save();

    createAuditEntry({
      userId: String(req.user!._id),
      action: 'pattern_lifecycle_changed',
      entityType: 'decision_pattern',
      entityId: pattern.slug,
      before,
      after: { lifecycleStatus: pattern.lifecycleStatus, deprecatedAt: pattern.deprecatedAt, successorSlug, reason },
      riskLevel: 'medium',
    }).catch(() => {});

    res.json({ ok: true, pattern });
  }
);
```

- [ ] **Step 2: POST /:slug/endorse + DELETE /:slug/endorse**

```ts
const ENDORSE_ROLES = ['chief_architect', 'enterprise_architect', 'solution_architect', 'data_architect', 'business_architect'];

router.post('/:slug/endorse', authenticate, requireRole(...ENDORSE_ROLES), async (req, res) => {
  const { reason } = req.body || {};
  if (!reason || reason.trim().length < 30) {
    return res.status(400).json({ error: 'Reason required (min. 30 chars)' });
  }
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
  if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
  try {
    await PatternEndorsementModel.create({
      patternId: pattern._id,
      userId: req.user!._id,
      reason: reason.trim(),
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You already endorsed this pattern' });
    }
    throw err;
  }
  createAuditEntry({
    userId: String(req.user!._id),
    action: 'pattern_endorsed',
    entityType: 'decision_pattern',
    entityId: pattern.slug,
    after: { reason: reason.substring(0, 100) },
    riskLevel: 'medium',
  }).catch(() => {});
  res.status(201).json({ ok: true });
});

router.delete('/:slug/endorse', authenticate, requireRole(...ENDORSE_ROLES), async (req, res) => {
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
  if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
  const result = await PatternEndorsementModel.deleteOne({
    patternId: pattern._id,
    userId: req.user!._id,
  });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'No endorsement to remove' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 3: GET /stats-all (single round-trip enrichment)**

Statt N×`GET /:slug/stats` Calls aus dem Frontend, EIN Endpoint der alle Patterns enriched zurückliefert:

```ts
router.get('/stats-all', authenticate, async (req, res) => {
  const patterns = await DecisionPatternModel.find().lean();

  // Bulk-aggregate stats
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totalAgg, last30Agg, endorsementAgg, projectsAgg] = await Promise.all([
    PatternAdoptionModel.aggregate([
      { $group: { _id: '$patternId', count: { $sum: 1 } } },
    ]),
    PatternAdoptionModel.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$patternId', count: { $sum: 1 } } },
    ]),
    PatternEndorsementModel.aggregate([
      { $group: {
        _id: '$patternId',
        count: { $sum: 1 },
        myEndorsement: { $max: { $cond: [{ $eq: ['$userId', req.user!._id] }, 1, 0] } },
        topReasons: { $push: { userId: '$userId', reason: '$reason', timestamp: '$timestamp' } },
      } },
    ]),
    PatternAdoptionModel.aggregate([
      { $group: { _id: { patternId: '$patternId', projectId: '$projectId' } } },
      { $group: { _id: '$_id.patternId', count: { $sum: 1 } } },
    ]),
  ]);

  const totalMap = new Map(totalAgg.map(d => [String(d._id), d.count]));
  const last30Map = new Map(last30Agg.map(d => [String(d._id), d.count]));
  const endorseMap = new Map(endorsementAgg.map(d => [String(d._id), d]));
  const projectsMap = new Map(projectsAgg.map(d => [String(d._id), d.count]));

  // Compute global thresholds
  const allTotals = Array.from(totalMap.values());
  const allLast30 = Array.from(last30Map.values());
  const totalUsesThreshold = computeTop10PercentThreshold(allTotals);
  const medianLast30 = computeMedian(allLast30);
  const now = new Date();

  // Build successorSlug-map for deprecated patterns
  const slugByObjectId = new Map(patterns.map(p => [String(p._id), p.slug]));
  const nameByObjectId = new Map(patterns.map(p => [String(p._id), p.name]));

  const enriched = patterns.map(p => {
    const pid = String(p._id);
    const totalUses = totalMap.get(pid) ?? 0;
    const last30Days = last30Map.get(pid) ?? 0;
    const uniqueProjects = projectsMap.get(pid) ?? 0;
    const endorsement = endorseMap.get(pid);
    const endorsementCount = endorsement?.count ?? 0;
    const badges = computeBadges({
      patternId: pid, totalUses, last30Days, uniqueProjects,
      endorsementCount, createdAt: p.createdAt,
      medianLast30DaysAcrossAllPatterns: medianLast30,
      totalUsesThreshold, now,
    });
    return {
      ...p,
      stats: {
        totalUses, last30Days, uniqueProjects,
        badges,
        endorsements: {
          count: endorsementCount,
          topReasons: (endorsement?.topReasons ?? []).slice(0, 3),
          hasMyEndorsement: (endorsement?.myEndorsement ?? 0) === 1,
        },
        isNew: badges.some(b => b.kind === 'new'),
        isDeprecated: p.deprecatedAt !== null,
        successorSlug: p.successorId ? slugByObjectId.get(String(p.successorId)) : undefined,
        successorName: p.successorId ? nameByObjectId.get(String(p.successorId)) : undefined,
      },
    };
  });
  res.json({ patterns: enriched });
});
```

- [ ] **Step 4: 6 supertests for new routes**

### Task 5: Commit

```bash
git add packages/shared packages/server
git commit -m "feat(sprint-3): REQ-CHOICE-001.3 + UC-CHOICE-007 backend — versioning + badges + endorsement"
```

## Chunk 2: Frontend Integration (Slice 3 + 4 + 5)

### Task 6: API-Service erweitern

**Files:**
- Modify: `packages/client/src/services/decisionPatterns.api.ts`

- [ ] **Step 1: Add `fetchEnrichedPatterns`, `endorsePattern`, `unendorsePattern`, `updateLifecycle`**

```ts
export interface EnrichedDecisionPattern extends DecisionPattern {
  stats: EnrichedPatternStats;
}

export async function fetchEnrichedPatterns(filter?: FetchPatternsFilter): Promise<EnrichedDecisionPattern[]> {
  const params = new URLSearchParams();
  if (filter?.category) params.set('category', filter.category);
  const qs = params.toString();
  const r = await authFetch(`/api/decision-patterns/stats-all${qs ? `?${qs}` : ''}`);
  if (!r.ok) throw new Error(`Fetch enriched patterns failed: ${r.status}`);
  const data = await r.json();
  return data.patterns;
}

export async function endorsePattern(slug: string, reason: string): Promise<void> {
  const r = await authFetch(`/api/decision-patterns/${slug}/endorse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `Endorse failed: ${r.status}`);
  }
}

export async function unendorsePattern(slug: string): Promise<void> { ... }

export async function updateLifecycle(slug: string, opts: {
  lifecycleStatus?: LifecycleStatus;
  deprecatedAt?: string | null;
  successorSlug?: string | null;
  reason?: string;
}): Promise<void> { ... }
```

### Task 7: useDecisionPatterns erweitern — Stats-Enrichment + Sort-by-New

**Files:**
- Modify: `packages/client/src/hooks/useDecisionPatterns.ts`

- [ ] **Step 1: Switch from `fetchDecisionPatterns` → `fetchEnrichedPatterns`**

- [ ] **Step 2: Sort logic**
   - "New" patterns auf Position 1-3 (REQ-007.4)
   - Dann sort by `name` asc (existing)

### Task 8: PatternCard erweitern

**Files:**
- Modify: `packages/client/src/components/patterns/PatternCard.tsx`

- [ ] **Step 1: Badge-Row oben rendern**

```tsx
{pattern.stats?.badges.length > 0 && (
  <div className="flex gap-1 flex-wrap">
    {pattern.stats.badges.map(b => (
      <span
        key={b.kind}
        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${badgeColor(b.kind)}`}
      >
        {badgeIcon(b.kind)} {b.label}
      </span>
    ))}
  </div>
)}
```

Badge-Colors:
- `most-used` → gold gradient
- `trending` → blue/indigo
- `architects-choice` → purple
- `new` → green-outline

- [ ] **Step 2: Adoption-Counter (REQ-007.1)**

```tsx
{pattern.stats && (
  <div className="text-[10px] text-slate-400 flex items-center gap-2">
    <Users className="w-3 h-3" />
    {pattern.stats.totalUses} adoption{pattern.stats.totalUses !== 1 ? 's' : ''}
    {pattern.stats.last30Days > 0 && (
      <span>· {pattern.stats.last30Days} this month</span>
    )}
    {pattern.stats.uniqueProjects > 1 && (
      <span>· {pattern.stats.uniqueProjects} projects</span>
    )}
  </div>
)}
```

- [ ] **Step 3: Deprecated-Banner mit Successor-Link (REQ-007.5)**

```tsx
{pattern.stats?.isDeprecated && (
  <div className="bg-red-500/15 border border-red-500/40 rounded p-2 text-xs">
    <div className="text-red-300 font-semibold">⚠ DEPRECATED</div>
    {pattern.stats.successorSlug && (
      <button
        onClick={() => onNavigateToSuccessor(pattern.stats.successorSlug!)}
        className="text-red-200 underline mt-1"
      >
        Use successor: {pattern.stats.successorName} →
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Endorse-Button (only for architect roles)**

Wenn `currentUser.role.includes('architect')` und nicht `viewer`:

```tsx
<button
  onClick={() => onOpenEndorseDialog(pattern.slug)}
  className="text-xs text-[#a78bfa] hover:text-[#c4b5fd]"
>
  {pattern.stats.endorsements.hasMyEndorsement
    ? '★ Endorsed'
    : `☆ Endorse (${pattern.stats.endorsements.count})`}
</button>
```

### Task 9: EndorsementDialog Component

**Files:**
- Create: `packages/client/src/components/patterns/EndorsementDialog.tsx`

- [ ] **Step 1: Modal mit `<textarea>` für reason + character-count + submit**

Min-30-chars validation, character-counter visible, submit-disabled bis valid.

### Task 10: DecisionPatternLibrary — Successor-Navigation + Sort-Boost

**Files:**
- Modify: `packages/client/src/components/patterns/DecisionPatternLibrary.tsx`

- [ ] **Step 1: Successor-Click handler** scrollt zur Card mit dem `data-slug` Attribut

- [ ] **Step 2: Sort-Boost** — patterns mit `isNew` auf Positionen 1-3 vor name-sort

### Task 11: Frontend Tests

**Files:**
- Modify: `packages/client/src/services/decisionPatterns.api.test.ts`

- [ ] **Step 1: +5 tests für fetchEnrichedPatterns, endorse, unendorse, updateLifecycle**

### Task 12: Commit

```bash
git add packages/client
git commit -m "feat(sprint-3): REQ-CHOICE-001.3 + UC-CHOICE-007 frontend — badges + endorsement + deprecation banner"
```

## Chunk 3: Deploy + Verify

### Task 13: Build + Deploy

- [ ] **Step 1**: `npm run build` — alle 3 packages
- [ ] **Step 2**: rsync zum VPS (mit `--exclude '.env*'` — lessons learned!)
- [ ] **Step 3**: `docker compose -f docker-compose.prod.yml up -d --build --force-recreate app` (siehe deployment_pitfalls_2026_05_17)
- [ ] **Step 4**: 30s warten, dann Smoke-Test
- [ ] **Step 5**: Browser-Test im BSH-Demo
  - Erwartung: Alle 6 Patterns zeigen "✨ New"-Badge (alle <30 Tage alt)
  - Adoption-Counter zeigt aktuelle Stats
  - Endorse-Button sichtbar
  - Endorsement-Test mit min-30-char-Reason → "★ Endorsed"
  - Pattern deprecaten via API → Card zeigt rotes Banner

### Task 14: Linear-Updates + Memory + Daily

- [ ] Linear: alle 6 REQs auf Done, THE-198 + THE-191 auf Done
- [ ] Obsidian-Doku: `uc-choice-007-versioning-voting.md`
- [ ] Daily 2026-05-18
- [ ] Memory: `progress_sprint3_uc_choice_007.md`

---

## Aufwand-Schätzung

| Slice | Beschreibung | Aufwand |
|---|---|---|
| Backend Foundation | Shared types + Endorsement model + Badge-Service + 5 Routes + 14 Tests | **~3h** |
| Frontend Integration | API-Service + Hook + Card erweitert + Dialog + Sort-Boost + 5 Tests | **~2.5h** |
| Polish + Manual Test | Smoke-Test, Edge-Cases (deprecated patterns, neue patterns, etc.) | **~1h** |
| Deploy + Doku | rsync, force-recreate, Linear, Memory, Daily | **~1.5h** |
| **Total** | | **~8h** (Montag-Tag) |

---

## Risiken

1. **N+1-Query-Risiko**: `GET /stats-all` aggregiert 4 Collections parallel. Bei >100 Patterns Performance-Test nötig (vermutlich aber OK bis 1000 Patterns).
2. **Cold-Start "New"-Badge** kann verwirren wenn ALLE Patterns aktuell <30 Tage alt sind (Anfangs-Zustand). Mitigation: Manual-Test prüft das Edge-Case.
3. **`SuccessorSlug`-Validation**: Wenn ein Architekt einen non-existent slug eintippt → 400 zurück (REQ-001.3 spec sagt: zwingend valide). Frontend muss Slug-Picker bauen statt Free-Text.
4. **Eigenes Endorsement**: User kann mehrfach endorsen → Unique-Index handhabt das (`patternId+userId` unique), gibt 409.
5. **Audit-Volumen**: Bei vielen Endorsements könnte AuditLog wachsen. Mitigation: nur Endorse/Unendorse audited (low+medium risk), keine Reads.

---

## Demo-Story für BSH-Pitch (Sprint-Outcome)

> *"Stellt euch vor: BSH-Architekt Patrik öffnet die Pattern Library und sieht sofort: 'Managed OAuth Provider' hat 🏆 **Most Used**-Badge — 47 BSH-Projekte nutzen es. Plus ⭐ **Architects' Choice** von 3 Senior-Architekten mit Begründung 'NIS2-konform out of the box'. Daneben das 'OpenTelemetry-Stack'-Pattern mit 📈 **Trending**-Badge — 8 neue Adoptions in 30 Tagen, alle aus den Compliance-Projekten.
>
> Patrik wählt OAuth in 30 Sekunden statt 2 Stunden Research. 
>
> 4 Wochen später kommt der NIS2-Update — Senior-Architektin markiert 'Managed OAuth v1' als deprecated, verweist auf 'OAuth v2 (PKCE)'. **Sofort sehen alle 47 Projekte ein rotes Banner** in der Pattern-Card und ein Migration-Hint im Property-Panel. Compliance-Audit-Trail automatisch im AuditLog.
>
> Das hat **kein** anderer EAM-Tool im DACH-Markt. LeanIX, BiZZdesign, Mega, Ardoq — null. Spotify-Backstage hat die Telemetrie aber kein Lifecycle-Management. Wir haben beides."*

---

## Remember
- DRY/YAGNI/TDD/frequent commits
- Pre-Flight ✅ erledigt (Linear-IDs vorhanden, RBAC-Pattern bestätigt, Backend-Foundation existiert)
- Deployment-Pitfalls beachten: `.env`-rsync-exclude, `--force-recreate` statt `restart`, `-f prod.yml`
- Foundation aus UC-CHOICE-001 zu 80% wiederverwendet — kein neues DB-Schema-Drama
