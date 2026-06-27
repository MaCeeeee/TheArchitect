/**
 * WFCOMP Eval-Harness (REQ-WFCOMP-001.7 / THE-359).
 *
 * Evaluation-driven: der Gate-Report ist das ZIEL, auf das M1 zubaut — kein
 * nachgelagerter Test. Dieses Gerüst etabliert das Ziel sichtbar:
 *   - JETZT scharf: Fixtures sind valide n8n + Ground-Truth deckt alle Fixtures.
 *   - PENDING (it.todo): die Definition-of-Success-Gates G1–G5 werden in
 *     Task 4–6 (.0 Sanitize / .2 Lift / .4 Trace) scharf geschaltet.
 *
 * Success-Doc: docs/superpowers/2026-06-27-uc-wfcomp-001-success-criteria.md
 */
import fs from 'fs';
import path from 'path';
import { GROUND_TRUTH } from './fixtures/wfcomp/ground-truth';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'wfcomp');

describe('WFCOMP eval-harness (REQ-WFCOMP-001.7 / THE-359)', () => {
  describe('Fixtures: structural validity', () => {
    for (const gt of GROUND_TRUTH) {
      it(`${gt.fixture}.json is valid n8n (nodes[] + connections{})`, () => {
        const raw = JSON.parse(
          fs.readFileSync(path.join(FIXTURE_DIR, `${gt.fixture}.json`), 'utf-8'),
        );
        expect(Array.isArray(raw.nodes)).toBe(true);
        expect(raw.nodes.length).toBeGreaterThan(0);
        expect(typeof raw.connections).toBe('object');
      });
    }

    it('ground-truth labels cover exactly the fixture files (no drift)', () => {
      const files = fs
        .readdirSync(FIXTURE_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''))
        .sort();
      const labelled = GROUND_TRUTH.map(g => g.fixture).sort();
      expect(labelled).toEqual(files);
    });

    it('pindata-leak fixture actually carries PII (so G1 has something to strip)', () => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(FIXTURE_DIR, 'pindata-leak.json'), 'utf-8'),
      );
      expect(raw.pinData).toBeDefined();
      expect(JSON.stringify(raw)).toContain('musterfrau@example.com');
    });
  });

  // ── Definition-of-Success Gates — scharf geschaltet in Task 4–6 (.0/.2/.4) ──
  describe('M1 Gates (Definition of Success — pending bis Lift/Trace stehen)', () => {
    it.todo('G1: sanitize — 0 PII at-rest (pindata-leak)');
    it.todo('G2: kein false-grün über alle Fixtures');
    it.todo('G3: HART-Lückenliste exakt = Ground-Truth (missing-recipient → d)');
    it.todo('G4: Guard-Logik (Drittland rot/grün, Multi-DataObject g ROT)');
    it.todo('G5: Anwendbarkeit (no-personal-data → gdprScope=false)');
  });
});
