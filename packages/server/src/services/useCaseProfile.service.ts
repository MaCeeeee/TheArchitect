/**
 * UC-LAW-002 REQ-LAW-002.1 (THE-460) — Use-Case-Profil-Builder.
 * Deterministische Modell-Verdichtung als Discovery-Input. KEIN LLM: gleiche
 * Architektur ⇒ gleiches Profil (Cache-/Eval-Basis). Reuse von LAW-001 (AC-3):
 * kein zweiter Neo4j-Lesepfad. Enthält nur Modell-/Projektdaten (AC-4: kein
 * Secret-Material — Elemente tragen keine Credentials).
 */
import type { UseCaseProfile } from '@thearchitect/shared';
import {
  loadProjectFacts,
  evaluateSignals,
  type ElementFact,
} from './regulationApplicability.service';

/** Hartes Zeichen-Budget (AC-2). Dokumentiert; Kürzung priorisiert wichtigste zuerst. */
export const PROFILE_CHAR_BUDGET = 6000;
const DESC_CLIP = 160;

/** Priorität eines Elements (höher = überlebt die Kürzung eher). AC-2. */
function priority(e: ElementFact): number {
  let p = 0;
  if (e.sensitivity === 'PII') p += 3;
  if (e.fromWizard) p += 2;
  if (e.sensitivity === 'confidential') p += 1;
  return p;
}

/** Element-Zeile mit inline Sensitivity-/Wizard-Markern + Layer (AC-1: Embedding „sieht" PII/Wizard). */
function elementLine(e: ElementFact): string {
  const marks = [e.sensitivity === 'PII' ? 'PII' : '', e.fromWizard ? 'AI-generated' : ''].filter(Boolean);
  const suffix = marks.length ? `, ${marks.join(', ')}` : '';
  return `[${e.layer ?? 'unknown'}] ${e.name} (${e.type}${suffix}): ${e.description.slice(0, DESC_CLIP)}`;
}

export async function buildUseCaseProfile(projectId: string): Promise<UseCaseProfile> {
  const facts = await loadProjectFacts(projectId);
  const signals = evaluateSignals(facts);
  // ACHTUNG: Feld heißt `detected` (ApplicabilitySignalResult), NICHT `triggered`.
  const signalHints = signals.filter(s => s.detected).map(s => s.id).sort();

  const header = facts.projectFields.map(f => `${f.name}: ${f.value}`).join('\n');
  const hintLine = signalHints.length ? `signals: ${signalHints.join(', ')}` : '';
  const budgetForElements = PROFILE_CHAR_BUDGET - header.length - hintLine.length - 2;

  // PASS 1 — Auswahl (AC-2): WER überlebt, entscheidet die Priorität, NICHT der Layer.
  // Sortiere ALLE Elemente nach priority() desc, dann name asc, und fülle das Budget in
  // dieser Reihenfolge. So überlebt ein hochpriorisiertes (PII/Wizard) Element auch dann,
  // wenn es in einem alphabetisch späteren Layer liegt als budget-fressende Filler.
  const byPriority = [...facts.elements].sort(
    (a, b) => priority(b) - priority(a) || a.name.localeCompare(b.name),
  );
  const selected: ElementFact[] = [];
  let usedChars = 0;
  let truncated = false;
  for (const e of byPriority) {
    const cost = elementLine(e).length + (selected.length ? 1 : 0); // +1 für den Zeilenumbruch
    if (usedChars + cost > budgetForElements) { truncated = true; continue; }
    selected.push(e);
    usedChars += cost;
  }

  // PASS 2 — Rendering (AC-1): nur die Überlebenden, layer-gruppiert für den Ausgabetext
  // (Layer asc, dann Priorität desc, dann name asc). Determinismus bleibt erhalten.
  const rendered = [...selected].sort(
    (a, b) =>
      (a.layer ?? 'zzz').localeCompare(b.layer ?? 'zzz') ||
      priority(b) - priority(a) ||
      a.name.localeCompare(b.name),
  );
  const lines = rendered.map(elementLine);
  const used = selected.length;

  const text = [header, hintLine, ...lines].filter(Boolean).join('\n').slice(0, PROFILE_CHAR_BUDGET);
  return {
    projectId,
    text,
    signalHints,
    meta: { elementsUsed: used, elementsTotal: facts.elements.length, truncated, charBudget: PROFILE_CHAR_BUDGET },
  };
}
