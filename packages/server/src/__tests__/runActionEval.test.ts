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

const rel = (r: string): string => `{"relation":"${r}","why":"stub"}`;
const EQUAL = rel('equal');
const UNRELATED = rel('unrelated');
const INTERSECTS = rel('intersects');

/**
 * Ein Stub-Haus, das tatsaechlich LIEST: gleiches Thema auf beiden Seiten →
 * `equal`, sonst `unrelated`. Damit beantwortet es Arm P, Arm T, Arm K UND die
 * Kanarienvoegel richtig — ein Stub, der stur eine Antwort zurueckgibt, koennte
 * die Kanarienvoegel gar nicht bestehen und wuerde jeden Lauf ungueltig machen.
 */
const themeAware = async (_s: string, u: string): Promise<string> => {
  const themes = [...u.matchAll(/THEMA-(\d)/g)].map((m) => m[1]);
  return themes.length === 2 && themes[0] === themes[1] ? EQUAL : UNRELATED;
};

const obl = (theme: number, law: string, para: string, title: string, text: string) => ({
  law,
  para,
  title,
  text: `${text} [THEMA-${theme}]`,
});

/**
 * Drei Arm-T-Faelle, jeder mit EIGENEM Thema: nur so entstehen beim
 * Partner-Tausch Kanarienvoegel, die themenfremd sind — mit einem einzigen
 * Thema waere jeder Kanarienvogel zufaellig doch stimmig.
 */
const tiny: ActionGoldenSet = {
  version: 'test.v1',
  frozen: false,
  ontologyVersion: '1.8.0',
  cases: [
    {
      id: 't-1',
      arm: 'T',
      a: obl(1, 'DSGVO', 'Art. 33', 'Meldung', 'binnen 72 Stunden an die Aufsichtsbehörde melden'),
      b: obl(1, 'NIS2', 'Art. 23', 'Bericht', 'erhebliche Vorfälle an das CSIRT melden'),
      actionId: 'vorfall-melden-behoerde',
    },
    {
      id: 't-2',
      arm: 'T',
      a: obl(2, 'DSGVO', 'Art. 32', 'Verschlüsselung', 'personenbezogene Daten verschlüsseln'),
      b: obl(2, 'DORA', 'Art. 9', 'Kryptografie', 'kryptografische Kontrollen einsetzen'),
      actionId: 'technisch-organisatorische-massnahmen',
    },
    {
      id: 't-3',
      arm: 'T',
      a: obl(3, 'DSGVO', 'Art. 30', 'Verzeichnis', 'ein Verzeichnis der Verarbeitungen führen'),
      b: obl(3, 'DORA', 'Art. 8', 'Register', 'ein Register der IKT-Assets führen'),
      actionId: 'verzeichnis-fuehren',
    },
    {
      id: 'k-1',
      arm: 'K',
      a: obl(1, 'DSGVO', 'Art. 33', 'Meldung', 'binnen 72 Stunden melden'),
      b: obl(9, 'DORA', 'Art. 9', 'Zugriff', 'Zugriff auf IKT-Assets kontrollieren'),
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
    expect(buildPositiveControls(tiny, 99)).toHaveLength(tiny.cases.length);
  });
});

describe('evaluateActions (THE-438)', () => {
  it('runs every house over every case and derives tiers', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => themeAware(_s, u),
      h2: async (_s, u) => themeAware(_s, u),
    });
    expect(r.report.valid).toBe(true);
    expect(r.tiers['t-1']).toBe('A');
    expect(r.tiers['k-1']).toBe('C');
  });

  it('marks the run invalid when a house never agrees, instead of reporting 0 %', async () => {
    // Der Kernfehler vom 2026-08-01: ein Richter, der nie "ja" sagen kann,
    // sieht aus wie ein sauberer Negativ-Befund.
    const r = await evaluateActions(tiny, { h1: async () => UNRELATED });
    expect(r.report.valid).toBe(false);
    expect(r.report.tRate).toBeNull();
    expect(r.report.reason).toMatch(/Positiv-Kontrolle/);
  });

  it('never leaks a law name into any judge prompt', async () => {
    const seen: string[] = [];
    await evaluateActions(tiny, {
      h1: async (_s, u) => {
        seen.push(u);
        return themeAware(_s, u);
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const u of seen) expect(u).not.toMatch(/\bDSGVO\b|\bNIS2\b|\bDORA\b/);
  });

  it('counts a dead house as no vote, not as a rejection', async () => {
    const r = await evaluateActions(tiny, {
      alive: async (_s, u) => themeAware(_s, u),
      dead: async () => 'kaputt',
    });
    expect(r.tiers['t-1']).toBe('A'); // 1 von 1 gueltigen Stimmen
    expect(r.usable.dead).toBe(0);
    expect(r.usable.alive).toBeGreaterThan(0);
  });

  it('reports pairwise agreement between houses', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => themeAware(_s, u),
      h2: async (_s, u) => themeAware(_s, u),
    });
    expect(r.agreements).toHaveLength(1);
    expect(r.agreements[0]).toMatchObject({ a: 'h1', b: 'h2' });
  });
});

describe('renderActionReportMarkdown (THE-438)', () => {
  it('renders arms, tiers and the coherence verdict without I/O', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => themeAware(_s, u),
      h2: async (_s, u) => themeAware(_s, u),
    });
    const md = renderActionReportMarkdown(r);
    expect(md).toContain('Positiv-Kontrolle');
    expect(md).toContain('Negativ-Kontrolle');
    expect(md).toContain('## Konfidenzstufen');
    expect(md).toMatch(/\| A \| alle einig auf/);
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
      h1: async (_s, u) => themeAware(_s, u),
      h2: async (_s, u) => (u.includes('Zugriff') ? EQUAL : UNRELATED), // spiegelverkehrt
    });
    expect(renderActionReportMarkdown(r)).toMatch(/kein Auto-Merge/i);
  });

  it('reports tiers per arm, not against the pooled case count', async () => {
    // Arm K erreicht konstruktionsbedingt nie A oder B. Seine Faelle im Nenner
    // halbieren die Arm-T-Quote (11/120 = 9 % statt 11/60 = 18 %) und machen
    // aus dem Messwert eine kleinere, falsche Zahl.
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => themeAware(_s, u),
      h2: async (_s, u) => themeAware(_s, u),
    });
    const md = renderActionReportMarkdown(r);
    expect(md).toMatch(/\| A \| alle einig auf `equal`\/`subset` \| 3 \/ 3 \(100 %\) \| 0 \/ 1 \|/);
    expect(md).toContain('Arm K *(muss 0 sein)*');
  });

  it('names the false alarms so the prescribed remedy is actionable', async () => {
    // Ein gerissenes Tor, das nur "die Negativ-Kontrolle hat versagt" meldet,
    // macht die vorgeschriebene Abhilfe ("Katalog-Eintrag aufteilen")
    // unausfuehrbar. Ein Befund, den man nicht lokalisieren kann, ist keiner.
    const r = await evaluateActions(tiny, { h1: async () => EQUAL }); // sagt auch bei Arm K ja
    expect(r.report.valid).toBe(false);
    const md = renderActionReportMarkdown(r);
    expect(md).toContain('### Fehlalarme der Negativ-Kontrolle');
    expect(md).toContain('`k-1`');
    expect(r.votesByCase['k-1'].h1).toBe('equal');
  });

  it('omits the false-alarm section entirely when the negative control holds', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => themeAware(_s, u),
    });
    expect(renderActionReportMarkdown(r)).not.toContain('Fehlalarme der Negativ-Kontrolle');
  });

  it('warns that the arm rates are pooled across houses', async () => {
    // Haus-Quote, gepoolte Quote und Mehrheitsquote sind drei verschiedene
    // Zahlen (37/37/47 % · 40 % · 35 % in der Referenzmessung).
    const r = await evaluateActions(tiny, { h1: async () => EQUAL });
    expect(renderActionReportMarkdown(r)).toMatch(/GEPOOLT/);
  });
});

/**
 * Kanarienvögel und Typen im Harness (THE-382 Slice 1, Task 7).
 *
 * Die Positiv-Kontrolle prüft, ob der Richter zustimmen kann. Diese Tests
 * prüfen die zweite Vorbedingung: ob er ablehnen kann — und ob die
 * Kanarienvögel dabei niemals als echte Fälle durchgehen.
 */
describe('Kanarienvögel im Harness (THE-382)', () => {
  it('injects canaries mixed into the run, not as a block', async () => {
    const order: string[] = [];
    await evaluateActions(tiny, {
      h1: async (_s, u) => {
        order.push(u);
        return themeAware(_s, u);
      },
    });
    // Ein Block gleichartiger Faelle waere als Muster erkennbar; das Modell
    // wuerde den naechsten reflexhaft ablehnen statt ihn zu lesen.
    //
    // Ein Kanarienvogel ist am Themen-Paar erkennbar: zwei VERSCHIEDENE Themen,
    // beide aus dem Arm-T-Vorrat (1-3). Arm K traegt bewusst die Fremdmarke 9.
    const isCanaryPrompt = (u: string): boolean => {
      const t = [...u.matchAll(/THEMA-(\d)/g)].map((m) => Number(m[1]));
      return t.length === 2 && t[0] !== t[1] && t.every((x) => x <= 3);
    };
    const positions = order.map((u, i) => ({ canary: isCanaryPrompt(u), i })).filter((p) => p.canary).map((p) => p.i);
    expect(positions.length).toBeGreaterThan(1);
    // Kein Kanarienvogel folgt unmittelbar auf einen anderen.
    const gaps = positions.slice(1).map((p, i) => p - positions[i]);
    expect(gaps.every((g) => g > 1)).toBe(true);
  });

  it('never lets a canary reach the tiers', async () => {
    const r = await evaluateActions(tiny, { h1: themeAware });
    // MV-7: ein Kanarienvogel in den Stufen waere ein erfundener Vorschlag.
    expect(Object.keys(r.tiers).some((id) => id.startsWith('canary__'))).toBe(false);
    expect(Object.keys(r.tiers).sort()).toEqual(['k-1', 't-1', 't-2', 't-3']);
  });

  it('keeps canaries out of the arm distributions as well', async () => {
    const r = await evaluateActions(tiny, { h1: themeAware });
    const counted = Object.values(r.relationsByArm.T).reduce((a, b) => a + b, 0)
      + Object.values(r.relationsByArm.K).reduce((a, b) => a + b, 0);
    expect(counted).toBe(4); // genau die vier Pruefsatz-Faelle, kein Kanarienvogel
  });

  it('marks the run invalid when canaries are not caught', async () => {
    // Ein Richter, der alles durchwinkt, besteht Arm P mit 100 % — erst die
    // Kanarienvoegel decken ihn auf.
    const r = await evaluateActions(tiny, { h1: async () => EQUAL });
    expect(r.report.valid).toBe(false);
    expect(r.canaryRate).toBe(0);
    expect(r.canaryMisses.length).toBeGreaterThan(0);
    expect(renderActionReportMarkdown(r)).toMatch(/GERISSEN/);
  });

  it('marks the run invalid when NO canaries were injected', async () => {
    // Gleiche Logik wie bei Arm P: nicht geprueft heisst nicht bestanden.
    const singleT: ActionGoldenSet = { ...tiny, cases: tiny.cases.filter((c) => c.arm !== 'T').concat(tiny.cases[0]) };
    const r = await evaluateActions(singleT, { h1: themeAware });
    expect(r.canaryRate).toBeNull();
    expect(r.report.valid).toBe(false);
    expect(r.report.reason).toMatch(/Kanarienvögel/);
  });

  it('accepts intersects as caught — two real duties almost always touch', async () => {
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => {
        const t = [...u.matchAll(/THEMA-(\d)/g)].map((m) => m[1]);
        return t.length === 2 && t[0] === t[1] ? EQUAL : INTERSECTS;
      },
    });
    expect(r.canaryRate).toBe(1);
    expect(r.canaryMisses).toEqual([]);
  });
});

describe('Typen im Bericht (THE-382)', () => {
  it('reports the relation distribution per arm', async () => {
    const r = await evaluateActions(tiny, { h1: themeAware });
    expect(r.relationsByArm.T).toEqual({ equal: 3 });
    expect(r.relationsByArm.K).toEqual({ unrelated: 1 });
    const md = renderActionReportMarkdown(r);
    expect(md).toContain('## Typ-Verteilung je Arm');
  });

  it('flags a human-visible contradiction when equal DOES appear in arm T', async () => {
    // Im Experiment kam `equal` in 120 Faellen null Mal vor. Taucht es auf,
    // muss der Bericht das als Widerspruch benennen, nicht als Erfolg.
    const r = await evaluateActions(tiny, { h1: themeAware });
    expect(renderActionReportMarkdown(r)).toMatch(/WIDERSPRICHT dem Experiment/);
  });

  it('reports the folding explicitly wherever a binary number appears', async () => {
    const r = await evaluateActions(tiny, { h1: themeAware });
    expect(renderActionReportMarkdown(r)).toMatch(/gefaltet|Faltung/i);
  });

  it('does NOT count intersects as a false alarm in arm K', async () => {
    // `intersects` bei zwei Compliance-Pflichten ist erwartbar, kein Fehlalarm.
    // Nur `equal`/`subset` sind einer.
    const r = await evaluateActions(tiny, {
      h1: async (_s, u) => {
        const t = [...u.matchAll(/THEMA-(\d)/g)].map((m) => m[1]);
        return t.length === 2 && t[0] === t[1] ? EQUAL : INTERSECTS;
      },
    });
    expect(renderActionReportMarkdown(r)).not.toContain('Fehlalarme der Negativ-Kontrolle');
  });
});
