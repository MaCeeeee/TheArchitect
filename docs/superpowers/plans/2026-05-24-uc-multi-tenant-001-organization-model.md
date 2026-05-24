# UC-MULTI-TENANT-001 — Organization Model (Multi-Tenancy Foundation) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `Organization` as the first-class tenant unit in TheArchitect so that one corporate customer (e.g. BSH-Konzern) can own multiple Projects (Bosch / Siemens / Gaggenau brands) with one shared member directory, billing relationship, and audit trail — without leaking data across customers and without renaming the existing `Workspace` concept (BPMN/n8n source containers within a project).

**Architecture:**
- Flat hierarchy: `User —membership→ Organization —1:N→ Project —1:N→ Workspace (existing)` — Linear/Notion/GitHub pattern.
- `Organization` carries the Owner, member list with roles (`owner | admin | member | viewer`), plan tier, and is the unit of billing + audit + cross-project similarity-isolation.
- Existing `Project.ownerId` + `Project.collaborators[]` stay for **project-internal** RBAC; new `Project.organizationId` enforces the tenant boundary.
- Existing `Workspace` model (`projectId`, `source: bpmn|n8n|manual|…`) is left untouched — different concept, only the name collides.
- Migration: every existing User gets a default Organization (`{email}'s Organization`), all their owned Projects move under it. Collaborators stay project-scoped (additive permission on top of Org-membership).

**Tech Stack:** Mongoose + Express + JWT (Organization-claim added), React 18 + Zustand (active-org store), no new deps.

**Linear:** THE-292 (this plan replaces the original description)

---

## Naming Decision (locked)

**`Organization`** — chosen 2026-05-24 over Tenant/Workspace because:
- `Workspace` already means "BPMN/n8n source container within a Project" in our codebase ([Workspace.ts](packages/server/src/models/Workspace.ts:1))
- Organization is the B2B-SaaS standard (GitHub, Linear, Notion, Slack-teams).
- Investors and Enterprise buyers recognize it instantly.

UI labels: "Organization Settings", "Switch Organization", "Invite to Organization", "Organization Plan".

---

## Scope (V1) vs Out-of-Scope (V2)

**V1 MVP — what Enterprise sales needs to close:**
- Organization model + Mongoose validation
- Project belongs to exactly one Organization (org-isolation enforced server-side)
- User can be a member of multiple Organizations with one role per org
- Active-Organization context (stored in JWT + frontend store)
- Invitation flow (existing Invitation model adapted to org-scope)
- Settings UI (rename org, manage members, leave/delete)
- Migration that converts every existing user into a single-Org-tenant without data loss
- Audit-Log entries: `organization.created | member_added | member_removed | role_changed | deleted`
- Cross-Organization-Project-Access returns 403, audited

**V2 — explicitly deferred:**
- Plan-based limits (Free=1 Org, Pro=3 Orgs, Enterprise=unlimited) — keep `plan` field but don't enforce
- Sub-domain routing (`bsh.thearchitect.site`) — keep path routing for V1
- Cross-Organization-Similarity for consultancy users (one consultant ↔ many clients)
- Organization-level templates / policies / SSO
- Project transfer between Organizations (out: harder than it looks because of Neo4j data + similarity collection re-keying)
- Workspace-level (current sub-project) RBAC

---

## Pre-Flight Findings

Before chunking the work — three things we discovered checking the current code:

1. **Naming collision is real**: existing `Workspace` is project-internal source-container, **not** a tenant. Don't reuse.
2. **31 route files reference `projectId`** with **366 calls to `requireProjectAccess` / `requirePermission`**. Touching all of them by hand is error-prone. **Strategy: introduce a higher-order `requireOrgAccess` that wraps the existing `requireProjectAccess` and validates org-boundary first; almost no per-route changes needed.**
3. **JWT format must add `activeOrgId` claim**. All in-flight tokens become "single-org-implied" but the next token-refresh fills the claim. **Strategy: don't force-logout users; backend defaults to user's only-membership when claim is missing (works because V1 users only have one Org from the migration).**

---

## Chunk 1: Organization model + tests

### Task 1: `Organization.ts` Mongoose model

**Files:**
- Create: `packages/server/src/models/Organization.ts`
- Create: `packages/server/src/__tests__/Organization.model.test.ts`

- [ ] **Step 1: Write failing tests**

5 cases:
1. Valid org persists + auto-generates `slug` from `name` (URL-safe).
2. Slug uniqueness enforced.
3. `plan` defaults to `free`, enum accepts `free|pro|enterprise`.
4. Cannot remove the last `owner` member (must transfer first).
5. `members` deduplicates on `userId` (no double-membership).

- [ ] **Step 2: Schema**

```typescript
// packages/server/src/models/Organization.ts
import mongoose, { Schema, Document } from 'mongoose';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
export type OrgPlan = 'free' | 'pro' | 'enterprise';

export interface IOrganizationMember {
  userId: mongoose.Types.ObjectId;
  role: OrgRole;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId;
}

export interface IOrganization extends Document {
  name: string;
  slug: string;          // url-safe, unique
  plan: OrgPlan;
  ownerId: mongoose.Types.ObjectId;
  members: IOrganizationMember[];
  createdAt: Date;
  updatedAt: Date;
}

// ... schema + pre-save hooks for slug + owner-membership invariant
```

- [ ] **Step 3: Run tests, commit.**

### Task 2: `Project.organizationId` + backfill helper

**Files:**
- Modify: `packages/server/src/models/Project.ts` (add `organizationId` + index)
- Create: `packages/server/src/services/organization.service.ts` (`getDefaultOrgForUser`, `createOrganization`, `addMember`, `removeMember`, `transferOwnership`)
- Test: `packages/server/src/__tests__/organization.service.test.ts`

- [ ] Add `organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true }` to Project.
- [ ] Make it required-but-nullable during migration phase: `required: function() { return !this.__migrating }`.
- [ ] 8 service-layer tests.

---

## Chunk 2: Authorization layer

### Task 3: `requireOrgAccess` middleware

**Files:**
- Create: `packages/server/src/middleware/orgAccess.middleware.ts`
- Modify: `packages/server/src/middleware/projectAccess.middleware.ts` (chain org-check first)
- Test: `packages/server/src/__tests__/orgAccess.middleware.test.ts`

Wrap the existing `requireProjectAccess(role)` so that:
1. Resolve `project.organizationId` from `req.params.projectId`.
2. Verify `req.user.orgMemberships.some(m => m.organizationId.equals(orgId))`.
3. If not, 403 + `auditOrgMismatch(userId, orgId)` (re-using REQ-SIM-005 pattern).
4. Otherwise: delegate to existing `requireProjectAccess`.

**Why this is safer than per-route refactor:** all 366 existing middleware calls keep working. We add the org-boundary inside the existing chain.

- [ ] 6 tests: cross-org 403 + audit, same-org passthrough, missing project 404, owner-shortcut, refresh-token edge case, deleted org returns 410.

### Task 4: JWT + auth refresh adapted to active-org

**Files:**
- Modify: `packages/server/src/routes/auth.routes.ts` (login + refresh inject `activeOrgId`)
- Modify: `packages/server/src/middleware/auth.middleware.ts` (load `req.user.activeOrg` + `req.user.orgMemberships`)
- Test: `packages/server/src/__tests__/auth.org.test.ts`

- [ ] Login response now includes `organizations: [...]` so the client can render an org-switcher.
- [ ] JWT carries `activeOrgId`. If absent (older token), backend falls back to user's first membership (V1 has exactly one).
- [ ] New endpoint `POST /api/auth/switch-org { organizationId }` issues a fresh token with the new active org.
- [ ] 5 tests.

---

## Chunk 3: Migration

### Task 5: Backfill migration script

**Files:**
- Create: `packages/server/migrations/2026-05-XX-add-organizations.ts`
- Create: `packages/server/scripts/run-migration.ts` (if not present — pick `migrate-mongo` or hand-rolled)

Logic:
1. For each User: create one Organization `{user.email}'s Organization` with `ownerId = user._id` and `members: [{userId: user._id, role: 'owner'}]`.
2. For each Project owned by that User: set `organizationId` to the new org.
3. For Projects where the user is a collaborator but not owner: collaborator stays in their own Org (Project is **NOT** duplicated). This means existing collaborator-access keeps working through the Project's `collaborators[]` array but the Project lives in the owner's Org. **Document this limitation:** V1 cannot model "Project shared across Orgs" — that's V2 (Project Transfer).
4. Idempotency: re-running adds no duplicates.
5. Dry-run mode: `--dry-run` prints what would change.
6. Audit row per created Org: `organization.migrated_from_legacy`.

- [ ] Smoke-test on a fresh Mongo dump from production: 1 user with 3 owned projects → 1 Org, 3 Projects all with `organizationId`.
- [ ] Test on synthetic dataset with cross-collaborator setup.
- [ ] Document the rollback (drop `organizationId` field + drop Org collection).

---

## Chunk 4: Org API + Member management

### Task 6: Organization REST API

**Files:**
- Create: `packages/server/src/routes/organization.routes.ts`
- Test: `packages/server/src/__tests__/organization.routes.test.ts`

Endpoints:
```
GET    /api/organizations                       — list user's orgs (for switcher)
GET    /api/organizations/:id                   — details + members
PATCH  /api/organizations/:id                   — rename, change plan (owner+)
DELETE /api/organizations/:id                   — soft-delete, owner-only, blocks if Projects exist
POST   /api/organizations/:id/members           — invite by email (admin+)
PATCH  /api/organizations/:id/members/:userId   — change role (admin+, cannot demote owner)
DELETE /api/organizations/:id/members/:userId   — remove member (admin+) or self-leave
POST   /api/organizations/:id/transfer-ownership { newOwnerId } — owner-only
```

- [ ] 12 supertests covering happy-path + RBAC violations + audit-log emits.

### Task 7: Adapt Invitation model for Org-scope

**Files:**
- Modify: `packages/server/src/models/Invitation.ts` — add optional `organizationId` (mutually exclusive with `projectId`).
- Modify: `packages/server/src/routes/invitation.routes.ts` — branch on scope.
- Test: `packages/server/src/__tests__/invitation.org.test.ts`

- [ ] Email template adapts: "You've been invited to join organization X" vs project-scope.
- [ ] 4 tests.

---

## Chunk 5: Frontend

### Task 8: Active-org store + Org-Switcher

**Files:**
- Create: `packages/client/src/stores/organizationStore.ts` (Zustand)
- Create: `packages/client/src/components/ui/OrgSwitcher.tsx` (dropdown in top-bar near profile)
- Modify: `packages/client/src/services/api.ts` (already sends auth header — no change, JWT carries org)
- Modify: `packages/client/src/components/ui/MainLayout.tsx` (mount OrgSwitcher)

- [ ] OrgSwitcher: dropdown with current org name, switch to other org → calls `/api/auth/switch-org` → reloads relevant stores.
- [ ] On app boot: pre-populate `organizations[]` from login response.

### Task 9: Organization Settings UI

**Files:**
- Create: `packages/client/src/components/settings/OrganizationSettings.tsx`
- Create: `packages/client/src/components/settings/OrgMembersTable.tsx`
- Create: `packages/client/src/components/settings/InviteMemberModal.tsx`
- Modify: existing Settings route to include new tab

Sections:
1. **Profile**: name, slug, plan badge.
2. **Members**: table with name / email / role / joined / actions (change role, remove).
3. **Invitations**: pending invites table + "Invite Member" button → modal.
4. **Danger Zone**: leave organization (members) / delete organization (owner, with confirm-typing).

- [ ] 4 Vitest component tests (rendering, role-change, invite, leave).

---

## Chunk 6: Hardening & Deploy

### Task 10: Cross-cutting tests + audit verification

- [ ] **Integration test**: User A in Org-1 cannot read Project P that belongs to Org-2 (404 / 403).
- [ ] **Similarity-isolation regression**: REQ-SIM-005 tenant tests still pass (Qdrant collection is still per-project; org-boundary is an additional layer above it). Optional V2: move collection key to `elements-{orgId}` so Org-members share an embedding pool.
- [ ] **Smoke**: full login → create org → invite member → invitee accepts → invitee sees Project list (empty until project moved to that Org).

### Task 11: Production deploy + post-deploy migration run

- [ ] Build, rsync, docker compose up.
- [ ] Run migration with `--dry-run` first, then real.
- [ ] Verify: every Project has `organizationId`, every User has at least one `OrganizationMember` row.
- [ ] Smoke-test login as 2 different users in different Orgs.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration leaves orphan Projects without `organizationId` | Medium | High (auth breaks) | Dry-run + post-migration validator query; rollback script ready |
| Existing JWTs miss `activeOrgId` claim → 403 storm | High | Medium | Backend falls back to user's only org for tokens issued before deploy. Window of risk = JWT TTL (typically 15 min) |
| 366 `requireProjectAccess` calls don't all enforce org-boundary | High if per-route | Low | Solved by `requireOrgAccess` wrapping the existing middleware — single point of enforcement |
| Project shared between two Orgs (existing collaborator pattern) | Medium | Low | Documented limitation V1; V2 = Project Transfer feature |
| Similarity collection re-keying breaks UC-RED/UC-CHOICE | Low | Medium | V1 leaves collection-keying at project-level; org just adds outer check |
| Workspace renaming confusion | Medium | Low | Strict naming review in PR: never use "workspace" for tenant in new code |

## Effort Estimate

| Chunk | Tasks | Realistic Days |
|---|---|---|
| 1 Model + Project field | 2 | 1.5 |
| 2 Auth layer | 2 | 2.0 |
| 3 Migration | 1 | 1.5 |
| 4 Org API + Invitation | 2 | 2.0 |
| 5 Frontend | 2 | 2.5 |
| 6 Hardening + deploy | 2 | 1.5 |
| **Total** | **11 tasks** | **11 working days** |

Plus 2 days buffer for production migration surprises → **~13 working days = ~3 calendar weeks**.

---

## Timing Recommendation

**Defer to after BSH Demo 2026-06-14.** Reasoning:
- BSH-Demo runs on single-tenant setup (1 BSH-Demo project), Multi-Tenancy is invisible to demo viewers.
- Sprint W3/W4 (until 2026-06-13) should focus on polishing UC-ICM-003 + UC-EXEC-001 for the live demo.
- Multi-Tenant is "Sales-Pipeline Enabler", not "Demo-Killer" — its value materializes in the SECOND BSH meeting, not the first.
- Window after BSH demo (2026-06-15 → 2026-07-05) gives 15 working days = matches the 11+buffer estimate cleanly.

**Alternative (riskier):** Slice 1 + 2 (model + middleware) parallel during W3/W4 if a separate agent has bandwidth — these are backend-only and don't touch the demo UI. Slices 3-6 strictly post-demo.

---

## RVTM

Skipped for now — to be generated when this plan moves out of Backlog into Sprint planning.

## Remember
- Strictly `Organization` everywhere in new code, never `Tenant` or `Workspace` for the tenant concept.
- Tests before code (TDD) on every backend task.
- Frequent commits — one per Task (11 commits total).
- Don't break existing `Workspace` (project-internal) behavior.
