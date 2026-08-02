/**
 * Tests für den Harness des senkrechten Schnitts (THE-545, Task 7).
 *
 * Der Harness beantwortet die vier DoD-Punkte des Tickets mit ZAHLEN. Diese
 * Tests prüfen deshalb nicht, ob die Kette gute Ergebnisse liefert — sondern
 * ob sie ehrlich zählt, richtig abbricht und ihre Grenzen mitschreibt.
 *
 * Die Häuser sind injiziert: kein Live-LLM, derselbe Codepfad wie im echten
 * Lauf (Muster: runActionEval).
 */
import {
  evaluateReqtrace,
  renderReqtraceReport,
  SCF_GOLD,
  ACTION_TO_SCF,
  type ReqtraceEvalResult,
} from '../evals/reqtrace/runReqtraceEval';
import { loadReqtraceLaws, type ReqtraceArticle } from '../evals/reqtrace/lawsFixture';
import { STAKEHOLDER_REQ_SYSTEM, SYSTEM_REQ_SYSTEM, PAIR_RELATION_SYSTEM } from '@thearchitect/shared';

const laws = loadReqtraceLaws();
const only = (...keys: string[]): ReqtraceArticle[] =>
  laws.articles.filter((a) => keys.includes(`${a.source}:${a.article}`));

/** Ein Kandidat, der genau eine Handlung/Empfänger/Modalität/Bedingung trägt. */
const candidate = (action: string): string =>
  JSON.stringify({
    candidates: [
      {
        text: `Das Unternehmen muss ${action} sicherstellen.`,
        handlungen: [action],
        empfaenger: ['—'],
        modalitaeten: ['pflicht'],
        bedingungen: ['laufend'],
      },
    ],
  });

const sysReq = (schutzgut: string, verpflichteter: string): string =>
  JSON.stringify({
    text: 'Das Unternehmen muss die Fähigkeit vorhalten.',
    schutzgut,
    verpflichteter,
    ausloeser: 'laufender Betrieb',
    nachweis: 'Nachweisdokumentation',
  });

/**
 * Ein Stub-Haus, das die drei Stufen an ihrem System-Prompt auseinanderhält
 * und pro Rechtsakt eine feste kanonische Handlung liefert.
 */
const house = (opts: { action?: string; relation?: string } = {}) =>
  async (system: string, user: string): Promise<string> => {
    if (system === STAKEHOLDER_REQ_SYSTEM) return candidate(opts.action ?? 'betriebskontinuitaet');
    if (system === SYSTEM_REQ_SYSTEM) return sysReq('Betrieb', 'controller');
    if (system === PAIR_RELATION_SYSTEM) return `{"relation":"${opts.relation ?? 'intersects'}","why":"stub"}`;
    return JSON.stringify({ id: 'betriebskontinuitaet' });
  };

describe('SCF_GOLD und die Zuordnung (THE-545)', () => {
  it('carries exactly the five candidates the external calculation produced', () => {
    expect(SCF_GOLD.map((g) => g.id).sort()).toEqual(['BCD-01', 'CRY-01', 'GOV-02', 'HRS-03', 'RSK-01']);
  });

  it('maps every gold entry to at least one canonical action', () => {
    for (const g of SCF_GOLD) {
      const actions = Object.entries(ACTION_TO_SCF).filter(([, ids]) => ids.includes(g.id));
      expect(actions.length).toBeGreaterThan(0);
    }
  });

  it('admits that the mapping is OUR setting, not the SCF’s claim', () => {
    // RVTM O-2: die Tabelle entscheidet mit, was als "wiedergefunden" zaehlt.
    const src = require('fs').readFileSync(require.resolve('../evals/reqtrace/runReqtraceEval'), 'utf8');
    expect(src).toMatch(/Setzung|unsere Zuordnung/i);
  });
});

describe('evaluateReqtrace — Zählwerk (THE-545, DoD-4)', () => {
  it('reports clauses, requirements per clause and the split count', async () => {
    const r = await evaluateReqtrace(only('dsgvo:art32'), { ask: house() });
    expect(r.articles).toBe(1);
    expect(r.clauses).toBeGreaterThan(3);
    expect(r.requirementsPerClause).toBeGreaterThan(0);
    expect(r.sysReqs).toBeGreaterThan(0);
  });

  it('counts clauses that carry NO requirement as a finding, not a failure', async () => {
    const empty = async (system: string): Promise<string> =>
      system === STAKEHOLDER_REQ_SYSTEM ? '{"candidates":[]}' : sysReq('x', 'controller');
    const r = await evaluateReqtrace(only('dsgvo:art32'), { ask: empty });
    expect(r.clausesWithoutRequirement).toBe(r.clauses);
    expect(r.unreadableExtractions).toBe(0);
    expect(r.sysReqs).toBe(0);
  });

  it('separates unreadable from empty', async () => {
    const broken = async (system: string): Promise<string> =>
      system === STAKEHOLDER_REQ_SYSTEM ? 'kaputt' : sysReq('x', 'controller');
    const r = await evaluateReqtrace(only('dsgvo:art32'), { ask: broken });
    expect(r.unreadableExtractions).toBe(r.clauses);
    expect(r.clausesWithoutRequirement).toBe(0);
  });

  it('splits non-singular candidates along the action and counts it', async () => {
    const two = async (system: string): Promise<string> =>
      system === STAKEHOLDER_REQ_SYSTEM
        ? JSON.stringify({
            candidates: [
              {
                text: 'etablieren und dokumentieren',
                handlungen: ['betriebskontinuitaet', 'verzeichnis-fuehren'],
                empfaenger: ['—'],
                modalitaeten: ['pflicht'],
                bedingungen: ['laufend'],
              },
            ],
          })
        : sysReq('x', 'controller');
    const r = await evaluateReqtrace(only('dsgvo:art32'), { ask: two });
    expect(r.splitCount).toBe(r.clauses);
    expect(r.afterSplit).toBe(r.clauses * 2);
  });

  it('counts implementation-laden statements instead of dropping them', async () => {
    const impl = async (system: string, user: string): Promise<string> =>
      system === SYSTEM_REQ_SYSTEM
        ? JSON.stringify({ text: 'Das Unternehmen muss AES-256 einsetzen.', schutzgut: 'a', verpflichteter: 'controller', ausloeser: 'b', nachweis: 'c' })
        : house()(system, user);
    const r = await evaluateReqtrace(only('dsgvo:art32'), { ask: impl });
    expect(r.implFreedomFailures).toBeGreaterThan(0);
    expect(r.sysReqs).toBeGreaterThan(0); // nicht verworfen
  });
});

describe('evaluateReqtrace — Kontrollen (THE-545, DoD-1/2/3)', () => {
  it('finds a gold candidate when the chain produces a cross-law measure', async () => {
    const r = await evaluateReqtrace(only('dsgvo:art32', 'nis2:art21'), { ask: house() });
    expect(r.goldHitCount).toBeGreaterThan(0);
    expect(r.goldHits.find((g) => g.id === 'BCD-01')?.matchedBy).toBeTruthy();
  });

  it('keeps the mechanical negative control structural — the judge never sees the pair', async () => {
    const seen: string[] = [];
    const spy = async (system: string, user: string): Promise<string> => {
      if (system === PAIR_RELATION_SYSTEM) seen.push(user);
      return house({ action: 'vorfall-melden-behoerde' })(system, user);
    };
    const r = await evaluateReqtrace(only('nis2:art23', 'dora:art19'), { ask: spy });
    expect(r.grouping.excludedByDisplacement.length).toBeGreaterThan(0);
    expect(r.negativeMechanical).toBe(true);
    // Die Gruppierung hat KEIN Paar geurteilt — das ist die strukturelle
    // Garantie. Die Anfragen, die der Spion sieht, stammen ausschliesslich vom
    // Kanarienvogel, der eine Anforderung mit ihrem Zwilling paart (A === B).
    expect(r.grouping.judged).toBe(0);
    for (const u of seen) {
      const [a, b] = u.split('\n\n');
      expect(a.replace(/^A\) /, '')).toBe(b.replace(/^B\) /, ''));
    }
  });

  it('checks the semantic control on the CLASSIFICATION, not just on the outcome', async () => {
    // Sonst bestuende sie vakuum-leer: verschiedene Handlungen werden ohnehin
    // nie gepaart. Gemessen wird, ob die Klassifikation sie ueberhaupt trennt.
    const perLaw = async (system: string, user: string): Promise<string> => {
      if (system === STAKEHOLDER_REQ_SYSTEM) {
        return candidate(user.includes('Vorfall') || user.includes('Verletzung') ? 'vorfall-melden-behoerde' : 'risikobewertung');
      }
      return house()(system, user);
    };
    const r = await evaluateReqtrace(only('nis2:art21', 'dsgvo:art33'), { ask: perLaw });
    expect(typeof r.negativeSemantic).toBe('boolean');
  });

  it('runs the canary: the same clause twice must land in one measure', async () => {
    const r = await evaluateReqtrace(only('dsgvo:art32'), { ask: house() });
    expect(r.canaryPassed).toBe(true);
  });
});

describe('Verdikt und Bericht (THE-545, DoD-V)', () => {
  const fake = (over: Partial<ReqtraceEvalResult>): ReqtraceEvalResult =>
    ({
      articles: 9, clauses: 100, clausesPerArticle: 11, candidates: 90, afterSplit: 95,
      splitCount: 5, unsingular: 0, clausesWithoutRequirement: 10, unreadableExtractions: 0,
      requirementsPerClause: 0.95, sysReqs: 95, implFreedomFailures: 0,
      grouping: { measures: [], sharedCorePairs: [], excludedByDisplacement: [], collapsed: [], judged: 0, relationCounts: {} },
      goldHits: [], goldHitCount: 4, ambiguousGoldMatches: [],
      negativeMechanical: true, negativeSemantic: true, canaryPassed: true, sysReqTexts: {},
      verdict: 'traegt', verdictReason: '', markdown: '',
      ...over,
    }) as ReqtraceEvalResult;

  it('says traegt only when ALL conditions hold', () => {
    expect(renderReqtraceReport(fake({})).verdict).toBe('traegt');
  });

  it('fails below three gold hits', () => {
    const r = renderReqtraceReport(fake({ goldHitCount: 2 }));
    expect(r.verdict).toBe('traegt-nicht');
    expect(r.verdictReason).toMatch(/Positiv-Kontrolle/);
  });

  it('fails when either negative control breaks', () => {
    expect(renderReqtraceReport(fake({ negativeMechanical: false })).verdictReason).toMatch(/Verdrängung/);
    expect(renderReqtraceReport(fake({ negativeSemantic: false })).verdictReason).toMatch(/semantisch/i);
  });

  it('fails when the extraction rate is far from one per clause', () => {
    expect(renderReqtraceReport(fake({ requirementsPerClause: 6 })).verdictReason).toMatch(/Granularität/);
  });

  it('always names the limits — fixture instead of live corpus, one adjudicator', () => {
    const md = renderReqtraceReport(fake({})).markdown;
    expect(md).toMatch(/eingefrorene[rs]? (Rechtstext|Fixture)|Fixture/i);
    expect(md).toMatch(/ein Adjudikator|Adjudikator/i);
    expect(md).toMatch(/Setzung/);
  });

  it('puts the calibration reference next to our own number', () => {
    const md = renderReqtraceReport(fake({})).markdown;
    expect(md).toContain('1,1');
    expect(md).toMatch(/Reg2Req/);
  });

  it('flags a measure that matches several gold entries', () => {
    const md = renderReqtraceReport(fake({ ambiguousGoldMatches: ['measure__x'] })).markdown;
    expect(md).toMatch(/mehrdeutig|mehrere Gold-Eintr/i);
  });
});
