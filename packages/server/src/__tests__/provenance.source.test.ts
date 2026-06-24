import { deriveSourceFromFormat } from '../services/upload.service';

describe('deriveSourceFromFormat (REQ-PROV-002.1)', () => {
  describe('Connector-Syncs → <type>', () => {
    it.each([
      ['connector:github', 'github'],
      ['connector:n8n', 'n8n'],
      ['connector:sap', 'sap'],
      ['connector:servicenow', 'servicenow'],
    ])('mappt %s → %s', (format, expected) => {
      expect(deriveSourceFromFormat(format)).toBe(expected);
    });
  });

  describe('Datei-Importe → kanonisches Quell-Label', () => {
    it.each([
      ['csv', 'csv'],
      ['excel', 'excel'],
      ['json', 'json'],
      ['leanix', 'leanix'],
    ])('mappt %s → %s', (format, expected) => {
      expect(deriveSourceFromFormat(format)).toBe(expected);
    });

    it('normalisiert beide ArchiMate-Varianten auf "archimate"', () => {
      expect(deriveSourceFromFormat('archimate-xml')).toBe('archimate');
      expect(deriveSourceFromFormat('archimate-exchange')).toBe('archimate');
    });
  });

  describe('Backward-Compat / Fallback → "upload"', () => {
    it('fällt bei fehlendem format (undefined/leer) auf "upload" zurück', () => {
      expect(deriveSourceFromFormat()).toBe('upload');
      expect(deriveSourceFromFormat('')).toBe('upload');
    });

    it('fällt bei unbekanntem format auf "upload" zurück', () => {
      expect(deriveSourceFromFormat('something-else')).toBe('upload');
    });

    it('behandelt "connector:" ohne Typ als leeren Typ (kein Crash)', () => {
      expect(deriveSourceFromFormat('connector:')).toBe('');
    });
  });
});
