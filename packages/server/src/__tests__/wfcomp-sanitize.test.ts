/**
 * sanitizeN8nWorkflow Tests (.0 / REQ-WFCOMP-001.0, THE-358) — Gate G1.
 */
import fs from 'fs';
import path from 'path';
import { sanitizeN8nWorkflow } from '../services/wfcomp/sanitize';

const FIX = path.join(__dirname, 'fixtures', 'wfcomp');
const load = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf-8'));

describe('sanitizeN8nWorkflow (.0 / THE-358)', () => {
  describe('G1: no PII at-rest', () => {
    it('strips pinData + hardcoded parameter VALUES, keeps field-name KEYS', () => {
      const sanitized = sanitizeN8nWorkflow(load('pindata-leak'));
      const dump = JSON.stringify(sanitized);

      // PII VALUES must be gone (Set values + pinData)
      expect(dump).not.toContain('hans.mueller@example.com');
      expect(dump).not.toContain('Hans Müller');
      expect(dump).not.toContain('erika.musterfrau@example.com');
      expect(dump).not.toContain('Erika Musterfrau');
      expect(dump).not.toContain('DE89370400440532013000');

      // ...but field-name KEYS are kept (needed for lit. c candidate detection)
      const setNode = sanitized.nodes.find(n => /\.set$/.test(n.type));
      expect(setNode?.paramKeys).toContain('email');
      expect(setNode?.paramKeys).toContain('fullName');
    });

    it('never emits a pinData / credentials field', () => {
      const sanitized = sanitizeN8nWorkflow(load('pindata-leak'));
      const dump = JSON.stringify(sanitized);
      expect(dump).not.toContain('pinData');
      expect(dump).not.toContain('credentials');
    });
  });

  describe('structure preserved', () => {
    it('keeps node types + topology', () => {
      const s = sanitizeN8nWorkflow(load('clean-compliant'));
      expect(s.nodes.map(n => n.type)).toEqual([
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.set',
        'n8n-nodes-base.httpRequest',
        'n8n-nodes-base.postgres',
      ]);
      // 3 flow edges, first one from the trigger
      expect(s.edges).toHaveLength(3);
      expect(s.edges[0]).toEqual({ from: 'Signup Webhook', to: 'Map Subscriber Fields', kind: 'trigger' });
    });

    it('extracts target HOSTNAME only (no path/query) from httpRequest', () => {
      const s = sanitizeN8nWorkflow(load('clean-compliant'));
      const http = s.nodes.find(n => /httpRequest/.test(n.type));
      expect(http?.targetDomains).toEqual(['api.cleverreach.de']);
    });

    it('accepts a raw JSON string too', () => {
      const raw = fs.readFileSync(path.join(FIX, 'clean-compliant.json'), 'utf-8');
      const s = sanitizeN8nWorkflow(raw);
      expect(s.nodes).toHaveLength(4);
    });
  });
});
