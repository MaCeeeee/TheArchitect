/**
 * Migration — severity-Domain + ruleId-Backfill + enforcementLevel (THE-442, UC-CHOICE-003).
 *
 * Was sie tut:
 *   1. Policies: legacy severity (error|warning|info) → neue Domain
 *      (high|medium|low), enforcementLevel-Default 'advisory', ruleId-Backfill
 *      pro Rule (`r-<uuid>`).
 *   2. Violations: severity mappen, ruleId via (policyId, field) auflösen,
 *      resourcePath + enforcementLevel setzen. Nicht auflösbare → resolved
 *      (Alt-Daten ohne identifizierbare Rule bleiben nicht offen liegen).
 *   3. Index-Umbau: alter Unique-Key (policyId,elementId,field) →
 *      (policyId,elementId,ruleId). createIndex erst NACH dem Backfill —
 *      sonst kollidieren Alt-Violations mit fehlendem ruleId.
 *
 * Idempotent: bereits migrierte Dokumente matchen die Queries nicht mehr
 * ('rules.0'-Guard: Policies mit rules:[] würden sonst auf jedem Lauf zählen).
 *
 * Mac (Dev):  npm run migrate:severity --workspace=@thearchitect/server
 * VPS (Prod): docker compose exec app node dist/scripts/migrate-severity-enforcement.js
 */
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

import { LEGACY_SEVERITY_MAP, mapLegacySeverity } from '@thearchitect/shared';

const LEGACY = Object.keys(LEGACY_SEVERITY_MAP);

export interface MigrationResult {
  policiesMigrated: number;
  violationsMigrated: number;
  violationsResolvedUnmappable: number;
}

/** Testbarer Kern. */
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
          severity: mapLegacySeverity(p.severity as string) || p.severity,
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
            severity: mapLegacySeverity(v.severity as string) || v.severity,
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
          severity: mapLegacySeverity(v.severity as string) || v.severity,
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

// ─── CLI ─── (Muster: migrate-to-norms.ts)
/* eslint-disable no-console */
if (require.main === module) {
  (async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    await mongoose.connect(uri);
    const result = await runSeverityEnforcementMigration();
    console.log('[THE-442] migration done:', JSON.stringify(result, null, 2));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
