/**
 * UC-METH-001 — limits of the ladder assessment.
 *
 * The assessment runs inside a request, on a model any user can make as large as they like.
 * Its work must therefore not grow faster than the model. Inside the limits the result is the
 * same as without them; where a limit applies, the report says so — nothing is cut off silently.
 */

/** Above this number of contexts the cover is not analysed: rung 2 stays open and names the limit. */
export const MAX_CONTEXTS = 200;

/** Triple overlaps are counted up to this number; beyond it the report says "a minimum of" and that the count stopped. */
export const MAX_COUNTED_TRIPLE_OVERLAPS = 10_000;

/**
 * Counting triple overlaps also stops after this many candidates. A triple shared through many
 * different sets of contexts is found again and again without adding to the count; this bounds
 * that work as well.
 */
export const MAX_CHECKED_TRIPLE_CANDIDATES = 1_000_000;

/** A quantity with more translations is not classified: no complex is built for it. */
export const MAX_TRANSLATIONS_PER_QUANTITY = 500;

/**
 * A quantity with more faces is not classified: the exact rank over ℚ grows steeply with the faces.
 * A face is a triangle of translations whose three contexts share a member. Parallel translations
 * multiply: three contexts with 8 translations on each side have 512 faces. The report therefore
 * names this limit as one on "sets of three conversion factors", not on sets of three groups.
 */
export const MAX_FACES_PER_QUANTITY = 500;

/**
 * Quantities are looked at in the order of their names until their translations add up to this
 * number; a quantity that would take the sum above it is not classified. Without it, many
 * quantities that each stay within the two limits above would add up without bound.
 */
export const MAX_TRANSLATIONS_PER_REPORT = 1_000;

/**
 * A triangle of translations is a face if its three contexts share a member; to find one, the
 * members of the smallest of the three are gone through. Once this many members have been
 * looked at in one report, the quantity at hand and every later one with a triangle left to
 * test is not classified. The report names this number as the reason: such a quantity need not
 * be large itself.
 */
export const MAX_COMPARED_MEMBERS = 20_000_000;

/**
 * Of the loops with a defect and of the triple overlaps with a defect, a report lists this many
 * per quantity — the first ones, in the order they are found — and gives the number of all of
 * them. A loop can pass through every context, so the answer would otherwise grow with the
 * product of loops and contexts.
 */
export const MAX_REPORTED_DEFECTS_PER_QUANTITY = 20;
