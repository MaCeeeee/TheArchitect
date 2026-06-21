/**
 * Provenance-Helper — Trust-Spine Fundament (UC-PROV-001 / THE-320, REQ-PROV-001.1).
 *
 * Zentrale Stelle, über die ALLE Producer Herkunft + Konfidenz auf ArchiMate-Atome
 * (Neo4j-Nodes & CONNECTS_TO-Relationships) stempeln. Ein einziger Helper macht die
 * ~35 Schreibpfade prüfbar-vollständig (sonst: vergessener Producer schreibt stumm nichts).
 *
 * Naming-Entscheidung „adopt clean":
 *  - `provenance` / `certifiedBy` / `certifiedAt` = NEU (null Konfliktfläche)
 *  - `source` / `confidence` = ADOPTIERT (existieren bereits auf Auto-Heal-/Projection-Edges)
 *    → niemals blind überschreiben.
 */
import type { Provenance, ProvenanceFields } from '@thearchitect/shared';

/**
 * Bildet einen vorhandenen `source`-Wert auf ein Provenance-Enum ab.
 * Genutzt v.a. beim Backfill von Bestands-Edges (REQ-PROV-001.4), wo nur `source`
 * existiert. Neue Producer setzen `provenance` explizit statt abzuleiten.
 */
const SOURCE_TO_PROVENANCE: Readonly<Record<string, Provenance>> = {
  'ai-heal': 'ai_generated',
  'compliance-requirement': 'ai_generated',
  csv: 'import',
  bpmn: 'import',
  n8n: 'import',
  blueprint: 'import',
};

export function deriveProvenance(source?: string | null): Provenance {
  if (!source) return 'user';
  return SOURCE_TO_PROVENANCE[source] ?? 'user';
}

/**
 * Cypher-`SET`-Fragment für ALLE fünf Provenance-Felder. Für Producer, die ein
 * Atom neu anlegen und ihre Herkunft vollständig kennen.
 *
 * Beispiel:  `MERGE (e) ON CREATE SET ${provenanceCypherFragment('e')}`
 *            + Params aus `provenanceParams({ provenance: 'import', source: 'csv' })`
 */
export function provenanceCypherFragment(nodeVar = 'e', prefix = 'prov_'): string {
  return [
    `${nodeVar}.provenance = $${prefix}provenance`,
    `${nodeVar}.source = $${prefix}source`,
    `${nodeVar}.confidence = $${prefix}confidence`,
    `${nodeVar}.certifiedBy = $${prefix}certifiedBy`,
    `${nodeVar}.certifiedAt = $${prefix}certifiedAt`,
  ].join(', ');
}

/**
 * Cypher-`SET`-Fragment NUR für die drei Neu-Felder (`provenance`, `certifiedBy`,
 * `certifiedAt`). Für Producer, die `source`/`confidence` bereits selbst setzen
 * (Auto-Heal, RequirementProjection) — verhindert das Überschreiben von Bestandswerten.
 */
export function provenanceCoreFragment(nodeVar = 'e', prefix = 'prov_'): string {
  return [
    `${nodeVar}.provenance = $${prefix}provenance`,
    `${nodeVar}.certifiedBy = $${prefix}certifiedBy`,
    `${nodeVar}.certifiedAt = $${prefix}certifiedAt`,
  ].join(', ');
}

/**
 * Param-Map passend zum Fragment. Default `provenance: 'user'`; alle übrigen
 * Felder `null`, wenn ungesetzt (Neo4j speichert keine `undefined`-Properties).
 */
export function provenanceParams(
  p: Partial<ProvenanceFields> = {},
  prefix = 'prov_',
): Record<string, unknown> {
  return {
    [`${prefix}provenance`]: p.provenance ?? 'user',
    [`${prefix}source`]: p.source ?? null,
    [`${prefix}confidence`]: p.confidence ?? null,
    [`${prefix}certifiedBy`]: p.certifiedBy ?? null,
    [`${prefix}certifiedAt`]: p.certifiedAt ?? null,
  };
}
