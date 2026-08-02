/**
 * Tests für den Anschluss von Frage 1 (THE-555):
 * assessNormApplicability × Korpus-Typisierung × LegalProfile.
 *
 * Beide Enden existieren seit THE-548 (Kundenseite) und THE-540 Achse 1
 * (Norm-Seite, Hausregel) — dieser Dienst ist NUR das Gelenk. Er erfindet
 * keine Rollen, dupliziert keine Hausregel und beantwortet die Frage im
 * Format der Zweckklärung: „betrifft dich in Rolle X → N von M getypten
 * Normsätzen".
 */
import {
  buildProjectLegalApplicability,
  LEGAL_APPLICABILITY_DISCLAIMER,
  normalizeCorpusSource,
  pickExpression,
  aggregateTypedRoles,
  assessLawsForProfile,
  type TypedCorpusSummary,
} from '../services/legalApplicability.service';
import type { LegalProfile } from '@thearchitect/shared';

// ── Fixture: Korpus-Zusammenfassungen wie von Server B ───────────────────
const doc = (
  source: string,
  key: string,
  role: string | null,
  over: Partial<TypedCorpusSummary> = {},
): TypedCorpusSummary => ({
  regulationKey: key,
  source,
  versionHash: 'h1',
  typing: role === null ? undefined : { partyRole: role, status: 'suggested', versionHash: 'h1', ontologyVersion: '1.7.0' },
  ...over,
});

const CORPUS: TypedCorpusSummary[] = [
  // dora: bar + -de Variante — nur EINE darf zählen
  doc('dora', 'dora:art-5', 'financial_entity'),
  doc('dora', 'dora:art-6', 'financial_entity'),
  doc('dora', 'dora:art-99', null), // ungetypt — zählt in total, nicht in typed
  doc('dora-de', 'dora-de:art-5', 'financial_entity'),
  // nis2: nur -de
  doc('nis2-de', 'nis2-de:art-21', 'essential_important_entity'),
  doc('nis2-de', 'nis2-de:art-23', 'essential_important_entity'),
  // dsgvo: bar, zwei Rollen
  doc('dsgvo', 'dsgvo:art-32', 'controller'),
  doc('dsgvo', 'dsgvo:art-28', 'processor'),
  // mdr: nur -en, bindet manufacturer
  doc('mdr-en', 'mdr-en:art-10', 'manufacturer'),
  // lksg: komplett ungetypt → norm-seitig unbekannt
  doc('lksg', 'lksg:para-3', null),
  // Hausregel-Fälle: rejected + stale dürfen NICHT zählen
  doc('dsgvo', 'dsgvo:art-83', 'supervisory_authority', {
    typing: { partyRole: 'supervisory_authority', status: 'rejected', versionHash: 'h1', ontologyVersion: '1.7.0' },
  }),
  doc('dsgvo', 'dsgvo:art-30', 'controller', {
    versionHash: 'h2',
    typing: { partyRole: 'controller', status: 'suggested', versionHash: 'h1', ontologyVersion: '1.7.0' },
  }),
];

const BANK: LegalProfile = { addresseeClasses: ['controller', 'financial_entity'] };

describe('normalizeCorpusSource', () => {
  it('folds language variants onto one law', () => {
    expect(normalizeCorpusSource('dora')).toBe('dora');
    expect(normalizeCorpusSource('dora-de')).toBe('dora');
    expect(normalizeCorpusSource('mdr-en')).toBe('mdr');
    expect(normalizeCorpusSource('ai-act-de')).toBe('ai-act');
  });

  it('does not mangle laws whose name is no variant suffix', () => {
    expect(normalizeCorpusSource('lksg')).toBe('lksg');
    expect(normalizeCorpusSource('data-act-en')).toBe('data-act');
  });
});

describe('pickExpression — eine Sprachfassung je Gesetz, sonst zählt alles doppelt', () => {
  it('prefers bare > -de > -en', () => {
    expect(pickExpression(['dora-de', 'dora'])).toBe('dora');
    expect(pickExpression(['nis2-de'])).toBe('nis2-de');
    expect(pickExpression(['mdr-en', 'mdr-de'])).toBe('mdr-de');
    expect(pickExpression(['mdr-en'])).toBe('mdr-en');
  });
});

describe('aggregateTypedRoles', () => {
  const byLaw = aggregateTypedRoles(CORPUS);

  it('counts ONE expression per law — dora-de does not inflate dora', () => {
    const dora = byLaw.get('dora')!;
    expect(dora.expression).toBe('dora');
    expect(dora.provisionsTotal).toBe(3); // art-5, art-6, art-99 — ohne dora-de
    expect(dora.provisionsTyped).toBe(2);
    expect(dora.roleCounts.get('financial_entity')).toBe(2);
  });

  it('applies the Hausregel — rejected and stale count as absent', () => {
    const dsgvo = byLaw.get('dsgvo')!;
    // art-32 (controller) + art-28 (processor); art-83 rejected, art-30 stale
    expect(dsgvo.provisionsTotal).toBe(4);
    expect(dsgvo.provisionsTyped).toBe(2);
    expect(dsgvo.roleCounts.get('supervisory_authority')).toBeUndefined();
  });

  it('keeps an untyped law visible with zero typed provisions', () => {
    const lksg = byLaw.get('lksg')!;
    expect(lksg.provisionsTyped).toBe(0);
    expect(lksg.provisionsTotal).toBe(1);
  });
});

describe('assessLawsForProfile — die Vier-Zustands-Antwort je Gesetz', () => {
  const rows = assessLawsForProfile(BANK, aggregateTypedRoles(CORPUS));
  const row = (law: string) => rows.find((r) => r.law === law)!;

  it('Bank × dora → applicable, im Format „N von M getypten Normsätzen"', () => {
    const r = row('dora');
    expect(r.state).toBe('applicable');
    expect(r.provisionsBinding).toBe(2);
    expect(r.provisionsTyped).toBe(2);
    expect(r.matchedRoles).toEqual(['financial_entity']);
  });

  it('Bank × nis2 → displaced, das Zitat wandert mit', () => {
    const r = row('nis2');
    expect(r.state).toBe('displaced');
    expect(r.prevailingSource).toBe('dora');
    expect(r.citations?.join(' ')).toMatch(/Art\. 1/);
  });

  it('Bank × dsgvo → applicable über controller — von der Verdrängung unberührt', () => {
    const r = row('dsgvo');
    expect(r.state).toBe('applicable');
    expect(r.provisionsBinding).toBe(1); // nur art-32 (controller); art-28 bindet processor
    expect(r.matchedRoles).toEqual(['controller']);
  });

  it('Bank × mdr → not_applicable, mit den Rollen, die fehlen', () => {
    const r = row('mdr');
    expect(r.state).toBe('not_applicable');
    expect(r.missingRoles).toContain('manufacturer');
  });

  it('Bank × lksg → undetermined: Norm-Seite unbekannt ist NICHT „bindet niemanden"', () => {
    expect(row('lksg').state).toBe('undetermined');
  });

  it('without a profile every law is undetermined — Frage 1 bleibt ehrlich unbeantwortet', () => {
    const bare = assessLawsForProfile(undefined, aggregateTypedRoles(CORPUS));
    expect(bare.length).toBeGreaterThan(0);
    for (const r of bare) expect(r.state).toBe('undetermined');
  });

  it('sorts applicable first, then displaced, then the rest — the answer before the noise', () => {
    const states = rows.map((r) => r.state);
    const firstNonApplicable = states.findIndex((s) => s !== 'applicable');
    expect(states.slice(0, firstNonApplicable).every((s) => s === 'applicable')).toBe(true);
  });
});


describe('buildProjectLegalApplicability — Korpus-Ausfall ist ein Zustand, keine leere Liste', () => {
  it('marks the corpus unavailable instead of pretending "nothing applies"', async () => {
    const r = await buildProjectLegalApplicability(BANK, async () => {
      throw new Error('tailnet down');
    });
    expect(r.corpus).toBe('unavailable');
    expect(r.laws).toEqual([]);
    expect(r.profilePresent).toBe(true);
  });

  it('assesses against the fetched corpus when reachable', async () => {
    const r = await buildProjectLegalApplicability(BANK, async () => CORPUS);
    expect(r.corpus).toBe('ok');
    expect(r.laws.find((l) => l.law === 'dora')?.state).toBe('applicable');
    expect(r.laws.find((l) => l.law === 'nis2')?.state).toBe('displaced');
  });

  it('always carries the disclaimer — an evidenced estimate, not legal advice', async () => {
    const r = await buildProjectLegalApplicability(undefined, async () => CORPUS);
    expect(r.disclaimer).toBe(LEGAL_APPLICABILITY_DISCLAIMER);
    expect(r.profilePresent).toBe(false);
  });
});
