/**
 * seed-golden-from-db Tests — reine Transformations-Logik (THE-379).
 *
 * Run: cd packages/server && npx jest src/__tests__/seedGoldenFromDb.test.ts
 */
import {
  slugify,
  buildGoldenCasesFromGroups,
  type RegulationGroupInput,
} from '../scripts/seed-golden-from-db';
import { GoldenCaseSchema } from '../evals/goldenSet';
import type { CandidateElement } from '../services/complianceMapping.service';

const CANDIDATES: CandidateElement[] = [
  { id: 'el-a', name: 'App A', type: 'application' },
  { id: 'el-b', name: 'Process B', type: 'business_process' },
  { id: 'el-c', name: 'Data C', type: 'data_object' },
];

function group(overrides: Partial<RegulationGroupInput>): RegulationGroupInput {
  return {
    projectId: 'proj0000000000000000abcdef',
    regulationId: 'reg1',
    source: 'dsgvo',
    paragraphNumber: 'Art. 30',
    title: 'VVT',
    fullText: 'x'.repeat(80),
    language: 'de',
    jurisdiction: 'EU',
    candidates: CANDIDATES,
    confirmedElementIds: [],
    rejectedElementIds: [],
    ...overrides,
  };
}

const OPTS = { labeledAt: '2026-07-03' };

describe('slugify()', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('Art. 30 Abs. 1')).toBe('art-30-abs-1');
    expect(slugify('DSGVO')).toBe('dsgvo');
  });
});

describe('buildGoldenCasesFromGroups()', () => {
  it('emits a case with gold = confirmed ids (filtered to candidate set)', () => {
    const { cases } = buildGoldenCasesFromGroups(
      [group({ confirmedElementIds: ['el-a', 'el-GHOST'], rejectedElementIds: ['el-b'] })],
      OPTS,
    );
    expect(cases).toHaveLength(1);
    expect(cases[0].goldElementIds).toEqual(['el-a']); // el-GHOST dropped (not a candidate)
    expect(cases[0].ambiguous).toBe(false);
    expect(cases[0].candidates).toHaveLength(3); // full project set retained
    // Every emitted case must satisfy the golden-set schema.
    expect(() => GoldenCaseSchema.parse(cases[0])).not.toThrow();
  });

  it('skips rejection-only groups by default', () => {
    const { cases, skipped } = buildGoldenCasesFromGroups(
      [group({ rejectedElementIds: ['el-a'] })],
      OPTS,
    );
    expect(cases).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/only rejections/);
  });

  it('includes rejection-only groups (flagged ambiguous) when opted in', () => {
    const { cases } = buildGoldenCasesFromGroups(
      [group({ rejectedElementIds: ['el-a'] })],
      { ...OPTS, includeRejectionOnly: true },
    );
    expect(cases).toHaveLength(1);
    expect(cases[0].goldElementIds).toEqual([]);
    expect(cases[0].ambiguous).toBe(true);
    expect(() => GoldenCaseSchema.parse(cases[0])).not.toThrow();
  });

  it('skips groups with no candidates or too-short text', () => {
    const { cases, skipped } = buildGoldenCasesFromGroups(
      [
        group({ regulationId: 'r-empty', candidates: [], confirmedElementIds: ['el-a'] }),
        group({ regulationId: 'r-short', fullText: 'too short', confirmedElementIds: ['el-a'] }),
      ],
      OPTS,
    );
    expect(cases).toHaveLength(0);
    expect(skipped.map(s => s.reason).join(' ')).toMatch(/no candidate elements/);
    expect(skipped.map(s => s.reason).join(' ')).toMatch(/< 50 chars/);
  });

  it('produces collision-safe caseIds across projects and same paragraph', () => {
    const { cases } = buildGoldenCasesFromGroups(
      [
        group({ projectId: 'aaaaaaaaaaaaaaaaaa111111', regulationId: 'r1', confirmedElementIds: ['el-a'] }),
        group({ projectId: 'bbbbbbbbbbbbbbbbbb222222', regulationId: 'r2', confirmedElementIds: ['el-b'] }),
      ],
      OPTS,
    );
    const ids = cases.map(c => c.caseId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids.every(id => id.startsWith('dsgvo-art-30'))).toBe(true);
  });
});
