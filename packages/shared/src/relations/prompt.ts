/**
 * Relations-Prompt (rp-2) — die EINE Quelle für den Cross-Norm-Relations-
 * Klassifizierungs-Prompt (geschlossene inferred-Liste der E7-Registry).
 *
 * WARUM in shared (THE-433 Slice 1, Task 3a — exakt das Slice-T-Muster von
 * shared/src/typing/prompt.ts): Der Batch (packages/compliance-crawler,
 * Server B) und die Eval (packages/server, Golden-Set-Messung gegen
 * relations.v4.json) MÜSSEN den Byte-identischen Prompt verwenden — sonst
 * misst die Eval ein anderes System als das, das produktiv klassifiziert, und
 * die Kappa-/Accuracy-Zahlen (rp-2: 0,866) sind keine Aussage über den Batch.
 * Der Crawler hängt nur von @thearchitect/shared ab, nicht von packages/server
 * — deshalb lebt der Prompt hier.
 *
 * Hierher verschoben aus packages/server/src/scripts/prelabel-relations.ts
 * (THE-421 Task 13) — reine Relokation, kein Inhalts-Change. Beweis der
 * Gleichheit: die bestehenden Server-Tests (prelabelRelations.test.ts) laufen
 * UNVERÄNDERT gegen die Re-Exporte grün. Die Zod-Schemata des Golden-Sets
 * bleiben bewusst in packages/server/src/evals/relationsGolden.ts: der Crawler
 * braucht sie nicht, und shared soll keine Eval-Infrastruktur tragen.
 *
 * Zwei Hard-Regeln (Begründung im Kopf von prelabel-relations.ts):
 *  1. INFERRED-ONLY (THE-433 AC-5): nur Relationstypen mit
 *     `derivation: 'inferred'` werden dem Modell angeboten; Metadata-Typen
 *     (AMENDS/CONSOLIDATES/REPEALS/CITES) kommen aus ELI/CELLAR und werden
 *     beim Parsen wie OOV verworfen.
 *  2. EXPLICIT DIRECTION: die Richtung ist ein eigenes Modell-Feld
 *     ('a-to-b' | 'b-to-a') und wird nie aus einer Sortierung abgeleitet.
 *
 * Linear: THE-433 (Slice 1) · Ursprung: THE-421 (Task 13) · Freeze: rp-2
 */
import { NORM_ONTOLOGY, isInferredRelation } from '../ontology';

// ─── Options-Liste: NUR inferred Relationstypen, aus der Ontologie generiert ──
const INFERRED_RELATION_TYPES = NORM_ONTOLOGY.relationTypes.filter((r) => isInferredRelation(r.id));

export const RELATION_DIRECTIONS = ['a-to-b', 'b-to-a'] as const;
export type RelationDirection = (typeof RELATION_DIRECTIONS)[number];
const DIRECTION_SET = new Set<string>(RELATION_DIRECTIONS);

// ─── Prompt (rein, testbar) ─────────────────────────────────────

export const RELATIONS_PRELABEL_SYSTEM =
  'You are a legal-informatics classifier. You decide whether a CROSS-NORM RELATION holds between two ' +
  'legal provisions from two different laws. You MUST choose the relation id only from the provided ' +
  'CLOSED list, or "none" if no such relation holds. Never invent a relation id, and never propose a ' +
  'relation that is not in the list. If a relation applies, you MUST also state its direction. Respond ' +
  'with STRICT JSON only, no prose.';

export function relationOptionsList(): string {
  return INFERRED_RELATION_TYPES.map((r) => `${r.id} (${r.label})`).join(', ');
}

/**
 * Minimaler Provisions-Ausschnitt, den der Prompt je Seite braucht.
 * Strukturell kompatibel zum Golden-Case (server, `RelationsGoldenCase['a']`)
 * UND zum Korpus-Dokument (crawler, RelationCandidateDoc) — bewusst plain,
 * damit beide Seiten ohne Zod-Abhängigkeit denselben Prompt bauen können
 * (dasselbe Entkopplungs-Muster wie TypingPromptProvision in typing/prompt.ts).
 */
export interface RelationsPromptSide {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
}

/** Das Paar, wie der Prompt es sieht: A = zitierendes Dokument, B = Ziel. */
export interface RelationsPromptPair {
  a: RelationsPromptSide;
  b: RelationsPromptSide;
}

export function renderSide(label: 'A' | 'B', side: RelationsPromptSide): string {
  return [
    `Paragraph ${label} [${side.source} ${side.paragraphNumber}${side.title ? ' — ' + side.title : ''}] (${side.language}):`,
    side.fullText,
  ].join('\n');
}

/**
 * Die Entscheidungsregeln aus RUBRIC.md Teil C, verdichtet für den Prompt.
 *
 * WARUM DAS HIER STEHEN MUSS: Der erste Zwei-Prüfer-Lauf ohne diese Regeln kam
 * auf Gesamt-Kappa 0,265 bei 81,7 % Rohübereinstimmung. Die Analyse der
 * Abweichungen war eindeutig — nahezu alle waren Fälle von C4 (paralleles
 * Schutzziel als Beziehung gelabelt) oder der Abgrenzung Verdrängung vs.
 * Konkretisierung aus C5. Beide Prüfer bekamen nur die Namensliste der
 * Beziehungsarten; die Rubrik hatten sie nie gesehen.
 *
 * Das entscheidet, wie die Zahl zu lesen ist: Ein niedriger Kappa misst nur
 * dann eine unklare Aufgabendefinition, wenn die Prüfer die Definition auch
 * bekommen haben. Sonst misst er die Lücke im Prompt. Deshalb wandert die
 * Rubrik in den Prompt — und deshalb ist das KEIN Modell-Tuning im Sinne von
 * § 7.4: es wird nichts an den Labels gedreht, sondern die Aufgabenstellung
 * überhaupt erst mitgeliefert.
 *
 * Bei Änderungen an RUBRIC.md Teil C ist dieser Text nachzuziehen — er ist
 * bewusst eine Verdichtung, keine zweite Quelle der Wahrheit.
 */
export const RELATIONS_RUBRIC_RULES = [
  'DECISION RULES (from RUBRIC.md part C incl. the C5a precedent catalogue — apply them strictly):',
  '',
  'RULE 1 — a parallel obligation is NOT a relation. This is the most common labeling error.',
  'Two provisions from different regimes may pursue the same protective goal (e.g. GDPR Art. 32 and',
  'NIS2 Art. 21 both require technical and organisational security measures) without either saying',
  'anything ABOUT the other. Correct label: "none". Test: does one of the two provisions EXPRESSLY',
  'refer to the other norm? Only an express reference can ground a relation — a provision that merely',
  'regulates the same subject matter "in addition to" the other law, WITHOUT citing its concrete',
  'article, is "none" (adjudicated precedent: AI-Act Art. 10 vs. GDPR Art. 9 — same subject, no',
  'article citation → none).',
  '',
  'RULE 2 — an express reference that merely USES the other norm is still NOT a relation.',
  'Feeding data into the other norm’s database or platform, contributing to its report, informing its',
  'body, coordinating competences, or granting a mere participation option — none of these change what',
  'the other norm requires, so the label is "none" EVEN IF the paired article is cited expressly',
  '(precedents: CRA Art. 16/17 feeding NIS2 Art. 12/16/18 mechanisms; DORA Art. 32 vs. NIS2 Art. 32',
  'mutual coordination — "without prejudice" means NIS2 keeps applying). Test: does the reference say',
  'something about the CONTENT or APPLICABILITY of the other provision, or does it only use/name it?',
  '',
  'RULE 3 — displacement vs. concretisation. Test: after applying the one, does the other still',
  'apply? If it stops applying in that area → PREVAILS_OVER / DEROGATED_BY (lex specialis; markers:',
  '"shall not apply to the extent that", sector-specific priority clauses). If it keeps applying and',
  'is merely filled in more precisely or supplemented ("in addition to", "complements") → CONCRETIZES.',
  'Equivalence-as-exception is displacement: where equivalence is the CONDITION for the other norm to',
  'stop applying ("where such requirements are at least equivalent … shall not apply"), the label is',
  'PREVAILS_OVER, not RECOGNIZES_EQUIVALENCE (precedent: DORA Art. 1 → NIS2 Art. 4).',
  '',
  'RULE 4 — concretisation vs. parameter. A concrete value, deadline or threshold → SETS_PARAMETER.',
  'Substantive elaboration without a fixed value → CONCRETIZES.',
  '',
  'RULE 5 — RECOGNIZES_EQUIVALENCE requires an actual conformity/recognition fiction ("shall be',
  'deemed to satisfy…", "gelten als konform") — pair it with the article the fiction clause names',
  '(precedent: CRA Art. 12 deeming AI-Act high-risk products compliant, anchored on AI-Act Art. 6/43).',
  'IMPLEMENTS requires an implementing act referring to a basic act.',
  '',
  'INTERPRETS requires the BORROW TEMPLATE in the citing sentence: a defined term stands in',
  'definiendum position, a borrow-operator follows ("within the meaning of Article X of Regulation Y",',
  '"as defined in Article X of …", "as referred to in Article X of …"), and the CITED article IS the',
  'paired target article. All three present → INTERPRETS. Its direction is DERIVED, never judged: it',
  'points FROM the norm that DEFINES the term (the cited/target norm) TO the norm that USES it (the',
  'citing norm). Determine which side carries the operator sentence; the direction always points away',
  'from the defined-term’s home norm (precedent: the norm borrowing "personal data" from GDPR Art. 4 →',
  'INTERPRETS pointing away from GDPR). A bare usage/competence reference WITHOUT a definiendum operator',
  'is "none", not INTERPRETS. Do not use any of these merely because the topics overlap.',
  '',
  'When in doubt between "none" and a relation, answer "none" — the set is conservative by design.',
].join('\n');

/**
 * Prompt-Version des Relations-Raters. rp-1 = C4/C5-Basisregeln (2026-07-22).
 * rp-2 = C5a-Präzedenzkatalog aus der Adjudikation vom 2026-07-25 (Nutzung ≠
 * Beziehung; Gleichwertigkeit-als-Ausnahme = Verdrängung; „gilt als konform" =
 * Equivalence; INTERPRETS-Richtung ab definierender Norm; NUR ausdrückliche
 * Verweise — „in substance" entfernt, Architekten-Entscheid D1).
 *
 * EINGEFROREN bis zur Baseline-Messung (Prompt-Freeze-Ratsche wie tp-2/tp-3,
 * Architekten-Entscheid Pre-Flight 2026-07-25). Bump bei JEDER inhaltlichen
 * Änderung an System/Rules/Template — Teil der Provenance und der
 * Batch-Idempotenz (relationScan.promptVersion).
 *
 * rp-3-draft = INTERPRETS geschärft auf die Schablonen-Regel + berechnete
 * Richtung (Definitions-Nachzug C-v1.2, THE-519). Finalisierung zu rp-3 erst
 * nach den Architekten-Regeln A/B (Task 5), § 7.4 — kein Tuning, die Definition
 * selbst hat sich geändert (drei v4-INTERPRETS-Fehler nur durch frei vergebene
 * Richtung / fehlenden Operator-Test möglich).
 */
export const RELATIONS_PROMPT_VERSION = 'rp-3-draft';

/** Baut den User-Prompt mit der geschlossenen inferred-Relations-Liste + dem Paar. Rein. */
export function buildRelationsPrompt(c: RelationsPromptPair): string {
  return [
    'Decide whether a cross-norm relation holds between paragraph A and paragraph B below, and if so, which one.',
    '',
    `relation: ${relationOptionsList()}, or "none" if no relation holds.`,
    '',
    RELATIONS_RUBRIC_RULES,
    '',
    renderSide('A', c.a),
    '',
    renderSide('B', c.b),
    '',
    'If "relation" is set to one of the ids above, you MUST also state "direction": "a-to-b" means the ' +
      'relation points FROM paragraph A TO paragraph B (A is the subject of the relation label, e.g. ' +
      '"A derogated_by B" means A is derogated by B); "b-to-a" means it points from B to A. Do not guess ' +
      'a direction you are not sure of — if unsure, respond "none" instead.',
    '',
    'Respond with exactly: {"relation": "...", "direction": "a-to-b"} or {"relation": "none"}',
  ].join('\n');
}

export interface ParsedRelationLabel {
  /** Absent = open (model did not commit / field missing). null = deliberate "no relation". An id = labeled. */
  relation?: string | null;
  /** Required when `relation` is an id; absent when `relation` is null/undefined. */
  direction?: RelationDirection;
  /** true when the model proposed something (a relation id and/or a direction) that had to be discarded. */
  dropped: boolean;
}

/**
 * Parst die Modell-JSON in ein validiertes Relations-Label. "none" → null
 * (bewusste Negativ-Aussage); fehlendes/leeres `relation` → offen (undefined,
 * kein Drop — das Modell hat sich schlicht nicht committed). Eine
 * Metadata-Relation ODER eine inferred-Relation ohne gültige `direction` wird
 * verworfen (`dropped: true`, Label bleibt offen) — nie geraten. Wirft NIE.
 */
export function parseRelationLabel(text: string): ParsedRelationLabel {
  let obj: Record<string, unknown> = {};
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }

  const rawRelation = obj.relation;
  if (rawRelation == null || rawRelation === '') {
    // Fehlendes Feld → offen, kein Drop (das Modell hat nichts behauptet).
    return { dropped: false };
  }
  if (rawRelation === 'none') {
    // Bewusste Negativ-Aussage: keine Relation → direction ist verboten.
    return { relation: null, dropped: false };
  }

  const relationId = String(rawRelation);
  if (!isInferredRelation(relationId)) {
    // Metadata-Relation (verboten) ODER komplett erfunden → OOV-Drop.
    return { dropped: true };
  }

  const rawDirection = obj.direction;
  const direction = typeof rawDirection === 'string' ? rawDirection : undefined;
  if (!direction || !DIRECTION_SET.has(direction)) {
    // Relation ohne gültige Richtung ist unvollständig → offen lassen, nicht raten.
    return { dropped: true };
  }

  return { relation: relationId, direction: direction as RelationDirection, dropped: false };
}
