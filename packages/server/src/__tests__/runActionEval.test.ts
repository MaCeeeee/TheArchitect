/**
 * Tests für Prüfsatz und Drei-Arme-Harness (THE-438 Slice 1, Task 7).
 *
 * Die Häuser sind INJIZIERT — kein Live-LLM, und derselbe Codepfad läuft im
 * Eval wie in der Produktion. Muster: runTypingEval.
 */
import {
  loadActionGolden,
  buildPositiveControls,
  actionGoldenStats,
  findDuplicateCaseIds,
  type ActionGoldenSet,
} from '../evals/actionGolden';
import { evaluateActions, renderActionReportMarkdown } from '../evals/runActionEval';
import { NORM_ONTOLOGY, isCanonicalAction } from '@thearchitect/shared';

const YES = '{"same":true,"delta":"Adressat","why":"eine Meldekette bedient beide"}';
const NO = '{"same":false,"delta":"—","why":"verschiedene Taetigkeiten"}';

const tiny: ActionGoldenSet = {
  version: 'test.v1',
  frozen: false,
  ontologyVersion: '1.8.0',
  cases: [
    {
      id: 't-1',
      arm: 'T',
      a: { law: 'DSGVO', para: 'Art. 33', title: 'Meldung', text: 'binnen 72 Stunden an die Aufsichtsbehörde melden' },
      b: { law: 'NIS2', para: 'Art. 23', title: 'Bericht', text: 'erhebliche Vorfälle an das CSIRT melden' },
      actionId: 'vorfall-melden-behoerde',
    },
    {
      id: 'k-1',
      arm: 'K',
      a: { law: 'DSGVO', para: 'Art. 33', title: 'Meldung', text: 'binnen 72 Stunden melden' },
      b: { law: 'DORA', para: 'Art. 9', title: 'Zugriff', text: 'Zugriff auf IKT-Assets kontrollieren' },
      actionId: 'vorfall-melden-behoerde',
      actionIdB: 'zugriffskontrolle',
    },
  ],
};

describe('actionGolden — der eingefrorene Prüfsatz (THE-438)', () => {
  const set = loadActionGolden();

  it('loads, is frozen and free of duplicate ids', () => {
    expect(set.frozen).toBe(true);
    expect(findDuplicateCaseIds(set.cases)).toEqual([]);
  });

  it('carries both decision arms in equal strength', () => {
    const s = actionGoldenStats(set);
    expect(s.byArm.T).toBe(60);
    expect(s.byArm.K).toBe(60);
  });

  it('spans the three legal acts the premise was measured on', () => {
    expect(actionGoldenStats(set).laws).toEqual(['DORA', 'DSGVO', 'NIS2']);
  });

  it('references only actions that exist in the ontology', () => {
    // Ein Pruefsatz, der auf einen entfernten Katalog-Eintrag zeigt, misst
    // stillschweigend nichts mehr.
    for (const c of set.cases) {
      expect(isCanonicalAction(c.actionId)).toBe(true);
      if (c.actionIdB) expect(isCanonicalAction(c.actionIdB)).toBe(true);
    }
  });

  it('pins the ontology version it was labelled against', () => {
    expect(set.ontologyVersion).toBe(NORM_ONTOLOGY.ontologyVersion);
  });

  it('keeps arm K genuinely off-action — same action would make it an arm-T case', () => {
    for (const c of set.cases.filter((x) => x.arm === 'K')) {
      expect(c.actionIdB).toBeDefined();
      expect(c.actionIdB).not.toBe(c.actionId);
    }
  });

  it('pairs only obligations from DIFFERENT legal acts', () => {
    for (const c of set.cases) expect(c.a.law).not.toBe(c.b.law);
  });
});

describe('buildPositiveControls (THE-438)', () => {
  it('puts the same obligation on both sides, varying only the origin', () => {
    const [p] = buildPositiveControls(tiny, 1);
    expect(p.a.text).toBe(p.b.text);
    expect(p.a.title).toBe(p.b.title);
    expect(p.a.law).not.toBe(p.b.law);
  });

  it('is deterministic — the instrument ceiling must not wobble between runs', () => {
    const a = buildPositiveControls(loadActionGolden(), 15).map((p) => p.id);
    const b = buildPositiveControls(loadActionGolden(), 15).map((p) => p.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(15);
  });

  it('never asks for more controls than the set has cases', () => {
    expect(buildPositiveControls(tiny, 99)).toHaveLength(2);
  });
});

describe('evaluateActions (THE-438)', () => {
  it('runs every house over every case and derives tiers', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
      h2: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
    });
    expect(r.report.valid).toBe(true);
    expect(r.tiers['t-1']).toBe('A');
    expect(r.tiers['k-1']).toBe('C');
  });

  it('marks the run invalid when a house never agrees, instead of reporting 0 %', async () => {
    // Der Kernfehler vom 2026-08-01: ein Richter, der nie "ja" sagen kann,
    // sieht aus wie ein sauberer Negativ-Befund.
    const r = await evaluateActions(tiny, { h1: async () => NO });
    expect(r.report.valid).toBe(false);
    expect(r.report.tRate).toBeNull();
    expect(r.report.reason).toMatch(/Positiv-Kontrolle/);
  });

  it('never leaks a law name into any judge prompt', async () => {
    const seen: string[] = [];
    await evaluateActions(tiny, {
      h1: async (_s, u) => {
        seen.push(u);
        return YES;
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const u of seen) expect(u).not.toMatch(/\bDSGVO\b|\bNIS2\b|\bDORA\b/);
  });

  it('counts a dead house as no vote, not as a rejection', async () => {
    const r = await evaluateActions(tiny, {
      alive: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
      dead: async () => 'kaputt',
    });
    expect(r.tiers['t-1']).toBe('A'); // 1 von 1 gueltigen Stimmen
    expect(r.usable.dead).toBe(0);
    expect(r.usable.alive).toBeGreaterThan(0);
  });

  it('reports pairwise agreement between houses', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
      h2: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
    });
    expect(r.agreements).toHaveLength(1);
    expect(r.agreements[0]).toMatchObject({ a: 'h1', b: 'h2' });
  });
});

describe('renderActionReportMarkdown (THE-438)', () => {
  it('renders arms, tiers and the coherence verdict without I/O', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
      h2: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
    });
    const md = renderActionReportMarkdown(r);
    expect(md).toContain('Positiv-Kontrolle');
    expect(md).toContain('Negativ-Kontrolle');
    expect(md).toContain('## Konfidenzstufen');
    expect(md).toMatch(/\| A \| alle Häuser einig \| 1 /);
    expect(md).toContain('## Übereinstimmung der Häuser');
    // Die Kohärenz-Aussage muss IMMER dastehen — hier stimmen beide Haeuser auf
    // beiden Faellen ueberein, kappa ist also 1 und das Tor erfuellt.
    expect(md).toContain('Kohärenz-Tor');
    expect(md).toContain('Verwertbare Antworten je Haus');
  });

  it('states the no-auto-merge consequence whenever a kappa misses the gate', async () => {
    // Der reale Fall: kappa 0,308–0,697. Die Haeuser sind sich ueber die QUOTE
    // einig, ueber das EINZELNE PAAR nicht — das muss im Bericht stehen, sonst
    // liest jemand die Quote als Freigabe.
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
      h2: async (_s, u) => (u.includes('Zugriff') ? YES : NO), // durchgaengig uneins
    });
    expect(renderActionReportMarkdown(r)).toMatch(/kein Auto-Merge/i);
  });

  it('reports tiers per arm, not against the pooled case count', async () => {
    // Arm K erreicht konstruktionsbedingt nie A oder B. Seine Faelle im Nenner
    // halbieren die Arm-T-Quote (11/120 = 9 % statt 11/60 = 18 %) und machen
    // aus dem Messwert eine kleinere, falsche Zahl.
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
      h2: async (_s, u) => (u.includes('Zugriff') ? NO : YES),
    });
    const md = renderActionReportMarkdown(r);
    expect(md).toMatch(/\| A \| alle Häuser einig \| 1 \/ 1 \(100 %\) \| 0 \/ 1 \|/);
    expect(md).toContain('Arm K *(muss 0 sein)*');
  });

  it('warns that the arm rates are pooled across houses', async () => {
    // Haus-Quote, gepoolte Quote und Mehrheitsquote sind drei verschiedene
    // Zahlen (37/37/47 % · 40 % · 35 % in der Referenzmessung).
    const r = await evaluateActions(tiny, { h1: async () => YES });
    expect(renderActionReportMarkdown(r)).toMatch(/GEPOOLT/);
  });
});
