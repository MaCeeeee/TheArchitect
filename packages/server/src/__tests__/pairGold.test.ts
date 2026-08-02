/**
 * Tests für das menschliche Gold des typisierten Paar-Richters
 * (THE-382 Slice 1, Task 3).
 *
 * Der Zweck des ganzen Slice ist ein ANKER: alle bisherigen Kappa-Werte messen
 * Übereinstimmung zwischen Modellen, und drei Häuser können sich einig und
 * gemeinsam falsch sein. Damit dieser Anker trägt, muss das Gold dieselbe Frage
 * beantworten wie der Richter — dieselben vier Typen, dieselbe Blendung.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PairGoldSchema,
  loadPairGold,
  samplePairs,
  unsureRate,
  relationDistribution,
  findDuplicateCaseIds,
} from '../evals/pairGold';
import type { ActionGoldenSet, ActionGoldenCase } from '../evals/actionGolden';

const valid = {
  version: 'actions.human.v1',
  sourceSet: 'actions.v1',
  annotator: 'ea-1',
  blinded: true,
  verdicts: [{ caseId: 'a', relation: 'intersects' as const }],
};

const obl = (t: string) => ({ law: 'DSGVO', para: 'Art. 32', title: t, text: `${t} — Volltext.` });

function mkSet(t: number, k: number): ActionGoldenSet {
  const cases: ActionGoldenCase[] = [];
  for (let i = 0; i < t; i++) {
    cases.push({ id: `t-${String(i).padStart(2, '0')}`, arm: 'T', a: obl(`A${i}`), b: obl(`B${i}`), actionId: 'x' });
  }
  for (let i = 0; i < k; i++) {
    cases.push({ id: `k-${String(i).padStart(2, '0')}`, arm: 'K', a: obl(`A${i}`), b: obl(`B${i}`), actionId: 'x', actionIdB: 'y' });
  }
  return { version: 'actions.v1', frozen: true, ontologyVersion: '1.8.0', cases };
}

describe('PairGoldSchema (THE-382)', () => {
  it('records a typed relation, not a yes/no', () => {
    expect(PairGoldSchema.safeParse(valid).success).toBe(true);
    expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: true }] }).success).toBe(false);
  });

  it('records the direction with a subset — and rejects one without', () => {
    // Dieselbe Regel wie im Parser: ein richtungsloses subset saehe wie ein
    // Urteil aus, truege aber die halbe Aussage nicht.
    expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: 'subset', wider: 'A' }] }).success).toBe(true);
    expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: 'subset' }] }).success).toBe(false);
  });

  it('rejects a direction where it has no meaning', () => {
    // Eine Richtung bei `equal` taeuscht eine Aussage vor, die niemand
    // getroffen hat — und sie wuerde in `toIr8477` stillschweigend wirkungslos.
    expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: 'equal', wider: 'A' }] }).success).toBe(false);
  });

  it('allows an explicit "unsure" instead of forcing a relation', () => {
    // Ein erzwungenes Urteil taeuscht Gewissheit vor, die der Mensch nicht
    // hatte — derselbe Fehlermodus wie der erzwungene Katalog-Treffer.
    expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: null }] }).success).toBe(true);
  });

  it('records that the human saw the BLINDED rendering', () => {
    expect(Object.keys(PairGoldSchema.shape)).toContain('blinded');
  });

  it('requires the source set so the reference point stays traceable', () => {
    const { sourceSet: _drop, ...without } = valid;
    expect(PairGoldSchema.safeParse(without).success).toBe(false);
  });

  it('requires an annotator — an anonymous anchor cannot be questioned later', () => {
    const { annotator: _drop, ...without } = valid;
    expect(PairGoldSchema.safeParse(without).success).toBe(false);
  });
});

describe('loadPairGold (THE-382)', () => {
  const tmp = (obj: unknown): string => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pairgold-')), 'g.json');
    fs.writeFileSync(p, JSON.stringify(obj));
    return p;
  };

  it('rejects duplicate caseIds', () => {
    expect(findDuplicateCaseIds([{ caseId: 'a', relation: null }, { caseId: 'a', relation: null }])).toEqual(['a']);
    const p = tmp({ ...valid, verdicts: [{ caseId: 'a', relation: null }, { caseId: 'a', relation: 'equal' }] });
    expect(() => loadPairGold(p)).toThrow(/doppelte caseIds/);
  });

  it('refuses an unblinded gold instead of quietly comparing it', () => {
    // Sah der Mensch die Gesetzesnamen und der Richter nicht, ist eine
    // Abweichung doppeldeutig: Urteil oder Informationsvorsprung.
    expect(() => loadPairGold(tmp({ ...valid, blinded: false }))).toThrow(/blinded=false/);
  });

  it('loads a well-formed gold', () => {
    expect(loadPairGold(tmp(valid)).verdicts).toHaveLength(1);
  });
});

describe('Kennzahlen des Golds (THE-382)', () => {
  const gold = {
    ...valid,
    verdicts: [
      { caseId: 'a', relation: 'intersects' as const },
      { caseId: 'b', relation: null },
      { caseId: 'c', relation: 'unrelated' as const },
      { caseId: 'd', relation: 'intersects' as const },
    ],
  };

  it('reports the unsure share so an over-blinded sheet becomes visible', () => {
    expect(unsureRate(gold)).toBeCloseTo(0.25, 6);
  });

  it('counts the four types WITHOUT the unsure ones', () => {
    // Sonst saehe ein zurueckhaltender Adjudikator wie ein entschiedener aus.
    expect(relationDistribution(gold)).toEqual({ equal: 0, subset: 0, intersects: 2, unrelated: 1 });
  });

  it('keeps equal visible as a zero — the number O-5 turns on', () => {
    expect(relationDistribution(gold).equal).toBe(0);
  });
});

describe('samplePairs (THE-382)', () => {
  it('is deterministic — the anchor must not wobble between runs', () => {
    const set = mkSet(40, 20);
    expect(samplePairs(set, 12).map((c) => c.id)).toEqual(samplePairs(set, 12).map((c) => c.id));
  });

  it('is arm-proportional — a T-only sample could never test the negative side', () => {
    const picked = samplePairs(mkSet(40, 20), 12);
    expect(picked.filter((c) => c.arm === 'T')).toHaveLength(8);
    expect(picked.filter((c) => c.arm === 'K')).toHaveLength(4);
  });

  it('draws exactly the requested count', () => {
    expect(samplePairs(mkSet(40, 20), 40)).toHaveLength(40);
  });

  it('never draws the same case twice', () => {
    const ids = samplePairs(mkSet(40, 20), 30).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('caps at what exists instead of padding', () => {
    expect(samplePairs(mkSet(3, 2), 99)).toHaveLength(5);
  });

  it('returns nothing for a non-positive count', () => {
    expect(samplePairs(mkSet(3, 2), 0)).toEqual([]);
  });
});
