/**
 * Tests für chainGenerate.service (THE-561/THE-562, Phase 1 von ADR-0008):
 * die Kette hinter dem Generator-Endpoint — Preview-Mapping + Persistenz.
 *
 * ZWEI REGELN:
 *   1. Kein Element-Vorschlag aus der Kette: `linkedElementIds` bleibt leer —
 *      die Ebene ist eine Eigenschaft der Landschaft, nicht der Handlung
 *      (THE-551, 51,2 % vs 70 %).
 *   2. Verstöße verschwinden nie still: implementierungsgebundene und
 *      unlesbare Items fehlen in den Kandidaten, stehen aber in den Quoten.
 */
import { chainPreview } from '../services/chainGenerate.service';
import { STAKEHOLDER_REQ_SYSTEM } from '@thearchitect/shared';

const CLAUSE_TEXT =
  '(1) Die Einrichtungen übermitteln binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.';

const extraction = (...cands: Record<string, unknown>[]): string => JSON.stringify({ candidates: cands });

const candidate = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  text: 'Das Unternehmen übermittelt eine Meldung an das CSIRT.',
  handlungen: ['Meldung übermitteln'],
  empfaenger: ['CSIRT'],
  modalitaeten: ['pflicht'],
  bedingungen: ['nach Kenntnisnahme'],
  ...over,
});

const sysReqAnswer = (text = 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht an die zuständige Stelle.'): string =>
  JSON.stringify({
    text,
    schutzgut: 'Netz- und Informationssysteme',
    verpflichteter: 'wesentliche Einrichtung',
    ausloeser: 'erheblicher Sicherheitsvorfall',
    nachweis: 'Meldung an das CSIRT',
  });

const stubAsk = (ext: string, sys: string = sysReqAnswer()) =>
  async (system: string): Promise<string> => (system === STAKEHOLDER_REQ_SYSTEM ? ext : sys);

describe('chainPreview — Kandidaten fürs Modal, Quoten in der Antwort', () => {
  const args = { text: CLAUSE_TEXT, source: 'nis2', paragraphNumber: 'Art. 23', regulationKey: 'nis2:art23' };

  it('maps a chain item to the candidate DTO — empty linkedElementIds (THE-551), sysReq text as description', async () => {
    const r = await chainPreview({ ...args, ask: stubAsk(extraction(candidate())) });
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    expect(c.title).toBe('Meldung übermitteln');
    expect(c.description).toMatch(/meldet Sicherheitsvorfälle/);
    expect(c.priority).toBe('must');
    expect(c.linkedElementIds).toEqual([]);
    expect(c.chain.clauseContentId).toMatch(/^[0-9a-f]{16}$/);
    expect(c.chain.regulationKey).toBe('nis2:art23');
    expect(c.chain.stakeholderRequirement.kind).toBe('requirement');
    expect(c.chain.stakeholderRequirement.deadline?.bezugspunkt).toBe('kenntnis');
    expect(c.chain.systemRequirement.implementationFree).toBe(true);
  });

  it('a prohibition becomes priority must with kind constraint', async () => {
    const r = await chainPreview({
      ...args,
      ask: stubAsk(extraction(candidate({ modalitaeten: ['verbot'] }))),
    });
    expect(r.candidates[0].chain.stakeholderRequirement.kind).toBe('constraint');
    expect(r.candidates[0].priority).toBe('must');
  });

  it('an implementation-bound sysReq is EXCLUDED from candidates but visible in stats', async () => {
    const r = await chainPreview({
      ...args,
      ask: stubAsk(extraction(candidate()), sysReqAnswer('Das Unternehmen betreibt Kubernetes.')),
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.stats.implFreedomViolations).toBe(1);
  });

  it('carries the chain stats through — the quotas live in the response', async () => {
    const r = await chainPreview({ ...args, ask: stubAsk('{"candidates": []}') });
    expect(r.candidates).toHaveLength(0);
    expect(r.stats.clausesWithoutRequirement).toBeGreaterThanOrEqual(1);
  });
});
