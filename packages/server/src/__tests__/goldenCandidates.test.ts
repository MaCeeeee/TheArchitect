/**
 * golden-candidates Tests — Kandidatenpool-Vorprüfung für die Self-Baseline
 * (SELF_BASELINE_GUIDE.md Schritt 1, RUBRIC.md v2 §2.3/§6).
 *
 * Run: cd packages/server && npx jest src/__tests__/goldenCandidates.test.ts
 */
import {
  analyzeCandidates,
  renderCandidateReport,
  candidatesFromApiJson,
} from '../scripts/golden-candidates';
import type { CandidateElement } from '../services/complianceMapping.service';

function el(
  id: string,
  type: CandidateElement['type'],
  description?: string
): CandidateElement {
  return { id, name: id.toUpperCase(), type, description };
}

describe('analyzeCandidates()', () => {
  it('flags missing and too-short descriptions and counts types', () => {
    const report = analyzeCandidates([
      el('mongo', 'technology_service', 'Stores user accounts and session data (personal data).'),
      el('redis', 'technology_service', 'Sessions'), // < 30 Zeichen
      el('client', 'application'), // keine Beschreibung
      el('audit', 'business_process', 'Records security-relevant actions with IP and user agent.'),
    ]);

    expect(report.total).toBe(4);
    expect(report.withoutDescription.map(c => c.id)).toEqual(['client']);
    expect(report.shortDescription.map(c => c.id)).toEqual(['redis']);
    expect(report.byType).toEqual({ technology_service: 2, application: 1, business_process: 1 });
    expect(report.distinctTypes).toBe(3);
  });

  it('detects data-bearing elements via description heuristics (de + en)', () => {
    const report = analyzeCandidates([
      el('crm', 'application', 'Speichert personenbezogene Daten von Kunden.'),
      el('dwh', 'technology_service', 'Warehouse consolidating customer data.'),
      el('wiki', 'application', 'Internal knowledge base for team documentation.'),
    ]);
    expect(report.dataBearing.map(c => c.id).sort()).toEqual(['crm', 'dwh']);
  });

  it('handles an empty pool without dividing by zero', () => {
    const report = analyzeCandidates([]);
    expect(report.total).toBe(0);
    expect(report.distinctTypes).toBe(0);
  });
});

describe('candidatesFromApiJson()', () => {
  it('unwraps the { success, data: [...] } API envelope and keeps label-relevant fields', () => {
    const cands = candidatesFromApiJson({
      success: true,
      data: [
        { id: 'e1', name: 'Mongo', type: 'technology_service', layer: 'technology',
          description: 'Stores user accounts.', position3D: { x: 1 }, metadata: {} },
        { id: 'e2', name: 'Client', type: 'application' },
      ],
    });
    expect(cands).toEqual([
      { id: 'e1', name: 'Mongo', type: 'technology_service', layer: 'technology', description: 'Stores user accounts.' },
      { id: 'e2', name: 'Client', type: 'application', layer: undefined, description: undefined },
    ]);
  });

  it('also accepts a bare array', () => {
    expect(candidatesFromApiJson([{ id: 'x', name: 'X', type: 'capability' }])).toHaveLength(1);
  });

  it('throws on a shape that is neither array nor { data: [] }', () => {
    expect(() => candidatesFromApiJson({ error: 'nope' })).toThrow(/Unerwartetes JSON/);
  });
});

describe('renderCandidateReport()', () => {
  it('shows ❌ while descriptions are missing and ✅ when the pool qualifies', () => {
    const bad = renderCandidateReport(
      analyzeCandidates([el('a', 'application'), el('b', 'capability', 'x'.repeat(40))])
    );
    expect(bad).toContain('❌');
    expect(bad).toContain('OHNE Beschreibung');

    const good = renderCandidateReport(
      analyzeCandidates([
        el('a', 'application', 'Stores customer personal data for support cases.'),
        el('b', 'capability', 'Governs security policies across the landscape.'),
        el('c', 'business_process', 'Handles breach notification to the authority.'),
        el('d', 'technology_service', 'Provides encryption and key management.'),
      ])
    );
    expect(good).toContain('✅');
    // Rubrik §6: Typen-Anzahl wird ausgewiesen
    expect(good).toContain('Element-Typen (4');
  });
});
