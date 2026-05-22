/**
 * UC-ICM-002 D3 — Element-Resolver für Compliance-Mapping.
 *
 * Holt ArchiMate-Elemente aus Neo4j und mappt sie auf das von
 * complianceMapping.service erwartete `CandidateElement[]`-Shape.
 *
 * Type-Mapping: Die ArchiMate-3.2-Type-Liste ist >40 Werte groß
 * (`business_capability`, `process`, `application_component`, ...).
 * Das ComplianceMapping-Model erlaubt nur 13 logische Buckets.
 * Hier wird normalisiert: alles unbekannte → 'custom'.
 *
 * Linear: THE-280 (REQ-ICM-002.3)
 */
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import type { ComplianceMappingElementType } from '@thearchitect/shared';
import type { CandidateElement } from './complianceMapping.service';

// ─── Type-Normalisierung ────────────────────────────────────────

/**
 * Map ArchiMate 3.2 element type → ComplianceMapping element type bucket.
 * Unknown types fall back to 'custom'.
 */
export function normalizeElementType(
  archiMateType: string | undefined | null,
): ComplianceMappingElementType {
  if (!archiMateType) return 'custom';
  const t = archiMateType.toLowerCase();

  // Exact ArchiMate 3.2 types we explicitly bucket
  if (t === 'capability' || t === 'business_capability') return 'capability';
  if (t === 'application' || t === 'application_component') return 'application';
  if (t === 'data_object') return 'data_object';
  if (t === 'process' || t === 'business_process') return 'business_process';
  if (t === 'business_actor') return 'business_actor';
  if (t === 'business_service') return 'business_service';
  if (t === 'application_service') return 'application_service';
  if (t === 'business_function') return 'business_function';
  if (t === 'business_object') return 'business_object';
  if (t === 'business_role') return 'business_role';
  if (t === 'technology_service') return 'technology_service';
  if (t === 'node') return 'node';

  // Heuristics for similar buckets
  if (t.startsWith('business_')) return 'business_function';
  if (t.startsWith('application_')) return 'application_service';
  if (t.startsWith('technology_')) return 'technology_service';

  return 'custom';
}

// ─── Element-Loader ─────────────────────────────────────────────

/**
 * Fetch all ArchiMate elements for a project from Neo4j, normalize to
 * `CandidateElement[]` shape expected by the compliance mapping service.
 *
 * `name` is required; we drop elements without an id or name.
 */
export async function loadProjectCandidateElements(
  projectId: string,
): Promise<CandidateElement[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.description as description
     ORDER BY e.layer, e.name`,
    { projectId },
  );

  const candidates: CandidateElement[] = [];
  for (const r of records) {
    const props = serializeNeo4jProperties(r.toObject());
    const id = props.id != null ? String(props.id) : '';
    const name = props.name != null ? String(props.name) : '';
    if (!id || !name) continue;

    candidates.push({
      id,
      name,
      type: normalizeElementType(props.type as string | undefined),
      layer: props.layer != null ? String(props.layer) : undefined,
      description:
        props.description != null
          ? String(props.description).slice(0, 280)
          : undefined,
    });
  }
  return candidates;
}
