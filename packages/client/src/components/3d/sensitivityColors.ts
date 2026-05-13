/**
 * REQ-DATA-008 — Sensitivity-Color Coding in 3D Scene
 *
 * Maps the data-object sensitivity classification (set by Generator-D
 * at apply-time, see aiGenerator.routes.ts) to scene-friendly hex
 * colors. Mirrors the Tailwind palette used in DataObjectSuggestionModal
 * so the in-modal preview matches what the user sees in the 3D scene
 * once the element is applied.
 *
 * Colors picked from Tailwind 500-shade so they pop on the dark
 * background of TheArchitect's scene without burning out.
 *
 * Sensitivity classification (Generator-D, DSGVO-aligned):
 *   PII          - personal data, highest concern (red)
 *   confidential - business-confidential / NDA (orange)
 *   internal     - non-public but routine (yellow)
 *   public       - already disclosed / non-sensitive (green)
 */

export type Sensitivity = 'PII' | 'confidential' | 'internal' | 'public';

/**
 * Duck-typed element shape so the helper accepts both the store-internal
 * ArchitectureElement (client/src/stores/architectureStore.ts) and the
 * shared one (packages/shared) without coupling.
 */
interface SensitivityElement {
  type: string;
  metadata?: Record<string, unknown>;
}

export const SENSITIVITY_HEX: Record<Sensitivity, string> = {
  PII:          '#ef4444', // red-500
  confidential: '#f97316', // orange-500
  internal:     '#eab308', // yellow-500
  public:       '#22c55e', // green-500
};

/**
 * Types eligible for sensitivity coloring — anything that holds data.
 * Keeping this narrow so we don't accidentally re-color stakeholders or
 * processes just because they happen to have a metadata.sensitivity
 * field set.
 */
const DATA_TYPES = new Set<string>(['data_object', 'data_entity', 'data_model']);

/**
 * Returns the sensitivity hex color for an element, or null when the
 * element is not a data-type or has no sensitivity classification.
 * Callers fall back to layer color when null.
 */
export function getSensitivityColor(element: SensitivityElement): string | null {
  if (!DATA_TYPES.has(element.type)) return null;

  const sensitivity = element.metadata?.sensitivity;
  if (typeof sensitivity !== 'string') return null;
  if (!(sensitivity in SENSITIVITY_HEX)) return null;

  return SENSITIVITY_HEX[sensitivity as Sensitivity];
}

/**
 * Human-readable label for the property panel + legend.
 */
export function getSensitivityLabel(sensitivity: string): string {
  switch (sensitivity) {
    case 'PII':          return 'PII (Personal)';
    case 'confidential': return 'Confidential';
    case 'internal':     return 'Internal';
    case 'public':       return 'Public';
    default:             return sensitivity;
  }
}
