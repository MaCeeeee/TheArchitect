/**
 * Tests für den Klassifikations-Dienst Pflicht → kanonische Handlung
 * (THE-438 Slice 1, Task 4).
 *
 * Der Rater ist INJIZIERT — kein Live-LLM im Test, und derselbe Codepfad läuft
 * im Eval wie in der Produktion. Muster: runTypingEval.
 *
 * Die tragende Unterscheidung dieses Moduls: „keine passende Handlung" ist ein
 * Befund über den KATALOG, eine unlesbare Antwort ein Befund über den LAUF.
 * Zusammengeworfen verfälschen sie die „keine"-Quote — und genau die zeigt an,
 * ob der Katalog Lücken hat oder das Modell Treffer erzwingt (Schema-Blindheit).
 */
import { classifyObligation, classifyObligations, type AskFn } from '../services/obligationAction.service';
import { NORM_ONTOLOGY, CLASSIFY_SYSTEM, type ObligationRef } from '@thearchitect/shared';

const obl: ObligationRef = {
  law: 'DSGVO',
  para: 'Art. 33',
  title: 'Meldung',
  text: 'Der Verantwortliche meldet die Verletzung binnen 72 Stunden an die Aufsichtsbehörde.',
};
const stub = (reply: string): AskFn => async () => reply;

describe('obligationAction.service (THE-438)', () => {
  it('returns the assigned action', async () => {
    const r = await classifyObligation(obl, stub('{"id":"vorfall-melden-behoerde"}'));
    expect(r.actionId).toBe('vorfall-melden-behoerde');
    expect(r.unparseable).toBe(false);
  });

  it('stamps the ontology version that the assignment was made against', async () => {
    // Ohne Katalog-Version ist ein Ergebnis spaeter nicht mehr interpretierbar:
    // der Katalog ist fortschreibbar, die Zuordnung gilt gegen EINEN Stand.
    const r = await classifyObligation(obl, stub('{"id":"vorfall-melden-behoerde"}'));
    expect(r.ontologyVersion).toBe(NORM_ONTOLOGY.ontologyVersion);
  });

  it('treats "no matching action" as a result, not a failure', async () => {
    const r = await classifyObligation(obl, stub('{"id":"keine"}'));
    expect(r.actionId).toBeNull();
    expect(r.unparseable).toBe(false);
  });

  it('distinguishes an unparseable answer from a deliberate "none"', async () => {
    const r = await classifyObligation(obl, stub('ich bin mir nicht sicher'));
    expect(r.actionId).toBeNull();
    expect(r.unparseable).toBe(true);
  });

  it('treats an invented action id as unparseable, never passing it through', async () => {
    // Ein halluzinierter Katalog-Eintrag darf nicht als Zuordnung gelten und
    // auch nicht still als "keine" verbucht werden — er ist ein Lauf-Fehler.
    const r = await classifyObligation(obl, stub('{"id":"handlung-die-es-nicht-gibt"}'));
    expect(r.actionId).toBeNull();
    expect(r.unparseable).toBe(true);
  });

  it('sends the shared classifier prompt — no second prompt source', async () => {
    // Messvaliditaet: weicht der Produktions-Prompt vom Eval-Prompt ab, misst
    // der Eval etwas anderes als die Produktion.
    let seenSystem = '';
    await classifyObligation(obl, async (system) => {
      seenSystem = system;
      return '{"id":"keine"}';
    });
    expect(seenSystem).toBe(CLASSIFY_SYSTEM);
  });

  it('never leaks a law name into the user prompt', async () => {
    let seenUser = '';
    await classifyObligation(obl, async (_s, user) => {
      seenUser = user;
      return '{"id":"keine"}';
    });
    expect(seenUser).not.toMatch(/\bDSGVO\b/);
    expect(seenUser).toContain('binnen 72 Stunden');
  });

  it('reports coverage, none-rate and unparseable count over a batch', async () => {
    const replies = ['{"id":"vorfall-melden-behoerde"}', '{"id":"keine"}', 'kaputt'];
    let i = 0;
    const res = await classifyObligations([obl, obl, obl], async () => replies[i++]);
    expect(res.stats).toEqual({ total: 3, assigned: 1, none: 1, unparseable: 1 });
    expect(res.assignments).toHaveLength(3);
  });

  it('keeps assignments aligned with the input order', async () => {
    const replies = ['{"id":"zugriffskontrolle"}', '{"id":"risikobewertung"}'];
    let i = 0;
    const res = await classifyObligations([obl, obl], async () => replies[i++]);
    expect(res.assignments.map((a) => a.actionId)).toEqual(['zugriffskontrolle', 'risikobewertung']);
  });

  it('handles an empty batch without dividing by zero', async () => {
    const res = await classifyObligations([], stub('{"id":"keine"}'));
    expect(res.stats).toEqual({ total: 0, assigned: 0, none: 0, unparseable: 0 });
  });
});
