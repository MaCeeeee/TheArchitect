/**
 * Tests für die THE-551-Messmechanik: Ist die Ziel-Architekturebene aus der
 * kanonischen Handlung ableitbar?
 *
 * Getestet wird NUR die Mechanik (Parser, Treffer, Verteilungs-Guard) — nicht
 * die Kodier-Tabelle selbst: die ist Messgegenstand, nicht Code.
 */
import {
  parseLayerCoding,
  derivedLayerSet,
  layerHit,
  primaryConcentration,
  meanSetSize,
  CODER_A_TABLE,
  TOGAF_LAYER_ANSWER_SPACE,
} from '../evals/layerDerivability';

describe('parseLayerCoding — Kodierer-B-Antworten robust lesen', () => {
  it('parses a plain JSON coding', () => {
    expect(parseLayerCoding('{"primary":"business","secondary":"application"}')).toEqual({
      primary: 'business',
      secondary: 'application',
    });
  });

  it('parses a fenced JSON coding and one without secondary', () => {
    expect(parseLayerCoding('```json\n{"primary":"data"}\n```')).toEqual({ primary: 'data' });
  });

  it('rejects a layer outside the answer space — no silent invention', () => {
    expect(parseLayerCoding('{"primary":"infrastructure"}')).toBeNull();
    expect(parseLayerCoding('{"primary":"business","secondary":"orga"}')).toBeNull();
  });

  it('drops a secondary equal to the primary — a set has no duplicates', () => {
    expect(parseLayerCoding('{"primary":"business","secondary":"business"}')).toEqual({
      primary: 'business',
    });
  });

  it('returns null on garbage — unlesbar ist ein Lauf-Befund, keine Kodierung', () => {
    expect(parseLayerCoding('the layer is probably business')).toBeNull();
    expect(parseLayerCoding('')).toBeNull();
  });
});

describe('derivedLayerSet + layerHit', () => {
  it('the derived set is {primary, secondary?}', () => {
    expect(derivedLayerSet({ primary: 'business', secondary: 'application' })).toEqual(
      new Set(['business', 'application']),
    );
    expect(derivedLayerSet({ primary: 'data' })).toEqual(new Set(['data']));
  });

  it('hit iff the gold layer is in the derived set', () => {
    const set = derivedLayerSet({ primary: 'business', secondary: 'application' });
    expect(layerHit('application', set)).toBe(true);
    expect(layerHit('technology', set)).toBe(false);
  });
});

describe('Trivialitäts-Guards — eine Ableitung, die alles erlaubt, trifft trivial', () => {
  it('primaryConcentration: share of the most common primary layer', () => {
    expect(
      primaryConcentration([{ primary: 'business' }, { primary: 'business' }, { primary: 'data' }, { primary: 'technology' }]),
    ).toBeCloseTo(0.5);
  });

  it('meanSetSize: average derived-set size', () => {
    expect(
      meanSetSize([{ primary: 'business', secondary: 'application' }, { primary: 'data' }]),
    ).toBeCloseTo(1.5);
  });
});

describe('CODER_A_TABLE — strukturelle Invarianten (nicht der Inhalt)', () => {
  it('covers exactly the 26 canonical actions, each exactly once', () => {
    const { NORM_ONTOLOGY } = require('@thearchitect/shared');
    const catalogIds = NORM_ONTOLOGY.canonicalActions.map((a: { id: string }) => a.id).sort();
    const tableIds = CODER_A_TABLE.map((r) => r.actionId).sort();
    expect(tableIds).toEqual(catalogIds);
  });

  it('every coded layer is inside the answer space, every row has a rationale', () => {
    for (const r of CODER_A_TABLE) {
      expect(TOGAF_LAYER_ANSWER_SPACE).toContain(r.primary);
      if (r.secondary) expect(TOGAF_LAYER_ANSWER_SPACE).toContain(r.secondary);
      expect(r.rationale.length).toBeGreaterThan(10);
    }
  });
});

describe('normalizeGoldLayer — Vokabular-Brücke, kein Weichzeichner', () => {
  const { normalizeGoldLayer } = require('../evals/layerDerivability');

  it('maps the ArchiMate word "information" to the TOGAF domain "data"', () => {
    expect(normalizeGoldLayer('information')).toBe('data');
  });

  it('passes every other layer through unchanged — no silent smoothing', () => {
    for (const l of ['business', 'application', 'technology', 'strategy', 'motivation']) {
      expect(normalizeGoldLayer(l)).toBe(l);
    }
  });
});
