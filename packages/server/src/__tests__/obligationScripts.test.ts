/**
 * Tests für die Batch-Skripte (THE-438 Slice 1, Task 5).
 *
 * Geprüft wird alles, was OHNE Datenbank prüfbar ist: Argument-Auflösung, die
 * Zerlegungs-Schleife mit injiziertem Rater, die Vorschlags-Auswertung und die
 * Gruppierung. Nicht abgedeckt ist die Mongo-Abfrage in `loadObligations` —
 * die braucht eine laufende Instanz.
 */
import { arg, decomposeAll } from '../scripts/obligation-slots';
import { uniqueActionPhrases, parseProposal } from '../scripts/derive-action-catalog';
import { crossLawGroups } from '../scripts/classify-obligations';
import type { RaterClient } from '../evals/raterClient';
import type { ObligationRef } from '@thearchitect/shared';

const obl = (law: string, para: string): ObligationRef => ({
  law,
  para,
  title: `${law} ${para}`,
  text: 'Der Verantwortliche meldet die Verletzung binnen 72 Stunden.',
});

const fakeClient = (replies: string[]): RaterClient => {
  let i = 0;
  return {
    provider: 'anthropic',
    model: 'test',
    complete: async () => ({ text: replies[i++] ?? '', inputTokens: 0, outputTokens: 0 }),
  };
};

const GOOD = '{"handlung":"Vorfall melden","adressat":"Verantwortlicher","modalitaet":"pflicht","bedingung":"72h"}';

describe('arg (THE-438)', () => {
  it('reads a flag value and returns undefined when absent', () => {
    expect(arg(['--project', 'abc', '--limit', '5'], '--project')).toBe('abc');
    expect(arg(['--project', 'abc'], '--out')).toBeUndefined();
  });

  it('returns undefined for a trailing flag without a value', () => {
    expect(arg(['--project'], '--project')).toBeUndefined();
  });
});

describe('decomposeAll (THE-438)', () => {
  it('collects successful decompositions', async () => {
    const { records, failed } = await decomposeAll([obl('DSGVO', 'Art. 33')], fakeClient([GOOD]));
    expect(records).toHaveLength(1);
    expect(records[0].slots.handlung).toBe('Vorfall melden');
    expect(failed).toHaveLength(0);
  });

  it('reports unparseable obligations instead of silently dropping them', async () => {
    // Stille Ausfaelle verschwinden aus der Ableitungs-Grundlage und schoenen
    // die Abdeckung, ohne dass es jemand sieht.
    const { records, failed } = await decomposeAll(
      [obl('DSGVO', 'Art. 33'), obl('NIS2', 'Art. 23')],
      fakeClient([GOOD, 'kaputt']),
    );
    expect(records).toHaveLength(1);
    expect(failed.map((f) => f.law)).toEqual(['NIS2']);
  });

  it('keeps the obligation identity on the record for later join-back', async () => {
    const { records } = await decomposeAll([obl('DORA', 'Art. 19')], fakeClient([GOOD]));
    expect(records[0]).toMatchObject({ law: 'DORA', para: 'Art. 19' });
  });
});

describe('uniqueActionPhrases (THE-438)', () => {
  it('deduplicates the free phrasings — they are the derivation input', async () => {
    const { records } = await decomposeAll(
      [obl('DSGVO', 'a'), obl('NIS2', 'b')],
      fakeClient([GOOD, GOOD]),
    );
    expect(uniqueActionPhrases(records)).toEqual(['Vorfall melden']);
  });
});

describe('parseProposal (THE-438)', () => {
  it('parses a proposal and survives fenced JSON', () => {
    const raw = '```json\n{"vokabular":[{"id":"x","label":"X","description":"lang genug"}],"anmerkung":"ok"}\n```';
    expect(parseProposal(raw)?.vokabular).toHaveLength(1);
  });

  it('rejects an empty vocabulary instead of writing a useless proposal', () => {
    expect(parseProposal('{"vokabular":[],"anmerkung":"nichts"}')).toBeNull();
    expect(parseProposal('keine Ahnung')).toBeNull();
  });

  it('defaults the note rather than failing on it', () => {
    expect(parseProposal('{"vokabular":[{"id":"x","label":"X","description":"d"}]}')?.anmerkung).toBe('');
  });
});

describe('crossLawGroups (THE-438)', () => {
  const rec = (law: string, actionId: string | null) => ({
    ...obl(law, 'x'),
    actionId,
    unparseable: false,
    ontologyVersion: '1.8.0',
  });

  it('reports only actions carrying obligations from more than one law', () => {
    const groups = crossLawGroups([
      rec('DSGVO', 'vorfall-melden-behoerde'),
      rec('NIS2', 'vorfall-melden-behoerde'),
      rec('DSGVO', 'zugriffskontrolle'),
      rec('DSGVO', 'zugriffskontrolle'),
    ]);
    expect(groups.map((g) => g.actionId)).toEqual(['vorfall-melden-behoerde']);
    expect(groups[0].laws.sort()).toEqual(['DSGVO', 'NIS2']);
  });

  it('ignores unassigned obligations rather than grouping them under null', () => {
    expect(crossLawGroups([rec('DSGVO', null), rec('NIS2', null)])).toEqual([]);
  });

  it('sorts by breadth first, then by weight', () => {
    const groups = crossLawGroups([
      rec('DSGVO', 'a'), rec('NIS2', 'a'),
      rec('DSGVO', 'b'), rec('NIS2', 'b'), rec('DORA', 'b'),
    ]);
    expect(groups.map((g) => g.actionId)).toEqual(['b', 'a']);
  });
});
