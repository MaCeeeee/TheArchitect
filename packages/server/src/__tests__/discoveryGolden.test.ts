/**
 * discoveryGolden Tests — UC-LAW-002 Slice-2b (THE-465).
 *
 * Run: cd packages/server && npx jest discoveryGolden --verbose
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DiscoveryGoldenSetSchema,
  DiscoveryGoldenSetError,
  loadDiscoveryGoldenSet,
  loadFixtureCorpus,
  loadDiscoveryEvalData,
  findDuplicateDiscoveryCaseIds,
  findUncoveredGoldFamilies,
  fixtureCorpusFamilies,
  discoveryGoldenSetStats,
  DEFAULT_DISCOVERY_GOLDEN_PATH,
  DEFAULT_DISCOVERY_CORPUS_PATH,
  type DiscoveryGoldenCase,
  type FixtureCorpus,
} from '../evals/discoveryGolden';

function tmpFile(name: string, content: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-golden-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
}

function validCase(overrides: Partial<DiscoveryGoldenCase> = {}): DiscoveryGoldenCase {
  return {
    caseId: 'case-1',
    title: 'Test Case',
    profileText: 'a'.repeat(120),
    signalHints: [],
    goldFamilies: ['dsgvo'],
    ruleLessGold: [],
    ambiguous: false,
    ...overrides,
  };
}

function validSet(cases: DiscoveryGoldenCase[] = Array.from({ length: 10 }, (_, i) => validCase({ caseId: `c${i}` }))) {
  return { version: 'v1', frozen: false, rubricRef: 'plan#task-5', cases };
}

function corpus(paragraphs: Array<Partial<FixtureCorpus['paragraphs'][number]>> = []): FixtureCorpus {
  return {
    version: 'v1',
    paragraphs: paragraphs.map((p, i) => ({
      regulationKey: `dsgvo:${i}`,
      versionHash: 'fx-1',
      source: 'dsgvo',
      paragraphNumber: `Art. ${i}`,
      title: 'Test',
      jurisdiction: 'EU',
      language: 'de',
      text: 'b'.repeat(90),
      ...p,
    })),
  };
}

describe('DiscoveryGoldenCaseSchema', () => {
  it('accepts a minimal valid case', () => {
    expect(DiscoveryGoldenSetSchema.safeParse(validSet()).success).toBe(true);
  });

  it('rejects profileText shorter than 100 chars', () => {
    const set = validSet([validCase({ profileText: 'too short' })]);
    expect(DiscoveryGoldenSetSchema.safeParse(set).success).toBe(false);
  });

  it('rejects fewer than 10 cases', () => {
    const set = validSet([validCase()]);
    expect(DiscoveryGoldenSetSchema.safeParse(set).success).toBe(false);
  });

  it('rejects a hard negative with a non-empty goldFamilies conflict — actually accepts empty goldFamilies (hard negative is valid)', () => {
    const set = validSet(Array.from({ length: 10 }, (_, i) => validCase({ caseId: `c${i}`, goldFamilies: [] })));
    expect(DiscoveryGoldenSetSchema.safeParse(set).success).toBe(true);
  });

  it('rejects ruleLessGold entries that are not a subset of goldFamilies', () => {
    const set = validSet([
      validCase({ caseId: 'bad', goldFamilies: ['dsgvo'], ruleLessGold: ['mdr'] }),
      ...Array.from({ length: 9 }, (_, i) => validCase({ caseId: `ok${i}` })),
    ]);
    const parsed = DiscoveryGoldenSetSchema.safeParse(set);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some(i => i.message.includes('ruleLessGold'))).toBe(true);
    }
  });

  it('accepts ruleLessGold as a proper subset of goldFamilies', () => {
    const set = validSet([
      validCase({ caseId: 'ok', goldFamilies: ['dsgvo', 'mdr'], ruleLessGold: ['mdr'] }),
      ...Array.from({ length: 9 }, (_, i) => validCase({ caseId: `ok${i}` })),
    ]);
    expect(DiscoveryGoldenSetSchema.safeParse(set).success).toBe(true);
  });
});

describe('findDuplicateDiscoveryCaseIds', () => {
  it('flags duplicate caseIds', () => {
    expect(findDuplicateDiscoveryCaseIds([validCase({ caseId: 'a' }), validCase({ caseId: 'a' })])).toEqual(['a']);
  });
});

describe('loadDiscoveryGoldenSet / loadFixtureCorpus (file loaders)', () => {
  it('throws DiscoveryGoldenSetError on duplicate caseIds', () => {
    const file = tmpFile('dup.json', validSet([validCase({ caseId: 'x' }), validCase({ caseId: 'x' }), ...Array.from({ length: 9 }, (_, i) => validCase({ caseId: `y${i}` }))]));
    expect(() => loadDiscoveryGoldenSet(file)).toThrow(DiscoveryGoldenSetError);
  });

  it('throws on missing file', () => {
    expect(() => loadDiscoveryGoldenSet('/nonexistent/path.json')).toThrow(DiscoveryGoldenSetError);
  });

  it('loads a well-formed fixture corpus', () => {
    const file = tmpFile('corpus.json', corpus([{ source: 'dsgvo' }, { source: 'mdr', regulationKey: 'mdr:1' }]));
    const loaded = loadFixtureCorpus(file);
    expect(loaded.paragraphs).toHaveLength(2);
  });
});

describe('fixtureCorpusFamilies / findUncoveredGoldFamilies (anti-leak)', () => {
  it('merges language-suffixed sources into families', () => {
    const c = corpus([{ source: 'ai-act-de' }, { source: 'ai-act-en', regulationKey: 'ai-act-en:1' }]);
    expect(fixtureCorpusFamilies(c)).toEqual(new Set(['ai-act']));
  });

  it('flags a goldFamily that has no fixture paragraphs at all', () => {
    const golden = validSet([
      validCase({ caseId: 'leaky', goldFamilies: ['nowhere-law'] }),
      ...Array.from({ length: 9 }, (_, i) => validCase({ caseId: `ok${i}` })),
    ]);
    const c = corpus([{ source: 'dsgvo' }]);
    const missing = findUncoveredGoldFamilies(golden, c);
    expect(missing).toContainEqual({ caseId: 'leaky', family: 'nowhere-law' });
  });

  it('loadDiscoveryEvalData throws when a golden file references an uncovered family', () => {
    const goldenFile = tmpFile(
      'leaky-golden.json',
      validSet([
        validCase({ caseId: 'leaky', goldFamilies: ['nowhere-law'] }),
        ...Array.from({ length: 9 }, (_, i) => validCase({ caseId: `ok${i}` })),
      ]),
    );
    const corpusFile = tmpFile('ok-corpus.json', corpus([{ source: 'dsgvo' }]));
    expect(() => loadDiscoveryEvalData(goldenFile, corpusFile)).toThrow(DiscoveryGoldenSetError);
  });

  it('loadDiscoveryEvalData succeeds when every goldFamily is covered', () => {
    const goldenFile = tmpFile(
      'ok-golden.json',
      validSet(Array.from({ length: 10 }, (_, i) => validCase({ caseId: `ok${i}`, goldFamilies: ['dsgvo'] }))),
    );
    const corpusFile = tmpFile('ok-corpus2.json', corpus([{ source: 'dsgvo' }]));
    const { golden, corpus: loadedCorpus } = loadDiscoveryEvalData(goldenFile, corpusFile);
    expect(golden.cases).toHaveLength(10);
    expect(loadedCorpus.paragraphs).toHaveLength(1);
  });
});

describe('discoveryGoldenSetStats', () => {
  it('counts hard negatives, ambiguous cases and rule-less cases', () => {
    const set = validSet([
      validCase({ caseId: 'a', goldFamilies: [] }),
      validCase({ caseId: 'b', ambiguous: true }),
      validCase({ caseId: 'c', goldFamilies: ['dsgvo', 'mdr'], ruleLessGold: ['mdr'] }),
      ...Array.from({ length: 7 }, (_, i) => validCase({ caseId: `d${i}` })),
    ]);
    const stats = discoveryGoldenSetStats(set);
    expect(stats.total).toBe(10);
    expect(stats.hardNegatives).toBe(1);
    expect(stats.ambiguous).toBe(1);
    expect(stats.ruleLessCases).toBe(1);
  });
});

// ─── Integration: the actual shipped golden set + fixture corpus (Task 5 content) ───

describe('shipped discovery.v1.json + discovery.corpus.v1.json (Task 5 content)', () => {
  it('files exist at the default paths', () => {
    expect(fs.existsSync(DEFAULT_DISCOVERY_GOLDEN_PATH)).toBe(true);
    expect(fs.existsSync(DEFAULT_DISCOVERY_CORPUS_PATH)).toBe(true);
  });

  it('loads without throwing and satisfies the anti-leak invariant', () => {
    const { golden, corpus: fixtureCorpus } = loadDiscoveryEvalData();
    expect(golden.cases.length).toBeGreaterThanOrEqual(12);
    expect(fixtureCorpus.paragraphs.length).toBeGreaterThan(0);
  });

  it('is frozen:false (Owner has not approved yet)', () => {
    const golden = loadDiscoveryGoldenSet();
    expect(golden.frozen).toBe(false);
  });

  it('includes at least one hard negative (AC-1)', () => {
    const golden = loadDiscoveryGoldenSet();
    expect(golden.cases.some(c => c.goldFamilies.length === 0)).toBe(true);
  });

  it('includes rule-less gold families that exist ONLY in the fixture corpus, not in APPLICABILITY_RULES (AC-7)', () => {
    const golden = loadDiscoveryGoldenSet();
    const ruleLess = new Set(golden.cases.flatMap(c => c.ruleLessGold));
    expect(ruleLess.size).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { APPLICABILITY_RULES } = require('../data/applicability-rules');
    const ruleIds = new Set(APPLICABILITY_RULES.map((r: { ruleId: string }) => r.ruleId));
    for (const f of ruleLess) {
      expect(ruleIds.has(f)).toBe(false);
    }
  });

  it('every profileText is at least 100 chars (schema-enforced, sanity re-check)', () => {
    const golden = loadDiscoveryGoldenSet();
    for (const c of golden.cases) {
      expect(c.profileText.length).toBeGreaterThanOrEqual(100);
    }
  });

  it('the AI-Act family has both a German and an English fixture paragraph (AC-5 DE/EN consistency vehicle)', () => {
    const fixtureCorpus = loadFixtureCorpus();
    const aiActParagraphs = fixtureCorpus.paragraphs.filter(p => p.source.startsWith('ai-act'));
    expect(aiActParagraphs.some(p => p.language === 'de')).toBe(true);
    expect(aiActParagraphs.some(p => p.language === 'en')).toBe(true);
  });

  it('every present vector has exactly 768 dims (valid pre- AND post-precompute; absence is covered by the runner fail-fast guard)', () => {
    const fixtureCorpus = loadFixtureCorpus();
    for (const p of fixtureCorpus.paragraphs) {
      if (p.vector !== undefined) expect(p.vector).toHaveLength(768);
    }
  });
});
