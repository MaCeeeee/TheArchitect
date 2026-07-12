/**
 * Typing-Golden Schema/Loader — THE-430 Slice 1 (Phase 2).
 *
 * Run: cd packages/server && npx jest src/__tests__/typingGolden.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TypingGoldenSetSchema,
  loadTypingGolden,
  typingGoldenStats,
  findDuplicateCaseIds,
  TypingGoldenError,
  type TypingGoldenSet,
} from '../evals/typingGolden';

const baseCase = {
  caseId: 'dsgvo-art-5',
  source: 'dsgvo',
  paragraphNumber: 'art-5',
  fullText: 'Personenbezogene Daten müssen auf rechtmäßige Weise verarbeitet werden. '.repeat(2),
  language: 'de' as const,
  jurisdiction: 'DE',
  labels: { normKind: 'legislation', bindingness: 'binding', obligationKind: 'obligation', partyRole: 'controller' },
};

const validSet: TypingGoldenSet = {
  version: 'v1',
  frozen: false,
  ontologyVersion: '1.3.0',
  rubricRef: 'RUBRIC.md',
  cases: [baseCase],
};

describe('TypingGoldenSetSchema', () => {
  it('accepts a well-formed set', () => {
    expect(TypingGoldenSetSchema.safeParse(validSet).success).toBe(true);
  });

  it('rejects out-of-ontology axis values', () => {
    const bad = { ...validSet, cases: [{ ...baseCase, labels: { ...baseCase.labels, obligationKind: 'duty' } }] };
    expect(TypingGoldenSetSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts null on an axis (bewusst nicht anwendbar)', () => {
    const defn = {
      ...validSet,
      cases: [{ ...baseCase, caseId: 'dsgvo-art-4', labels: { normKind: 'legislation', obligationKind: null } }],
    };
    expect(TypingGoldenSetSchema.safeParse(defn).success).toBe(true);
  });

  it('rejects too-short fullText', () => {
    const bad = { ...validSet, cases: [{ ...baseCase, fullText: 'zu kurz' }] };
    expect(TypingGoldenSetSchema.safeParse(bad).success).toBe(false);
  });

  it('requires ontologyVersion', () => {
    const { ontologyVersion, ...noVer } = validSet;
    expect(TypingGoldenSetSchema.safeParse(noVer).success).toBe(false);
  });
});

describe('loadTypingGolden', () => {
  const tmp = path.join(os.tmpdir(), `typing-golden-${process.pid}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('loads + validates a file', () => {
    fs.writeFileSync(tmp, JSON.stringify(validSet));
    expect(loadTypingGolden(tmp).cases).toHaveLength(1);
  });

  it('throws on duplicate caseIds', () => {
    fs.writeFileSync(tmp, JSON.stringify({ ...validSet, cases: [baseCase, baseCase] }));
    expect(() => loadTypingGolden(tmp)).toThrow(TypingGoldenError);
  });

  it('throws on missing file', () => {
    expect(() => loadTypingGolden('/no/such/file.json')).toThrow(TypingGoldenError);
  });
});

describe('typingGoldenStats', () => {
  it('counts labeled vs not-applicable per axis + language breakdown', () => {
    const set: TypingGoldenSet = {
      ...validSet,
      cases: [
        baseCase, // alle 4 gelabelt, de
        {
          ...baseCase,
          caseId: 'nis2-art-21',
          source: 'nis2',
          language: 'en',
          labels: { normKind: 'legislation', obligationKind: null }, // 1 gelabelt, 1 n/a
        },
      ],
    };
    const s = typingGoldenStats(set);
    expect(s.total).toBe(2);
    expect(s.byLanguage).toEqual({ de: 1, en: 1 });
    expect(s.bySource).toEqual({ dsgvo: 1, nis2: 1 });
    expect(s.labeledPerAxis.normKind).toBe(2);
    expect(s.labeledPerAxis.obligationKind).toBe(1);
    expect(s.notApplicablePerAxis.obligationKind).toBe(1);
  });
});

describe('findDuplicateCaseIds', () => {
  it('flags repeats', () => {
    expect(findDuplicateCaseIds([baseCase, baseCase])).toEqual(['dsgvo-art-5']);
    expect(findDuplicateCaseIds([baseCase])).toEqual([]);
  });
});
