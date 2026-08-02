/**
 * Tests für den Gegenstands-Slot (THE-547).
 *
 * `packages/shared` hat keinen Test-Runner — Tests für Shared-Module liegen
 * deshalb hier, wie bei `reqtrace-prompt`.
 *
 * Die tragende Eigenschaft: **ein unbestimmbarer Gegenstand darf nie zu einer
 * Übereinstimmung führen.** Sonst sammeln sich alle unbestimmbaren Fälle zu
 * einer Riesen-Capability — dieselbe Falle, die in Lauf 1 die
 * 159-Anforderungen-Maßnahme erzeugt hat.
 */
import {
  OBJECT_SYSTEM,
  OBJECT_UNSTATED,
  buildObjectUserPrompt,
  parseObjectAssignment,
  capabilityKey,
  sameCapability,
} from '@thearchitect/shared';

describe('OBJECT_SYSTEM', () => {
  it('separates the object from the recipient — the distinction the slot model lacked', () => {
    expect(OBJECT_SYSTEM).toMatch(/WORAN gehandelt wird/);
    expect(OBJECT_SYSTEM).toMatch(/NICHT, an wen geleistet wird/);
  });

  it('offers an explicit way out instead of forcing an invented object', () => {
    expect(OBJECT_SYSTEM).toContain(OBJECT_UNSTATED);
    expect(OBJECT_SYSTEM).toMatch(/erfundener\s+Gegenstand ist schlimmer/);
  });
});

describe('buildObjectUserPrompt', () => {
  it('BLINDS law names — same guarantee as every other prompt in the chain', () => {
    const p = buildObjectUserPrompt('Nach DSGVO Art. 32 muss das Unternehmen Daten schützen.');
    expect(p).not.toMatch(/\bDSGVO\b/);
  });
});

describe('parseObjectAssignment', () => {
  it('reads the object out of a JSON answer', () => {
    expect(parseObjectAssignment('{"gegenstand":"Sicherheitsvorfall"}')).toEqual({
      gegenstand: 'Sicherheitsvorfall',
    });
  });

  it('tolerates chatter around the JSON', () => {
    expect(parseObjectAssignment('Klar:\n{"gegenstand":"Schutzmaßnahme"}\nFertig.')?.gegenstand).toBe(
      'Schutzmaßnahme',
    );
  });

  it('trims, because a stray space would split one object into two', () => {
    expect(parseObjectAssignment('{"gegenstand":"  Vorfall  "}')?.gegenstand).toBe('Vorfall');
  });

  it('returns null on unreadable answers — NOT an empty object', () => {
    for (const bad of ['', 'keine Ahnung', '{kaputt', '{"gegenstand":""}', '{"gegenstand":123}', '{"x":1}']) {
      expect(parseObjectAssignment(bad)).toBeNull();
    }
  });

  it('passes the explicit "not determinable" marker through as a VALUE, not as a failure', () => {
    // Unlesbar (null) und unbestimmbar (Marker) sind zwei verschiedene Befunde.
    expect(parseObjectAssignment(`{"gegenstand":"${OBJECT_UNSTATED}"}`)).toEqual({
      gegenstand: OBJECT_UNSTATED,
    });
  });
});

describe('capabilityKey', () => {
  it('is the noun-verb pair — TOGAF G233 §6.1.1', () => {
    expect(capabilityKey('Sicherheitsvorfall', 'vorfall-melden-behoerde')).toBe(
      'sicherheitsvorfall␟vorfall-melden-behoerde',
    );
  });

  it('normalises only case and whitespace — nothing else', () => {
    expect(capabilityKey('  Sicherheits   vorfall ', 'X')).toBe(capabilityKey('sicherheits vorfall', 'x'));
  });

  it('keeps a separator so that ⟨"ab","c"⟩ differs from ⟨"a","bc"⟩', () => {
    expect(capabilityKey('ab', 'c')).not.toBe(capabilityKey('a', 'bc'));
  });

  it('is null when either half is missing — half a capability is not a key', () => {
    expect(capabilityKey(null, 'melden')).toBeNull();
    expect(capabilityKey('Vorfall', null)).toBeNull();
    expect(capabilityKey(OBJECT_UNSTATED, 'melden')).toBeNull();
  });
});

describe('sameCapability', () => {
  const req = (gegenstand: string | null, actionId: string | null) => ({ gegenstand, actionId });

  it('says yes for same object AND same action', () => {
    expect(
      sameCapability(req('Sicherheitsvorfall', 'vorfall-melden-behoerde'), req('sicherheitsvorfall', 'vorfall-melden-behoerde')),
    ).toBe(true);
  });

  it('says NO for same action, different object — the ten rejections of THE-545', () => {
    expect(
      sameCapability(
        req('Sicherheitsvorfall', 'vorfall-melden-behoerde'),
        req('Begründung der Meldeverzögerung', 'vorfall-melden-behoerde'),
      ),
    ).toBe(false);
  });

  it('says no for same object, different action', () => {
    expect(sameCapability(req('Vorfall', 'melden'), req('Vorfall', 'erkennen'))).toBe(false);
  });

  it('NEVER matches two undeterminable objects — that is how the 159-blob was born', () => {
    expect(sameCapability(req(OBJECT_UNSTATED, 'melden'), req(OBJECT_UNSTATED, 'melden'))).toBe(false);
    expect(sameCapability(req(null, 'melden'), req(null, 'melden'))).toBe(false);
  });

  it('errs towards missing a match rather than inventing one', () => {
    // Konservative Richtung: ein erfundener Treffer wiegt in einem
    // Compliance-Werkzeug schwerer als ein verpasster.
    expect(sameCapability(req('Vorfall', 'melden'), req(null, 'melden'))).toBe(false);
  });
});
