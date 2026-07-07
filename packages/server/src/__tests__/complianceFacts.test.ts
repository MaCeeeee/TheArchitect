/**
 * Compliance-Facts v1 Tests — Taxonomie, Serialisierung, Prädikate, Merge.
 *
 * Die Prädikat-Erwartungen sind die adjudizierten Beispiele aus dem
 * Design-Review (COMPLIANCE_FACTS.md): dieselben Fakten, verschiedene Gesetze —
 * tech-vps ist für Art. 17 transitiv (infra), für Art. 28 aber match
 * (vendor_processor) und für NIS2 Art. 21 wieder match (tier core).
 *
 * Run: cd packages/server && npx jest src/__tests__/complianceFacts.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ComplianceFactsV1Schema,
  FACTS_REGISTRY_V1,
  KIND_VALUES,
  HOLDS_CATEGORIES,
  DOES_VALUES,
  OPS_LOC,
  OPS_OP,
  OPS_TIER,
  parseHoldsEntry,
  parseFactsFromMetadata,
  mergeComplianceIntoMetadata,
  serializeFacts,
  PREDICATES_V1,
  type ComplianceFactsV1,
} from '../compliance/factsV1';
import { parseCatalog, planFor } from '../scripts/apply-compliance-facts';

const f = (over: Partial<ComplianceFactsV1> & Pick<ComplianceFactsV1, 'kind' | 'ops'>) =>
  ComplianceFactsV1Schema.parse({ v: 1, holds: [], does: [], ...over });

const mongo = f({ kind: 'store', holds: ['account:doc', 'credentials:doc'], ops: { loc: 'eu', op: 'self', tier: 'core' } });
const minio = f({ kind: 'store', holds: ['content:maybe'], ops: { loc: 'eu', op: 'self', tier: 'core' } });
const vps = f({ kind: 'infra', ops: { loc: 'eu', op: 'vendor_processor', tier: 'core' } });
const anthropic = f({ kind: 'external', holds: ['content:maybe'], ops: { loc: 'us', op: 'vendor_processor', tier: 'support' } });
const caddy = f({ kind: 'control', does: ['tls'], ops: { loc: 'eu', op: 'self', tier: 'core' } });

describe('ComplianceFactsV1Schema', () => {
  it('accepts a full profile and rejects unknown enum values', () => {
    expect(mongo.holds).toHaveLength(2);
    expect(() =>
      ComplianceFactsV1Schema.parse({ v: 1, kind: 'blob', holds: [], does: [], ops: { loc: 'eu', op: 'self', tier: 'core' } })
    ).toThrow();
    expect(() =>
      ComplianceFactsV1Schema.parse({ v: 1, kind: 'store', holds: ['geheim:doc'], does: [], ops: { loc: 'eu', op: 'self', tier: 'core' } })
    ).toThrow();
  });

  it('parseHoldsEntry splits category and presence', () => {
    expect(parseHoldsEntry('account:doc')).toEqual({ category: 'account', presence: 'doc' });
    expect(() => parseHoldsEntry('account')).toThrow(/invalid holds entry/);
  });

  it('reserved cap field validates but is optional (v1.1-Reserve)', () => {
    const withCap = ComplianceFactsV1Schema.parse({
      v: 1, kind: 'store', holds: [], does: [],
      ops: { loc: 'eu', op: 'self', tier: 'core' }, cap: ['delete_by_subject'],
    });
    expect(withCap.cap).toEqual(['delete_by_subject']);
  });
});

describe('serializeFacts()', () => {
  it('renders the compact DSL with ? for maybe and - for empty lists', () => {
    expect(serializeFacts(mongo)).toBe('store; holds account,credentials; does -; eu/self/core');
    expect(serializeFacts(anthropic)).toBe('external; holds content?; does -; us/vendor_processor/support');
    expect(serializeFacts(caddy)).toBe('control; holds -; does tls; eu/self/core');
  });
});

describe('PREDICATES_V1 — dieselben Fakten, verschiedene Gesetze', () => {
  it('Art. 17: doc-Halter match, maybe und infra nicht', () => {
    expect(PREDICATES_V1['gdpr.art17'](mongo).match).toBe(true);
    expect(PREDICATES_V1['gdpr.art17'](minio).match).toBe(false); // content:maybe → konservativ
    expect(PREDICATES_V1['gdpr.art17'](vps).match).toBe(false); // infra transitiv
  });

  it('Art. 28: vendor_processor match — auch der für Art. 17 transitive Hoster', () => {
    expect(PREDICATES_V1['gdpr.art28'](anthropic).match).toBe(true);
    expect(PREDICATES_V1['gdpr.art28'](vps).match).toBe(true); // die Entkopplung, die Freitext nie leistet
    expect(PREDICATES_V1['gdpr.art28'](mongo).match).toBe(false);
  });

  it('Art. 32: doc-Halter ODER Maßnahmen-Element', () => {
    expect(PREDICATES_V1['gdpr.art32'](mongo).match).toBe(true);
    expect(PREDICATES_V1['gdpr.art32'](caddy).match).toBe(true); // tls = TOM
    expect(PREDICATES_V1['gdpr.art32'](vps).match).toBe(false);
  });

  it('Art. 44: nur vendor_processor außerhalb EU/Angemessenheit', () => {
    expect(PREDICATES_V1['gdpr.art44'](anthropic).match).toBe(true);
    expect(PREDICATES_V1['gdpr.art44'](vps).match).toBe(false); // eu
  });

  it('Art. 30/33 (Stufe 2): Datenhalter bleiben automatisch no-match', () => {
    expect(PREDICATES_V1['gdpr.art30'](mongo)).toMatchObject({ match: false, stage: 2 });
    expect(PREDICATES_V1['gdpr.art33'](mongo).match).toBe(false);
  });

  it('NIS2 Art. 21: infra ist hier ausdrücklich MATCH (anders als bei Datenpflichten)', () => {
    expect(PREDICATES_V1['nis2.art21'](vps).match).toBe(true);
    expect(PREDICATES_V1['nis2.art21'](f({ kind: 'service', ops: { loc: 'eu', op: 'self', tier: 'dev' } })).match).toBe(false);
    expect(PREDICATES_V1['nis2.art21.supplychain'](vps).match).toBe(true);
    expect(PREDICATES_V1['nis2.art21.supplychain'](mongo).match).toBe(false);
  });

  it('every predicate returns a human-readable reason (Prüfer-Erklärung)', () => {
    for (const p of Object.values(PREDICATES_V1)) {
      const r = p(mongo);
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('FACTS_REGISTRY_V1 — eine Quelle für alle Enum-Werte', () => {
  it('covers every enum value of every dimension', () => {
    const has = (dim: string, value: string) =>
      FACTS_REGISTRY_V1.some(e => e.dimension === dim && e.value === value);
    for (const v of KIND_VALUES) expect(has('kind', v)).toBe(true);
    for (const v of HOLDS_CATEGORIES) expect(has('holds.category', v)).toBe(true);
    for (const v of DOES_VALUES) expect(has('does', v)).toBe(true);
    for (const v of OPS_LOC) expect(has('ops.loc', v)).toBe(true);
    for (const v of OPS_OP) expect(has('ops.op', v)).toBe(true);
    for (const v of OPS_TIER) expect(has('ops.tier', v)).toBe(true);
  });

  it('every entry has a definition and a ref', () => {
    for (const e of FACTS_REGISTRY_V1) {
      expect(e.definition.length).toBeGreaterThan(10);
      expect(e.ref.length).toBeGreaterThan(0);
    }
  });
});

describe('metadata merge (Voll-Ersatz-PUT-Schutz)', () => {
  it('preserves foreign metadata keys byte-identically (isPolicyNode-CONTAINS-Queries!)', () => {
    const existing = { isPolicyNode: true, source: 'compliance-policy', sensitivity: 'PII' };
    const merged = mergeComplianceIntoMetadata(existing, caddy);
    expect(merged.isPolicyNode).toBe(true);
    expect(merged.source).toBe('compliance-policy');
    expect(merged.compliance).toEqual(caddy);
    // Roh-Serialisierung der bestehenden Keys bleibt CONTAINS-kompatibel
    expect(JSON.stringify(merged)).toContain('"isPolicyNode":true');
    expect(JSON.stringify(merged)).toContain('"source":"compliance-policy"');
  });

  it('parseFactsFromMetadata reads back what merge wrote, null otherwise', () => {
    expect(parseFactsFromMetadata(mergeComplianceIntoMetadata({}, mongo))).toEqual(mongo);
    expect(parseFactsFromMetadata({})).toBeNull();
    expect(parseFactsFromMetadata({ compliance: { v: 99 } })).toBeNull();
    expect(parseFactsFromMetadata(null)).toBeNull();
  });
});

describe('apply-compliance-facts (reine Teile)', () => {
  it('the committed self catalog is fully schema-valid', () => {
    const p = path.join(__dirname, '..', 'compliance', 'facts-catalog.self.v1.json');
    const catalog = parseCatalog(JSON.parse(fs.readFileSync(p, 'utf8')));
    expect(catalog.size).toBeGreaterThanOrEqual(30);
    for (const [id, parsed] of catalog) {
      expect({ id, invalid: 'error' in parsed ? (parsed as { error: string }).error : null })
        .toEqual({ id, invalid: null });
    }
  });

  it('planFor: create/update/unchanged/invalid decisions', () => {
    expect(planFor('e1', mongo, {}).action).toBe('create');
    expect(planFor('e1', mongo, mergeComplianceIntoMetadata({}, caddy)).action).toBe('update');
    expect(planFor('e1', mongo, mergeComplianceIntoMetadata({}, mongo)).action).toBe('unchanged');
    expect(planFor('e1', { error: 'bad' }, {}).action).toBe('invalid');
  });
});
