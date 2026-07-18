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

  // Stabile Sortierung: Layer asc (Gruppierung), dann Priorität desc, dann name asc (AC-1/AC-2).
  const ordered = [...facts.elements].sort(
    (a, b) =>
      (a.layer ?? 'zzz').localeCompare(b.layer ?? 'zzz') ||
      priority(b) - priority(a) ||
      a.name.localeCompare(b.name),
  );

  const header = facts.projectFields.map(f => `${f.name}: ${f.value}`).join('\n');
  const hintLine = signalHints.length ? `signals: ${signalHints.join(', ')}` : '';

  const lines: string[] = [];
  let used = 0;
  let truncated = false;
  const budgetForElements = PROFILE_CHAR_BUDGET - header.length - hintLine.length - 2;
  for (const e of ordered) {
    const line = elementLine(e);
    if (lines.join('\n').length + line.length + 1 > budgetForElements) { truncated = true; break; }
    lines.push(line);
    used += 1;
  }

  const text = [header, hintLine, ...lines].filter(Boolean).join('\n').slice(0, PROFILE_CHAR_BUDGET);
  return {
    projectId,
    text,
    signalHints,
    meta: { elementsUsed: used, elementsTotal: facts.elements.length, truncated, charBudget: PROFILE_CHAR_BUDGET },
  };
}
