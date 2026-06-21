import {
  deriveProvenance,
  provenanceCypherFragment,
  provenanceCoreFragment,
  provenanceParams,
} from '../services/provenance.helper';

describe('provenance.helper (REQ-PROV-001.1)', () => {
  describe('deriveProvenance (AC-3) — 6 Mappings + Default', () => {
    it('mappt ai-heal → ai_generated', () => {
      expect(deriveProvenance('ai-heal')).toBe('ai_generated');
    });
    it('mappt compliance-requirement → ai_generated', () => {
      expect(deriveProvenance('compliance-requirement')).toBe('ai_generated');
    });
    it.each(['csv', 'bpmn', 'n8n', 'blueprint'])('mappt %s → import', (src) => {
      expect(deriveProvenance(src)).toBe('import');
    });
    it('fällt bei unbekanntem source auf user zurück', () => {
      expect(deriveProvenance('something-else')).toBe('user');
    });
    it('fällt bei fehlendem source (undefined/null/leer) auf user zurück (AC-4)', () => {
      expect(deriveProvenance()).toBe('user');
      expect(deriveProvenance(null)).toBe('user');
      expect(deriveProvenance('')).toBe('user');
    });
  });

  describe('provenanceParams (AC-2 / AC-4)', () => {
    it('enthält alle 5 Keys (mit Prefix)', () => {
      const p = provenanceParams();
      expect(Object.keys(p).sort()).toEqual(
        [
          'prov_certifiedAt',
          'prov_certifiedBy',
          'prov_confidence',
          'prov_provenance',
          'prov_source',
        ].sort(),
      );
    });
    it('defaultet provenance auf user, Rest auf null (AC-4)', () => {
      const p = provenanceParams();
      expect(p.prov_provenance).toBe('user');
      expect(p.prov_source).toBeNull();
      expect(p.prov_confidence).toBeNull();
      expect(p.prov_certifiedBy).toBeNull();
      expect(p.prov_certifiedAt).toBeNull();
    });
    it('übernimmt gesetzte Felder', () => {
      const p = provenanceParams({ provenance: 'import', source: 'csv', confidence: 0.8 });
      expect(p.prov_provenance).toBe('import');
      expect(p.prov_source).toBe('csv');
      expect(p.prov_confidence).toBe(0.8);
    });
    it('respektiert einen custom Prefix', () => {
      const p = provenanceParams({ provenance: 'user' }, 'x_');
      expect(p.x_provenance).toBe('user');
      expect(Object.keys(p).every((k) => k.startsWith('x_'))).toBe(true);
    });
  });

  describe('provenanceCypherFragment (AC-2)', () => {
    it('setzt alle 5 Felder auf den Default-Node "e"', () => {
      const f = provenanceCypherFragment();
      expect(f).toContain('e.provenance = $prov_provenance');
      expect(f).toContain('e.source = $prov_source');
      expect(f).toContain('e.confidence = $prov_confidence');
      expect(f).toContain('e.certifiedBy = $prov_certifiedBy');
      expect(f).toContain('e.certifiedAt = $prov_certifiedAt');
    });
    it('nutzt den übergebenen Node-Variablennamen', () => {
      expect(provenanceCypherFragment('r')).toContain('r.provenance = $prov_provenance');
    });
  });

  describe('provenanceCoreFragment (Bestandsschutz für source/confidence)', () => {
    it('setzt NUR die 3 Neu-Felder, nicht source/confidence', () => {
      const f = provenanceCoreFragment('r');
      expect(f).toContain('r.provenance = $prov_provenance');
      expect(f).toContain('r.certifiedBy = $prov_certifiedBy');
      expect(f).toContain('r.certifiedAt = $prov_certifiedAt');
      expect(f).not.toContain('source');
      expect(f).not.toContain('confidence');
    });
  });
});
