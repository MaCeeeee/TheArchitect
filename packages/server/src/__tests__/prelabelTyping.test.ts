/**
 * prelabel-typing pure functions — THE-430 Slice 1 (LLM-Prelabel, ohne API).
 *
 * Run: cd packages/server && npx jest src/__tests__/prelabelTyping.test.ts
 */
import { buildPrelabelUserPrompt, parsePrelabelLabels } from '../scripts/prelabel-typing';

describe('buildPrelabelUserPrompt', () => {
  const prov = {
    source: 'dsgvo',
    paragraphNumber: 'art-5',
    title: 'Grundsätze',
    fullText: 'Personenbezogene Daten müssen rechtmäßig verarbeitet werden.',
    language: 'de' as const,
  };

  it('listet alle vier E6-Achsen + den Provisions-Text', () => {
    const p = buildPrelabelUserPrompt(prov);
    expect(p).toContain('normKind:');
    expect(p).toContain('bindingness:');
    expect(p).toContain('obligationKind:');
    expect(p).toContain('partyRole:');
    // geschlossene Räume injiziert
    expect(p).toContain('obligation (Obligation / Gebot)');
    expect(p).toContain('controller');
    expect(p).toContain('Personenbezogene Daten müssen');
    expect(p).toContain('"na"');
  });
});

describe('parsePrelabelLabels', () => {
  it('mappt gültige Werte auf Labels', () => {
    const { labels, dropped } = parsePrelabelLabels(
      '{"normKind":"legislation","bindingness":"binding","obligationKind":"obligation","partyRole":"controller"}'
    );
    expect(labels).toEqual({
      normKind: 'legislation',
      bindingness: 'binding',
      obligationKind: 'obligation',
      partyRole: 'controller',
    });
    expect(dropped).toEqual([]);
  });

  it('"na" → null (bewusst nicht anwendbar)', () => {
    const { labels } = parsePrelabelLabels('{"normKind":"legislation","obligationKind":"na","partyRole":"na"}');
    expect(labels.obligationKind).toBeNull();
    expect(labels.partyRole).toBeNull();
    expect(labels.normKind).toBe('legislation');
  });

  it('OOV-Wert → verworfen (Achse offen), in dropped gezählt', () => {
    const { labels, dropped } = parsePrelabelLabels('{"obligationKind":"duty","normKind":"invented_kind"}');
    expect(labels.obligationKind).toBeUndefined();
    expect(labels.normKind).toBeUndefined();
    expect(dropped.sort()).toEqual(['normKind', 'obligationKind']);
  });

  it('fehlende Achse → offen (undefined), nicht null', () => {
    const { labels } = parsePrelabelLabels('{"normKind":"legislation"}');
    expect('bindingness' in labels).toBe(false);
  });

  it('extrahiert JSON aus umgebendem Text', () => {
    const { labels } = parsePrelabelLabels('Here you go: {"normKind":"guideline"} — done');
    expect(labels.normKind).toBe('guideline');
  });

  it('kaputtes/leeres JSON → alle Achsen offen, kein Throw', () => {
    expect(() => parsePrelabelLabels('not json at all')).not.toThrow();
    expect(parsePrelabelLabels('not json').labels).toEqual({});
  });
});
