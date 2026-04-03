/**
 * ArchiMate 3.2 Notation Icon Atlas
 *
 * Maps every ElementType to a grid index inside a shared 512×512 texture atlas
 * (8×8 grid = 64 cells, each 64×64 px). The atlas is built once on the client
 * via Canvas2D; this file is pure data with no rendering dependency.
 */
import type { ElementType } from '../types/architecture.types';

// ─── Atlas grid constants ───────────────────────────────────

export const ICON_ATLAS_GRID = 8;
export const ICON_ATLAS_SIZE = 512;
export const ICON_CELL_SIZE = ICON_ATLAS_SIZE / ICON_ATLAS_GRID; // 64

// ─── Icon shape identifiers ────────────────────────────────
// Each shape maps to a canvas draw function on the client side.
// Multiple element types can share the same shape.

export type IconShape =
  | 'stick_figure'
  | 'role'
  | 'collaboration'
  | 'interface'
  | 'process'
  | 'function'
  | 'interaction'
  | 'event'
  | 'service'
  | 'object'
  | 'contract'
  | 'representation'
  | 'product'
  | 'component'
  | 'data_object'
  | 'node_3d'
  | 'device'
  | 'system_software'
  | 'network'
  | 'path'
  | 'artifact'
  | 'equipment'
  | 'facility'
  | 'distribution'
  | 'material'
  | 'driver'
  | 'assessment'
  | 'goal'
  | 'outcome'
  | 'principle'
  | 'requirement'
  | 'constraint'
  | 'meaning'
  | 'value'
  | 'work_package'
  | 'deliverable'
  | 'plateau'
  | 'gap'
  | 'grouping'
  | 'location'
  | 'capability'
  | 'value_stream'
  | 'resource'
  | 'course_of_action'
  | 'ai_agent'
  | 'fallback';

export interface IconEntry {
  index: number;
  shape: IconShape;
}

// ─── Element type → atlas cell mapping ─────────────────────

export const ARCHIMATE_ICON_MAP: Partial<Record<ElementType, IconEntry>> = {
  // Strategy Layer (row 0, cells 0-3)
  business_capability:       { index: 0,  shape: 'capability' },
  value_stream:              { index: 1,  shape: 'value_stream' },
  resource:                  { index: 2,  shape: 'resource' },
  course_of_action:          { index: 3,  shape: 'course_of_action' },

  // Business Layer — Active Structure (row 0, cells 4-7)
  business_actor:            { index: 4,  shape: 'stick_figure' },
  business_role:             { index: 5,  shape: 'role' },
  business_collaboration:    { index: 6,  shape: 'collaboration' },
  business_interface:        { index: 7,  shape: 'interface' },

  // Business Layer — Behavioral (row 1, cells 0-3)
  process:                   { index: 8,  shape: 'process' },
  business_function:         { index: 9,  shape: 'function' },
  business_interaction:      { index: 10, shape: 'interaction' },
  business_event:            { index: 11, shape: 'event' },

  // Business Layer — Passive (row 1, cells 4-7)
  business_service:          { index: 12, shape: 'service' },
  business_object:           { index: 13, shape: 'object' },
  contract:                  { index: 14, shape: 'contract' },
  representation:            { index: 15, shape: 'representation' },

  // Business Composite + Application Active (row 2)
  product:                   { index: 16, shape: 'product' },
  application_component:     { index: 17, shape: 'component' },
  application_collaboration: { index: 18, shape: 'collaboration' },
  application_interface:     { index: 19, shape: 'interface' },
  application_function:      { index: 20, shape: 'function' },
  application_interaction:   { index: 21, shape: 'interaction' },
  application_process:       { index: 22, shape: 'process' },
  application_event:         { index: 23, shape: 'event' },

  // Application Passive + Technology (row 3)
  application_service:       { index: 24, shape: 'service' },
  data_object:               { index: 25, shape: 'data_object' },
  node:                      { index: 26, shape: 'node_3d' },
  device:                    { index: 27, shape: 'device' },
  system_software:           { index: 28, shape: 'system_software' },
  technology_collaboration:  { index: 29, shape: 'collaboration' },
  technology_interface:      { index: 30, shape: 'interface' },
  technology_function:       { index: 31, shape: 'function' },

  // Technology cont. (row 4)
  technology_process:        { index: 32, shape: 'process' },
  technology_interaction:    { index: 33, shape: 'interaction' },
  technology_event:          { index: 34, shape: 'event' },
  technology_service:        { index: 35, shape: 'service' },
  artifact:                  { index: 36, shape: 'artifact' },
  communication_network:     { index: 37, shape: 'network' },
  path:                      { index: 38, shape: 'path' },

  // Physical Layer (row 4 cont + row 5)
  equipment:                 { index: 39, shape: 'equipment' },
  facility:                  { index: 40, shape: 'facility' },
  distribution_network:      { index: 41, shape: 'distribution' },
  material:                  { index: 42, shape: 'material' },

  // Motivation Layer (row 5 cont + row 6)
  stakeholder:               { index: 43, shape: 'stick_figure' },
  driver:                    { index: 44, shape: 'driver' },
  assessment:                { index: 45, shape: 'assessment' },
  goal:                      { index: 46, shape: 'goal' },
  outcome:                   { index: 47, shape: 'outcome' },
  principle:                 { index: 48, shape: 'principle' },
  requirement:               { index: 49, shape: 'requirement' },
  constraint:                { index: 50, shape: 'constraint' },
  meaning:                   { index: 51, shape: 'meaning' },
  am_value:                  { index: 52, shape: 'value' },

  // Implementation & Migration (row 6 cont + row 7)
  work_package:              { index: 53, shape: 'work_package' },
  deliverable:               { index: 54, shape: 'deliverable' },
  implementation_event:      { index: 55, shape: 'event' },
  plateau:                   { index: 56, shape: 'plateau' },
  gap:                       { index: 57, shape: 'gap' },

  // Composite / Other (row 7 cont)
  grouping:                  { index: 58, shape: 'grouping' },
  location:                  { index: 59, shape: 'location' },

  // Extensions
  ai_agent:                  { index: 60, shape: 'ai_agent' },

  // Legacy aliases → same cell as canonical type
  data_entity:               { index: 25, shape: 'data_object' },
  data_model:                { index: 25, shape: 'data_object' },
};

/** Fallback icon index for unknown / unmapped types */
export const FALLBACK_ICON_INDEX = 63;
export const FALLBACK_ICON_SHAPE: IconShape = 'fallback';

/** Total unique icon cells used (for atlas builder iteration) */
export const ICON_CELL_COUNT = 61;
