/**
 * Tests für die Messung von THE-547.
 *
 * Die tragende Eigenschaft: **der Filter darf nur wegnehmen.** Jede Maßnahme
 * dieser Auswertung muss eine Maßnahme aus Lauf 4 sein — entstünde hier eine
 * neue, wäre es kein Nachrechnen mehr, sondern ein zweiter Lauf ohne Kontrollen.
 */
import {
  evaluateCapability,
  survivesCapabilityFilter,
  renderCapabilityReport,
  MIN_REJECTIONS_REMOVED,
  MAX_ACCEPTS_LOST,
  MIN_GOLD_HITS,
  type CapabilityEvalInput,
} from '../scripts/reqtrace-capability-eval';
import { distinctObjects, parseCatalog, compressionRatio } from '../scripts/reqtrace-object-catalog';
import { OBJECT_UNSTATED } from '@thearchitect/shared';

const A = 'dsgvo:art32:c01:q1s1';
const B = 'nis2:art21:c02:q1s1';

const input = (over: Partial<CapabilityEvalInput> = {}): CapabilityEvalInput => ({
  run: {
    sysReqActions: { [A]: 'betriebskontinuitaet', [B]: 'betriebskontinuitaet' },
    grouping: {
      measures: [{ id: 'm1', memberIds: [A, B], laws: ['dsgvo', 'nis2'] }],
      sharedCorePairs: [],
    },
  },
  objects: { [A]: 'Geschäftsprozess', [B]: 'Geschäftsprozess' },
  human: { m1: true },
  ...over,
});

describe('survivesCapabilityFilter', () => {
  it('keeps a group when object AND action match', () => {
    expect(survivesCapabilityFilter([A, B], input())).toBe(true);
  });

  it('splits a group when the action matches but the object differs', () => {
    // Genau das Muster aller zehn Ablehnungen aus THE-545.
    expect(
      survivesCapabilityFilter([A, B], input({ objects: { [A]: 'Geschäftsprozess', [B]: 'personenbezogene Daten' } })),
    ).toBe(false);
  });

  it('splits when an object is missing — never merges the undeterminable', () => {
    expect(survivesCapabilityFilter([A, B], input({ objects: { [A]: 'Vorfall', [B]: null } }))).toBe(false);
    expect(
      survivesCapabilityFilter([A, B], input({ objects: { [A]: OBJECT_UNSTATED, [B]: OBJECT_UNSTATED } })),
    ).toBe(false);
  });

  it('is false for a single member — one requirement is no shared measure', () => {
    expect(survivesCapabilityFilter([A], input())).toBe(false);
  });
});

describe('evaluateCapability', () => {
  it('counts a resolved rejection', () => {
    const r = evaluateCapability(
      input({ human: { m1: false }, objects: { [A]: 'Vorfall', [B]: 'Begründung' } }),
    );
    expect(r.rejectionsRemoved).toBe(1);
    expect(r.rejectionsTotal).toBe(1);
    expect(r.agreement).toBe(1);
  });

  it('counts a lost accept — the price side of the ledger', () => {
    const r = evaluateCapability(input({ objects: { [A]: 'Vorfall', [B]: 'Begründung' } }));
    expect(r.acceptsLost).toBe(1);
    expect(r.agreement).toBe(0);
  });

  it('ignores measures the human left unsure instead of guessing', () => {
    const r = evaluateCapability(input({ human: { m1: null } }));
    expect(r.acceptsTotal + r.rejectionsTotal).toBe(0);
  });

  it('NEVER produces a measure that was not in the run', () => {
    // Zwei perfekt passende Anforderungen, die der Lauf nie gepaart hat.
    const r = evaluateCapability(
      input({
        run: {
          sysReqActions: { [A]: 'x', [B]: 'x' },
          grouping: { measures: [], sharedCorePairs: [] },
        },
        human: {},
      }),
    );
    expect(r.survivingMeasures).toBe(0);
    expect(r.goldHitCount).toBe(0);
  });

  it('reports the agreement before the filter as the share of accepts', () => {
    const r = evaluateCapability(
      input({
        run: {
          sysReqActions: { [A]: 'a', [B]: 'a', c: 'a', d: 'a' },
          grouping: {
            measures: [
              { id: 'm1', memberIds: [A, B], laws: ['dsgvo', 'nis2'] },
              { id: 'm2', memberIds: ['c', 'd'], laws: ['dsgvo', 'nis2'] },
            ],
            sharedCorePairs: [],
          },
        },
        objects: { [A]: 'X', [B]: 'X', c: 'Y', d: 'Y' },
        human: { m1: true, m2: false },
      }),
    );
    expect(r.agreementBefore).toBe(0.5);
  });

  it('fails the verdict when too few rejections dissolve', () => {
    const r = evaluateCapability(input({ human: { m1: false } }));
    expect(r.verdict).toBe('traegt-nicht');
    expect(r.verdictReason).toMatch(/nicht die Ursache/);
  });

  it('fails the verdict when the object splits the accepts too — over-segmented', () => {
    const many: CapabilityEvalInput = {
      run: {
        sysReqActions: {},
        grouping: { measures: [], sharedCorePairs: [] },
      },
      objects: {},
      human: {},
    };
    for (let i = 0; i < 10; i++) {
      const a = `dsgvo:x${i}`;
      const b = `nis2:x${i}`;
      many.run.sysReqActions[a] = 'act';
      many.run.sysReqActions[b] = 'act';
      many.objects[a] = `objA${i}`;
      many.objects[b] = `objB${i}`; // immer verschieden → alles zerfaellt
      many.run.grouping.measures.push({ id: `m${i}`, memberIds: [a, b], laws: ['dsgvo', 'nis2'] });
      many.human[`m${i}`] = true; // alle angenommen
    }
    const r = evaluateCapability(many);
    expect(r.acceptsLost).toBe(10);
    expect(r.verdict).toBe('traegt-nicht');
    expect(r.verdictReason).toMatch(/über-segmentiert/);
  });
});

describe('thresholds', () => {
  it('are the ones written into THE-547 before any number existed', () => {
    expect(MIN_REJECTIONS_REMOVED).toBe(8);
    expect(MAX_ACCEPTS_LOST).toBe(3);
    expect(MIN_GOLD_HITS).toBe(4);
  });
});

describe('renderCapabilityReport', () => {
  it('names the value space used — raw values and a catalog are not the same claim', () => {
    const md = renderCapabilityReport(evaluateCapability(input()), '**Rohwerte** (223), ungeclustert');
    expect(md).toContain('Rohwerte');
    expect(md).toMatch(/Filter.*nur wegnehmen|kann Paare nur wegnehmen/);
  });
});

describe('object catalog helpers', () => {
  it('dedupes case-insensitively and drops the undeterminable marker', () => {
    expect(distinctObjects({ a: 'Vorfall', b: 'vorfall', c: OBJECT_UNSTATED, d: null })).toEqual(['Vorfall']);
  });

  it('parses a catalog and rejects a malformed entry outright', () => {
    expect(parseCatalog('{"vokabular":[{"id":"vorfall","label":"Vorfall","description":"…"}]}')?.vokabular).toHaveLength(
      1,
    );
    for (const bad of ['{"vokabular":[]}', '{"vokabular":[{"id":"x"}]}', 'kaputt', '{"x":1}']) {
      expect(parseCatalog(bad)).toBeNull();
    }
  });

  it('reports the compression ratio without enforcing it', () => {
    expect(compressionRatio(223, 30)).toBeCloseTo(7.43, 1);
    expect(compressionRatio(10, 0)).toBe(0);
  });
});
