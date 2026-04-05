/**
 * Standards Templates — Unit Tests
 *
 * Validates built-in compliance framework templates:
 *   - Correct control counts per framework
 *   - Unique IDs within each framework
 *   - Required fields present on all controls
 *   - extractOSCALText helper function
 *
 * Run: cd packages/server && npx jest src/__tests__/standards-templates.test.ts --verbose
 */

import { __testExports as standards } from '../services/connectors/standards.connector';

const {
  extractOSCALText,
  STANDARDS_MAP,
  ISO_27001_CONTROLS,
  DORA_CONTROLS,
  NIS2_CONTROLS,
  BSI_CONTROLS,
  KRITIS_CONTROLS,
} = standards;

// ════════════════════════════════════════════════════════
// Control Counts
// ════════════════════════════════════════════════════════

describe('Standards Template — Control Counts', () => {
  it('ISO 27001 has 21 controls', () => expect(ISO_27001_CONTROLS.length).toBe(21));
  it('DORA has 9 controls', () => expect(DORA_CONTROLS.length).toBe(9));
  it('NIS2 has 10 controls', () => expect(NIS2_CONTROLS.length).toBe(10));
  it('BSI has 12 controls', () => expect(BSI_CONTROLS.length).toBe(12));
  it('KRITIS has 8 controls', () => expect(KRITIS_CONTROLS.length).toBe(8));
});

// ════════════════════════════════════════════════════════
// Unique IDs
// ════════════════════════════════════════════════════════

describe('Standards Template — Unique IDs', () => {
  const frameworkTests: [string, typeof ISO_27001_CONTROLS][] = [
    ['ISO 27001', ISO_27001_CONTROLS],
    ['DORA', DORA_CONTROLS],
    ['NIS2', NIS2_CONTROLS],
    ['BSI', BSI_CONTROLS],
    ['KRITIS', KRITIS_CONTROLS],
  ];

  it.each(frameworkTests)('%s has unique control IDs', (name, controls) => {
    const ids = controls.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ════════════════════════════════════════════════════════
// Required Fields
// ════════════════════════════════════════════════════════

describe('Standards Template — Required Fields', () => {
  const allControls = [
    ...ISO_27001_CONTROLS,
    ...DORA_CONTROLS,
    ...NIS2_CONTROLS,
    ...BSI_CONTROLS,
    ...KRITIS_CONTROLS,
  ];

  it('all controls have a non-empty id', () => {
    for (const ctrl of allControls) {
      expect(ctrl.id).toBeTruthy();
      expect(ctrl.id.length).toBeGreaterThan(0);
    }
  });

  it('all controls have a non-empty title', () => {
    for (const ctrl of allControls) {
      expect(ctrl.title).toBeTruthy();
      expect(ctrl.title.length).toBeGreaterThan(0);
    }
  });

  it('all controls have a non-empty description', () => {
    for (const ctrl of allControls) {
      expect(ctrl.description).toBeTruthy();
      expect(ctrl.description.length).toBeGreaterThan(0);
    }
  });

  it('all controls have a family', () => {
    for (const ctrl of allControls) {
      expect(ctrl.family).toBeTruthy();
    }
  });
});

// ════════════════════════════════════════════════════════
// STANDARDS_MAP
// ════════════════════════════════════════════════════════

describe('STANDARDS_MAP', () => {
  it('contains all 5 frameworks', () => {
    expect(Object.keys(STANDARDS_MAP)).toEqual(
      expect.arrayContaining(['iso27001', 'dora', 'nis2', 'bsi', 'kritis']),
    );
  });

  it('maps to correct arrays', () => {
    expect(STANDARDS_MAP['iso27001']).toBe(ISO_27001_CONTROLS);
    expect(STANDARDS_MAP['dora']).toBe(DORA_CONTROLS);
    expect(STANDARDS_MAP['nis2']).toBe(NIS2_CONTROLS);
    expect(STANDARDS_MAP['bsi']).toBe(BSI_CONTROLS);
    expect(STANDARDS_MAP['kritis']).toBe(KRITIS_CONTROLS);
  });
});

// ════════════════════════════════════════════════════════
// extractOSCALText
// ════════════════════════════════════════════════════════

describe('extractOSCALText', () => {
  it('returns empty string for undefined input', () => {
    expect(extractOSCALText(undefined)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(extractOSCALText([])).toBe('');
  });

  it('extracts prose from flat parts', () => {
    const parts = [
      { prose: 'First sentence.' },
      { prose: 'Second sentence.' },
    ];
    expect(extractOSCALText(parts)).toBe('First sentence. Second sentence.');
  });

  it('extracts prose from nested parts', () => {
    const parts = [
      { prose: 'Outer.', parts: [{ prose: 'Inner.' }] },
    ];
    expect(extractOSCALText(parts)).toBe('Outer. Inner.');
  });

  it('truncates to 500 characters', () => {
    const parts = [{ prose: 'x'.repeat(600) }];
    expect(extractOSCALText(parts).length).toBeLessThanOrEqual(500);
  });

  it('skips parts without prose', () => {
    const parts = [{ id: 'no-prose' }, { prose: 'Has prose.' }];
    expect(extractOSCALText(parts)).toBe('Has prose.');
  });
});

// ════════════════════════════════════════════════════════
// Framework-specific content checks
// ════════════════════════════════════════════════════════

describe('Framework content validation', () => {
  it('ISO 27001 IDs start with A.', () => {
    for (const ctrl of ISO_27001_CONTROLS) {
      expect(ctrl.id).toMatch(/^A\./);
    }
  });

  it('DORA IDs start with DORA-', () => {
    for (const ctrl of DORA_CONTROLS) {
      expect(ctrl.id).toMatch(/^DORA-/);
    }
  });

  it('NIS2 IDs start with NIS2-', () => {
    for (const ctrl of NIS2_CONTROLS) {
      expect(ctrl.id).toMatch(/^NIS2-/);
    }
  });

  it('BSI IDs start with BSI-', () => {
    for (const ctrl of BSI_CONTROLS) {
      expect(ctrl.id).toMatch(/^BSI-/);
    }
  });

  it('KRITIS IDs start with KRITIS-', () => {
    for (const ctrl of KRITIS_CONTROLS) {
      expect(ctrl.id).toMatch(/^KRITIS-/);
    }
  });

  it('DORA has at least one critical priority control', () => {
    const critical = DORA_CONTROLS.filter(c => c.priority === 'critical');
    expect(critical.length).toBeGreaterThan(0);
  });
});
