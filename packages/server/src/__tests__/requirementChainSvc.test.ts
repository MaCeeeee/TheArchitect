/**
 * Tests für requirementChain.service (THE-561/THE-562, Phase 1 von ADR-0008).
 *
 * DIE REGEL DES SERVICES: er orchestriert die shared-Bausteine (Prompts,
 * Parser, Singularitätstor, ImplFreedom-Lexikon, Fristparser) und ZÄHLT jede
 * Auffälligkeit, statt sie still zu schlucken — unlesbar, aufgeteilt, ohne
 * Anforderung, implementierungsgebunden. Alle Tests laufen mit Stub-`ask`,
 * kein LLM in CI.
 */
import { deriveChain, type ChainClauseInput } from '../services/requirementChain.service';
import { STAKEHOLDER_REQ_SYSTEM } from '@thearchitect/shared';

const clause = (over: Partial<ChainClauseInput> = {}): ChainClauseInput => ({
  contentId: 'a3f19b2c4d5e6f70',
  positionalId: 'nis2:art23:c04',
  path: 'Abs. 3',
  text: 'Die Einrichtungen übermitteln binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.',
  ...over,
});

// Der Parser erwartet {"candidates": [...]} mit kanonischen Modalitäten
// (pflicht | verbot | erlaubnis) und leitet `kind` selbst ab.
const candidate = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  text: 'Das Unternehmen übermittelt eine Meldung an das CSIRT.',
  handlungen: ['Meldung übermitteln'],
  empfaenger: ['CSIRT'],
  modalitaeten: ['pflicht'],
  bedingungen: ['nach Kenntnisnahme'],
  ...over,
});

const extraction = (...cands: Record<string, unknown>[]): string => JSON.stringify({ candidates: cands });

const sysReqAnswer = (text = 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht an die zuständige Stelle.'): string =>
  JSON.stringify({
    text,
    schutzgut: 'Netz- und Informationssysteme',
    verpflichteter: 'wesentliche Einrichtung',
    ausloeser: 'erheblicher Sicherheitsvorfall',
    nachweis: 'Meldung an das CSIRT',
  });

/** Stub: Stufe 1 (Extraktion) antwortet aus der Map, Stufe 2 liefert sysReqAnswer. */
const stubAsk = (extraction: string, sysReq: string = sysReqAnswer()) =>
  async (system: string): Promise<string> =>
    system === STAKEHOLDER_REQ_SYSTEM ? extraction : sysReq;

describe('deriveChain — Quoten nie still', () => {
  it('derives one StR + one SysReq from a singular candidate, deadline from the clause text', async () => {
    const r = await deriveChain([clause()], { ask: stubAsk(extraction(candidate())) });
    expect(r.items).toHaveLength(1);
    const item = r.items[0];
    expect(item.candidate.kind).toBe('requirement');
    expect(item.deadline).not.toBeNull();
    expect(item.deadline!.bezugspunkt).toBe('kenntnis');
    expect(item.deadline!.dauer).toEqual({ wert: 72, einheit: 'h' });
    expect(item.sysReq).not.toBeNull();
    expect(item.sysReq!.implementationFree).toBe(true);
    expect(r.stats).toEqual({
      clauses: 1,
      unreadableExtractions: 0,
      splitCount: 0,
      clausesWithoutRequirement: 0,
      implFreedomViolations: 0,
      unreadableSysReqs: 0,
    });
  });

  it('splits a non-singular candidate along the action — splitCount counts (THE-561 AC 1)', async () => {
    const twoActions = candidate({ handlungen: ['Konzepte etablieren', 'Konzepte dokumentieren'] });
    const r = await deriveChain([clause()], { ask: stubAsk(extraction(twoActions)) });
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.candidate.handlungen)).toEqual([
      ['Konzepte etablieren'],
      ['Konzepte dokumentieren'],
    ]);
    expect(r.stats.splitCount).toBe(1);
  });

  it('a clause without requirements is a VALID result, counted (THE-561 AC 2)', async () => {
    const r = await deriveChain(
      [clause({ text: 'Diese Verordnung tritt am zwanzigsten Tag nach ihrer Veröffentlichung in Kraft.' })],
      { ask: stubAsk('{"candidates": []}') },
    );
    expect(r.items).toHaveLength(0);
    expect(r.stats.clausesWithoutRequirement).toBe(1);
  });

  it('an unreadable extraction counts and does NOT abort the run', async () => {
    const good = clause({ contentId: 'b3f19b2c4d5e6f71' });
    let call = 0;
    const ask = async (system: string): Promise<string> => {
      if (system === STAKEHOLDER_REQ_SYSTEM) {
        call += 1;
        return call === 1 ? 'GARBAGE not json' : extraction(candidate());
      }
      return sysReqAnswer();
    };
    const r = await deriveChain([clause(), good], { ask });
    expect(r.stats.unreadableExtractions).toBe(1);
    expect(r.items).toHaveLength(1); // die zweite Klausel lief durch
  });

  it('an implementation-bound SysReq is KEPT with the flag and counted — never silently dropped', async () => {
    const r = await deriveChain([clause()], {
      ask: stubAsk(extraction(candidate()), sysReqAnswer('Das Unternehmen betreibt Kubernetes für Meldungen.')),
    });
    expect(r.items[0].sysReq).not.toBeNull();
    expect(r.items[0].sysReq!.implementationFree).toBe(false);
    expect(r.stats.implFreedomViolations).toBe(1);
  });

  it('no deadline in the clause → no invented deadline object (THE-561 AC 3)', async () => {
    const r = await deriveChain(
      [clause({ text: 'Die Einrichtungen benennen eine zentrale Kontaktstelle.' })],
      { ask: stubAsk(extraction(candidate())) },
    );
    expect(r.items[0].deadline).toBeNull();
  });

  it('a prohibition arrives as constraint — kind flows through from the extraction (THE-561 AC 4)', async () => {
    const prohibition = candidate({ modalitaeten: ['verbot'] });
    const r = await deriveChain([clause()], { ask: stubAsk(extraction(prohibition)) });
    expect(r.items[0].candidate.kind).toBe('constraint');
  });
});
