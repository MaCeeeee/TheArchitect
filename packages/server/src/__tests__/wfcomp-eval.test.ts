/**
 * WFCOMP Eval-Harness (REQ-WFCOMP-001.7 / THE-359) — Definition of Success.
 *
 * Evaluation-driven: dieser Gate-Report IST das Ziel. M1 fertig ⟺ G1–G5 grün.
 * Läuft die reine Pipeline (assessWorkflow) gegen die handgelabelten Fixtures.
 *
 * Success-Doc: docs/superpowers/2026-06-27-uc-wfcomp-001-success-criteria.md
 */
import fs from 'fs';
import path from 'path';
import { GROUND_TRUTH } from './fixtures/wfcomp/ground-truth';
import { sanitizeN8nWorkflow } from '../services/wfcomp/sanitize';
import { assessWorkflow } from '../services/wfcomp/assess';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'wfcomp');
const load = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf-8'));
const assess = (name: string) => assessWorkflow(load(name));
const statusOf = (name: string, litera: string) =>
  assess(name).fields.find(f => f.litera === litera)?.status;

describe('WFCOMP eval-harness (REQ-WFCOMP-001.7 / THE-359)', () => {
  describe('Fixtures: structural validity', () => {
    for (const gt of GROUND_TRUTH) {
      it(`${gt.fixture}.json is valid n8n (nodes[] + connections{})`, () => {
        const raw = load(gt.fixture);
        expect(Array.isArray(raw.nodes)).toBe(true);
        expect(raw.nodes.length).toBeGreaterThan(0);
        expect(typeof raw.connections).toBe('object');
      });
    }
    it('ground-truth labels cover exactly the fixture files (no drift)', () => {
      const files = fs.readdirSync(FIXTURE_DIR)
        .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
      expect(GROUND_TRUTH.map(g => g.fixture).sort()).toEqual(files);
    });
  });

  // ── Definition-of-Success Gates (must-hold) ──
  describe('M1 Gates', () => {
    it('G1: sanitize — 0 PII at-rest (pindata-leak)', () => {
      const dump = JSON.stringify(sanitizeN8nWorkflow(load('pindata-leak')));
      for (const pii of ['hans.mueller@example.com', 'Hans Müller', 'erika.musterfrau@example.com', 'Erika Musterfrau', 'DE89370400440532013000']) {
        expect(dump).not.toContain(pii);
      }
    });

    it('G2: legal fields (a/b/c/f/g) are NEVER auto-green', () => {
      for (const gt of GROUND_TRUTH.filter(g => g.gdprScope)) {
        for (const lit of ['a', 'b', 'c', 'f', 'g']) {
          expect(statusOf(gt.fixture, lit)).not.toBe('present');
        }
      }
    });

    it('G3: deterministic gap-list (missing fields) exactly matches ground-truth', () => {
      for (const gt of GROUND_TRUTH) {
        const r = assess(gt.fixture);
        if (!gt.gdprScope) {
          expect(r.fields).toHaveLength(0);
          continue;
        }
        const missing = r.fields.filter(f => f.status === 'missing').map(f => f.litera).sort();
        const expected = gt.groundTruthGaps.map(g => g.litera).sort();
        expect(missing).toEqual(expected);
      }
    });

    it('G4: third-country guard direction (EU → present, non-EU no-safeguard → missing)', () => {
      expect(statusOf('clean-compliant', 'e')).toBe('present');
      expect(statusOf('thirdcountry-no-safeguard', 'e')).toBe('missing');
    });

    it('G5: applicability — no-personal-data → gdprScope false', () => {
      expect(assess('no-personal-data').gdprScope).toBe(false);
    });
  });
});
