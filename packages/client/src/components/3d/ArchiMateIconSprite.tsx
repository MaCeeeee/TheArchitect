/**
 * ArchiMateIconSprite
 *
 * Renders a billboard sprite showing the ArchiMate 3.2 notation icon for an
 * element type. All icons live on a single 512×512 Canvas texture atlas
 * (built once, cached at module scope). Each sprite's UV is offset to show
 * only its cell.
 */
import { useMemo } from 'react';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// Atlas constants & icon map (self-contained — no shared import
// needed for Vite dev-mode compatibility)
// ═══════════════════════════════════════════════════════════════

const ICON_ATLAS_GRID = 8;
const ICON_ATLAS_SIZE = 512;
const ICON_CELL_SIZE = ICON_ATLAS_SIZE / ICON_ATLAS_GRID; // 64
const FALLBACK_ICON_INDEX = 63;

type IconShape =
  | 'stick_figure' | 'role' | 'collaboration' | 'interface'
  | 'process' | 'function' | 'interaction' | 'event'
  | 'service' | 'object' | 'contract' | 'representation'
  | 'product' | 'component' | 'data_object' | 'node_3d'
  | 'device' | 'system_software' | 'network' | 'path'
  | 'artifact' | 'equipment' | 'facility' | 'distribution'
  | 'material' | 'driver' | 'assessment' | 'goal'
  | 'outcome' | 'principle' | 'requirement' | 'constraint'
  | 'meaning' | 'value' | 'work_package' | 'deliverable'
  | 'plateau' | 'gap' | 'grouping' | 'location'
  | 'capability' | 'value_stream' | 'resource' | 'course_of_action'
  | 'ai_agent' | 'fallback';

interface IconEntry { index: number; shape: IconShape }

const ARCHIMATE_ICON_MAP: Record<string, IconEntry> = {
  // Strategy
  business_capability:       { index: 0,  shape: 'capability' },
  value_stream:              { index: 1,  shape: 'value_stream' },
  resource:                  { index: 2,  shape: 'resource' },
  course_of_action:          { index: 3,  shape: 'course_of_action' },
  // Business — Active Structure
  business_actor:            { index: 4,  shape: 'stick_figure' },
  business_role:             { index: 5,  shape: 'role' },
  business_collaboration:    { index: 6,  shape: 'collaboration' },
  business_interface:        { index: 7,  shape: 'interface' },
  // Business — Behavioral
  process:                   { index: 8,  shape: 'process' },
  business_function:         { index: 9,  shape: 'function' },
  business_interaction:      { index: 10, shape: 'interaction' },
  business_event:            { index: 11, shape: 'event' },
  // Business — Passive
  business_service:          { index: 12, shape: 'service' },
  business_object:           { index: 13, shape: 'object' },
  contract:                  { index: 14, shape: 'contract' },
  representation:            { index: 15, shape: 'representation' },
  // Business Composite + Application
  product:                   { index: 16, shape: 'product' },
  application_component:     { index: 17, shape: 'component' },
  application_collaboration: { index: 18, shape: 'collaboration' },
  application_interface:     { index: 19, shape: 'interface' },
  application_function:      { index: 20, shape: 'function' },
  application_interaction:   { index: 21, shape: 'interaction' },
  application_process:       { index: 22, shape: 'process' },
  application_event:         { index: 23, shape: 'event' },
  // Application Passive + Technology
  application_service:       { index: 24, shape: 'service' },
  data_object:               { index: 25, shape: 'data_object' },
  node:                      { index: 26, shape: 'node_3d' },
  device:                    { index: 27, shape: 'device' },
  system_software:           { index: 28, shape: 'system_software' },
  technology_collaboration:  { index: 29, shape: 'collaboration' },
  technology_interface:      { index: 30, shape: 'interface' },
  technology_function:       { index: 31, shape: 'function' },
  // Technology cont.
  technology_process:        { index: 32, shape: 'process' },
  technology_interaction:    { index: 33, shape: 'interaction' },
  technology_event:          { index: 34, shape: 'event' },
  technology_service:        { index: 35, shape: 'service' },
  artifact:                  { index: 36, shape: 'artifact' },
  communication_network:     { index: 37, shape: 'network' },
  path:                      { index: 38, shape: 'path' },
  // Physical
  equipment:                 { index: 39, shape: 'equipment' },
  facility:                  { index: 40, shape: 'facility' },
  distribution_network:      { index: 41, shape: 'distribution' },
  material:                  { index: 42, shape: 'material' },
  // Motivation
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
  // Implementation & Migration
  work_package:              { index: 53, shape: 'work_package' },
  deliverable:               { index: 54, shape: 'deliverable' },
  implementation_event:      { index: 55, shape: 'event' },
  plateau:                   { index: 56, shape: 'plateau' },
  gap:                       { index: 57, shape: 'gap' },
  // Composite
  grouping:                  { index: 58, shape: 'grouping' },
  location:                  { index: 59, shape: 'location' },
  // Extensions
  ai_agent:                  { index: 60, shape: 'ai_agent' },
  // Legacy aliases
  data_entity:               { index: 25, shape: 'data_object' },
  data_model:                { index: 25, shape: 'data_object' },
};

// ═══════════════════════════════════════════════════════════════
// Module-level singletons
// ═══════════════════════════════════════════════════════════════

let atlasTexture: THREE.CanvasTexture | null = null;
const materialCache = new Map<string, THREE.SpriteMaterial>();

// ═══════════════════════════════════════════════════════════════
// Icon draw functions — one per IconShape
// ═══════════════════════════════════════════════════════════════

type DrawFn = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void;

/** Stick figure (Business Actor, Stakeholder) */
const drawStickFigure: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.28, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.14);
  ctx.lineTo(cx, cy + s * 0.15);
  ctx.moveTo(cx - s * 0.2, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.02);
  ctx.moveTo(cx - s * 0.15, cy + s * 0.38);
  ctx.lineTo(cx, cy + s * 0.15);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.38);
  ctx.stroke();
};

/** Role (circle with vertical line) */
const drawRole: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.2;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.12, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + r - s * 0.12);
  ctx.lineTo(cx, cy + s * 0.38);
  ctx.stroke();
};

/** Collaboration (two overlapping circles) */
const drawCollaboration: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.18;
  const offset = s * 0.14;
  ctx.beginPath();
  ctx.arc(cx - offset, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + offset, cy, r, 0, Math.PI * 2);
  ctx.stroke();
};

/** Interface (circle with extending line) */
const drawInterface: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r, cy);
  ctx.lineTo(cx + s * 0.38, cy);
  ctx.stroke();
};

/** Process (right-pointing chevron/arrow) */
const drawProcess: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.35;
  const h = s * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w * 0.4, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx + w * 0.4, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.closePath();
  ctx.stroke();
  // Internal arrow
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy);
  ctx.lineTo(cx + s * 0.15, cy);
  ctx.moveTo(cx + s * 0.08, cy - s * 0.06);
  ctx.lineTo(cx + s * 0.15, cy);
  ctx.lineTo(cx + s * 0.08, cy + s * 0.06);
  ctx.stroke();
};

/** Function (rounded chevron) */
const drawFunction: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w * 0.5, cy - h);
  ctx.quadraticCurveTo(cx + w + s * 0.05, cy, cx + w * 0.5, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.closePath();
  ctx.stroke();
};

/** Interaction (bi-directional chevron) */
const drawInteraction: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.32;
  const h = s * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.lineTo(cx - w * 0.4, cy - h);
  ctx.lineTo(cx + w * 0.4, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx + w * 0.4, cy + h);
  ctx.lineTo(cx - w * 0.4, cy + h);
  ctx.closePath();
  ctx.stroke();
};

/** Event (signal / notched shape) */
const drawEvent: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.32;
  const h = s * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w * 0.5, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx + w * 0.5, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.lineTo(cx - w * 0.4, cy);
  ctx.closePath();
  ctx.stroke();
};

/** Service (rounded rectangle) */
const drawService: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.34;
  const h = s * 0.18;
  const r = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(cx - w + r, cy - h);
  ctx.lineTo(cx + w - r, cy - h);
  ctx.quadraticCurveTo(cx + w, cy - h, cx + w, cy - h + r);
  ctx.lineTo(cx + w, cy + h - r);
  ctx.quadraticCurveTo(cx + w, cy + h, cx + w - r, cy + h);
  ctx.lineTo(cx - w + r, cy + h);
  ctx.quadraticCurveTo(cx - w, cy + h, cx - w, cy + h - r);
  ctx.lineTo(cx - w, cy - h + r);
  ctx.quadraticCurveTo(cx - w, cy - h, cx - w + r, cy - h);
  ctx.closePath();
  ctx.stroke();
};

/** Object (flat rectangle) */
const drawObject: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.25;
  ctx.strokeRect(cx - w, cy - h, w * 2, h * 2);
};

/** Contract (rectangle with two horizontal lines) */
const drawContract: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.25;
  ctx.strokeRect(cx - w, cy - h, w * 2, h * 2);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h * 0.3);
  ctx.lineTo(cx + w, cy - h * 0.3);
  ctx.moveTo(cx - w, cy + h * 0.3);
  ctx.lineTo(cx + w, cy + h * 0.3);
  ctx.stroke();
};

/** Representation (rectangle with wavy bottom) */
const drawRepresentation: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy - h);
  ctx.lineTo(cx + w, cy + h * 0.6);
  // wavy bottom
  ctx.quadraticCurveTo(cx + w * 0.5, cy + h * 1.1, cx, cy + h * 0.6);
  ctx.quadraticCurveTo(cx - w * 0.5, cy + h * 0.1, cx - w, cy + h * 0.6);
  ctx.closePath();
  ctx.stroke();
};

/** Product (box with small banner at top) */
const drawProduct: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.25;
  ctx.strokeRect(cx - w, cy - h, w * 2, h * 2);
  ctx.fillRect(cx - w, cy - h, w * 2, h * 0.35);
};

/** Component (UML-style: rect with two small tabs on left) */
const drawComponent: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.28;
  const h = s * 0.28;
  const tabW = s * 0.1;
  const tabH = s * 0.08;
  ctx.strokeRect(cx - w + tabW * 0.5, cy - h, w * 2 - tabW * 0.5, h * 2);
  // top tab
  ctx.strokeRect(cx - w - tabW * 0.5, cy - h * 0.55, tabW, tabH * 2);
  ctx.fillRect(cx - w - tabW * 0.5, cy - h * 0.55, tabW, tabH * 2);
  // bottom tab
  ctx.strokeRect(cx - w - tabW * 0.5, cy + h * 0.15, tabW, tabH * 2);
  ctx.fillRect(cx - w - tabW * 0.5, cy + h * 0.15, tabW, tabH * 2);
};

/** Data Object (rectangle with top line) */
const drawDataObject: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.28;
  ctx.strokeRect(cx - w, cy - h, w * 2, h * 2);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h + h * 0.35);
  ctx.lineTo(cx + w, cy - h + h * 0.35);
  ctx.stroke();
};

/** Node (isometric 3D box) */
const drawNode3D: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.28;
  const h = s * 0.22;
  const d = s * 0.12;
  // Front face
  ctx.strokeRect(cx - w, cy - h + d, w * 2, h * 2);
  // Top face
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h + d);
  ctx.lineTo(cx - w + d, cy - h);
  ctx.lineTo(cx + w + d, cy - h);
  ctx.lineTo(cx + w, cy - h + d);
  ctx.closePath();
  ctx.stroke();
  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + w, cy - h + d);
  ctx.lineTo(cx + w + d, cy - h);
  ctx.lineTo(cx + w + d, cy + h);
  ctx.lineTo(cx + w, cy + h + d);
  ctx.closePath();
  ctx.stroke();
};

/** Device (monitor shape) */
const drawDevice: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.32;
  const h = s * 0.2;
  ctx.strokeRect(cx - w, cy - h - s * 0.05, w * 2, h * 1.6);
  // Stand
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, cy + h * 0.55 + s * 0.02);
  ctx.lineTo(cx + s * 0.12, cy + h * 0.55 + s * 0.02);
  ctx.lineTo(cx + s * 0.18, cy + s * 0.38);
  ctx.lineTo(cx - s * 0.18, cy + s * 0.38);
  ctx.closePath();
  ctx.stroke();
};

/** System Software (circle) */
const drawSystemSoftware: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
  ctx.stroke();
};

/** Communication Network (line with dots) */
const drawNetwork: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.06;
  // Three dots connected by lines
  const pts: [number, number][] = [
    [cx - s * 0.28, cy + s * 0.1],
    [cx, cy - s * 0.2],
    [cx + s * 0.28, cy + s * 0.1],
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.stroke();
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Path (dashed line) */
const drawPath: DrawFn = (ctx, cx, cy, s) => {
  ctx.save();
  ctx.setLineDash([s * 0.06, s * 0.04]);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.35, cy);
  ctx.lineTo(cx + s * 0.35, cy);
  ctx.stroke();
  ctx.restore();
  // endpoints
  const r = s * 0.05;
  ctx.beginPath();
  ctx.arc(cx - s * 0.35, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.35, cy, r, 0, Math.PI * 2);
  ctx.fill();
};

/** Artifact (document with folded corner) */
const drawArtifact: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.24;
  const h = s * 0.32;
  const fold = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w - fold, cy - h);
  ctx.lineTo(cx + w, cy - h + fold);
  ctx.lineTo(cx + w, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.closePath();
  ctx.stroke();
  // fold line
  ctx.beginPath();
  ctx.moveTo(cx + w - fold, cy - h);
  ctx.lineTo(cx + w - fold, cy - h + fold);
  ctx.lineTo(cx + w, cy - h + fold);
  ctx.stroke();
};

/** Equipment (gear/cog) */
const drawEquipment: DrawFn = (ctx, cx, cy, s) => {
  const outer = s * 0.3;
  const inner = s * 0.2;
  const teeth = 6;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (i * Math.PI) / teeth - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
};

/** Facility (building) */
const drawFacility: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.32;
  // Main building
  ctx.strokeRect(cx - w, cy - h * 0.3, w * 1.3, h * 1.3);
  // Tower
  ctx.strokeRect(cx + w * 0.3 - s * 0.02, cy - h, w * 0.7 + s * 0.02, h * 2);
  // Door
  ctx.strokeRect(cx - w * 0.3, cy + h * 0.4, w * 0.5, h * 0.6);
};

/** Distribution Network (network with horizontal line) */
const drawDistribution: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.35, cy);
  ctx.lineTo(cx + s * 0.35, cy);
  ctx.stroke();
  // nodes
  const r = s * 0.06;
  for (const x of [cx - s * 0.25, cx, cx + s * 0.25]) {
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Material (rectangle with diagonal) */
const drawMaterial: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.28;
  const h = s * 0.22;
  ctx.strokeRect(cx - w, cy - h, w * 2, h * 2);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy + h);
  ctx.lineTo(cx - w + w * 0.5, cy - h);
  ctx.stroke();
};

/** Driver (flag) */
const drawDriver: DrawFn = (ctx, cx, cy, s) => {
  // Pole
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.35);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.35);
  ctx.stroke();
  // Flag
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.35);
  ctx.lineTo(cx + s * 0.25, cy - s * 0.2);
  ctx.lineTo(cx - s * 0.2, cy - s * 0.05);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
};

/** Assessment (starburst / triangle) */
const drawAssessment: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.28;
  const points = 6;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.5;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
};

/** Goal (unfilled ellipse) */
const drawGoal: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.32, s * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
  // inner ring
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.18, s * 0.12, 0, 0, Math.PI * 2);
  ctx.stroke();
};

/** Outcome (filled bullseye) */
const drawOutcome: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.3, s * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.16, s * 0.12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
};

/** Principle (open book) */
const drawPrinciple: DrawFn = (ctx, cx, cy, s) => {
  // left page
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.25);
  ctx.quadraticCurveTo(cx - s * 0.35, cy - s * 0.28, cx - s * 0.35, cy - s * 0.15);
  ctx.lineTo(cx - s * 0.35, cy + s * 0.25);
  ctx.quadraticCurveTo(cx - s * 0.15, cy + s * 0.2, cx, cy + s * 0.25);
  ctx.stroke();
  // right page
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.25);
  ctx.quadraticCurveTo(cx + s * 0.35, cy - s * 0.28, cx + s * 0.35, cy - s * 0.15);
  ctx.lineTo(cx + s * 0.35, cy + s * 0.25);
  ctx.quadraticCurveTo(cx + s * 0.15, cy + s * 0.2, cx, cy + s * 0.25);
  ctx.stroke();
  // spine
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.25);
  ctx.lineTo(cx, cy + s * 0.25);
  ctx.stroke();
};

/** Requirement (exclamation in ellipse) */
const drawRequirement: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.3, s * 0.24, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Exclamation
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.14);
  ctx.lineTo(cx, cy + s * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.12, s * 0.025, 0, Math.PI * 2);
  ctx.fill();
};

/** Constraint (ellipse with horizontal bar) */
const drawConstraint: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.3, s * 0.24, 0, 0, Math.PI * 2);
  ctx.stroke();
  // bar
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy);
  ctx.lineTo(cx + s * 0.2, cy);
  ctx.stroke();
};

/** Meaning (cloud/thought) */
const drawMeaning: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx - s * 0.1, cy, s * 0.18, Math.PI * 0.7, Math.PI * 1.8);
  ctx.arc(cx + s * 0.08, cy - s * 0.08, s * 0.16, Math.PI * 1.2, Math.PI * 0.3);
  ctx.arc(cx + s * 0.12, cy + s * 0.08, s * 0.14, Math.PI * 1.6, Math.PI * 0.7);
  ctx.closePath();
  ctx.stroke();
};

/** Value (diamond) */
const drawValue: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.28;
  const h = s * 0.32;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w, cy);
  ctx.closePath();
  ctx.stroke();
};

/** Work Package (box with cross-ribbon) */
const drawWorkPackage: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.28;
  const h = s * 0.24;
  ctx.strokeRect(cx - w, cy - h, w * 2, h * 2);
  // cross ribbon
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx, cy + h);
  ctx.moveTo(cx - w, cy);
  ctx.lineTo(cx + w, cy);
  ctx.stroke();
};

/** Deliverable (document) */
const drawDeliverable: DrawFn = (ctx, cx, cy, s) => {
  drawArtifact(ctx, cx, cy, s);
  // lines
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, cy - s * 0.1);
  ctx.lineTo(cx + s * 0.1, cy - s * 0.1);
  ctx.moveTo(cx - s * 0.14, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.1, cy + s * 0.02);
  ctx.moveTo(cx - s * 0.14, cy + s * 0.14);
  ctx.lineTo(cx + s * 0.04, cy + s * 0.14);
  ctx.stroke();
};

/** Plateau (stacked layers) */
const drawPlateau: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.32;
  for (let i = 0; i < 3; i++) {
    const y = cy - s * 0.15 + i * s * 0.15;
    const offset = i * s * 0.04;
    ctx.strokeRect(cx - w + offset, y, (w - offset) * 2, s * 0.12);
  }
};

/** Gap (ellipse with opening at top) */
const drawGap: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.3, s * 0.22, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.3, s * 0.22, 0, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
};

/** Grouping (dashed rectangle) */
const drawGrouping: DrawFn = (ctx, cx, cy, s) => {
  ctx.save();
  ctx.setLineDash([s * 0.06, s * 0.04]);
  ctx.strokeRect(cx - s * 0.3, cy - s * 0.25, s * 0.6, s * 0.5);
  ctx.restore();
};

/** Location (map pin) */
const drawLocation: DrawFn = (ctx, cx, cy, s) => {
  const r = s * 0.18;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.08, r, Math.PI, 0);
  ctx.lineTo(cx, cy + s * 0.32);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.08, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
};

/** Capability (rounded filled rectangle) */
const drawCapability: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.3;
  const h = s * 0.2;
  const r = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx - w + r, cy - h);
  ctx.arcTo(cx + w, cy - h, cx + w, cy + h, r);
  ctx.arcTo(cx + w, cy + h, cx - w, cy + h, r);
  ctx.arcTo(cx - w, cy + h, cx - w, cy - h, r);
  ctx.arcTo(cx - w, cy - h, cx + w, cy - h, r);
  ctx.closePath();
  ctx.stroke();
  // small bars inside
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.15, cy - s * 0.06);
  ctx.lineTo(cx + s * 0.15, cy - s * 0.06);
  ctx.moveTo(cx - s * 0.15, cy + s * 0.06);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.06);
  ctx.stroke();
};

/** Value Stream (horizontal chevron chain) */
const drawValueStream: DrawFn = (ctx, cx, cy, s) => {
  const w = s * 0.35;
  const h = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w * 0.5, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx + w * 0.5, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.lineTo(cx - w * 0.5, cy);
  ctx.closePath();
  ctx.stroke();
};

/** Resource (diamond) */
const drawResource: DrawFn = (ctx, cx, cy, s) => {
  drawValue(ctx, cx, cy, s);
};

/** Course of Action (curved arrow) */
const drawCourseOfAction: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.22, Math.PI * 1.3, Math.PI * 0.8);
  ctx.stroke();
  // arrowhead
  const tipX = cx + Math.cos(Math.PI * 0.8) * s * 0.22;
  const tipY = cy + Math.sin(Math.PI * 0.8) * s * 0.22;
  ctx.beginPath();
  ctx.moveTo(tipX + s * 0.08, tipY - s * 0.04);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX + s * 0.1, tipY + s * 0.04);
  ctx.stroke();
};

/** AI Agent (brain / neural network) */
const drawAIAgent: DrawFn = (ctx, cx, cy, s) => {
  // Diamond shape
  const w = s * 0.25;
  const h = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w, cy);
  ctx.closePath();
  ctx.stroke();
  // inner circle (eye)
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  // small rays
  const rayLen = s * 0.06;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * s * 0.12, cy + Math.sin(angle) * s * 0.12);
    ctx.lineTo(cx + Math.cos(angle) * (s * 0.12 + rayLen), cy + Math.sin(angle) * (s * 0.12 + rayLen));
    ctx.stroke();
  }
};

/** Fallback (question mark) */
const drawFallback: DrawFn = (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.06, s * 0.2, Math.PI * 1.2, Math.PI * 0.0);
  ctx.quadraticCurveTo(cx + s * 0.15, cy + s * 0.1, cx, cy + s * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.24, s * 0.025, 0, Math.PI * 2);
  ctx.fill();
};

// ─── Shape → draw function map ──────────────────────────────

const DRAW_FNS: Record<IconShape, DrawFn> = {
  stick_figure: drawStickFigure,
  role: drawRole,
  collaboration: drawCollaboration,
  interface: drawInterface,
  process: drawProcess,
  function: drawFunction,
  interaction: drawInteraction,
  event: drawEvent,
  service: drawService,
  object: drawObject,
  contract: drawContract,
  representation: drawRepresentation,
  product: drawProduct,
  component: drawComponent,
  data_object: drawDataObject,
  node_3d: drawNode3D,
  device: drawDevice,
  system_software: drawSystemSoftware,
  network: drawNetwork,
  path: drawPath,
  artifact: drawArtifact,
  equipment: drawEquipment,
  facility: drawFacility,
  distribution: drawDistribution,
  material: drawMaterial,
  driver: drawDriver,
  assessment: drawAssessment,
  goal: drawGoal,
  outcome: drawOutcome,
  principle: drawPrinciple,
  requirement: drawRequirement,
  constraint: drawConstraint,
  meaning: drawMeaning,
  value: drawValue,
  work_package: drawWorkPackage,
  deliverable: drawDeliverable,
  plateau: drawPlateau,
  gap: drawGap,
  grouping: drawGrouping,
  location: drawLocation,
  capability: drawCapability,
  value_stream: drawValueStream,
  resource: drawResource,
  course_of_action: drawCourseOfAction,
  ai_agent: drawAIAgent,
  fallback: drawFallback,
};

// ═══════════════════════════════════════════════════════════════
// Atlas Builder
// ═══════════════════════════════════════════════════════════════

/** All icon entries sorted by index for atlas iteration (lazy) */
let _sortedEntries: { index: number; shape: IconShape }[] | null = null;

function getSortedEntries(): { index: number; shape: IconShape }[] {
  if (!_sortedEntries) {
    const seen = new Set<number>();
    const entries: { index: number; shape: IconShape }[] = [];
    for (const entry of Object.values(ARCHIMATE_ICON_MAP)) {
      if (entry && !seen.has(entry.index)) {
        seen.add(entry.index);
        entries.push(entry);
      }
    }
    entries.push({ index: FALLBACK_ICON_INDEX, shape: 'fallback' as IconShape });
    _sortedEntries = entries.sort((a, b) => a.index - b.index);
  }
  return _sortedEntries;
}

function buildAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_ATLAS_SIZE;
  canvas.height = ICON_ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, ICON_ATLAS_SIZE, ICON_ATLAS_SIZE);

  const cell = ICON_CELL_SIZE;
  const drawSize = cell * 0.72; // 72% of cell for padding

  for (const { index, shape } of getSortedEntries()) {
    const col = index % ICON_ATLAS_GRID;
    const row = Math.floor(index / ICON_ATLAS_GRID);
    const cellCx = col * cell + cell / 2;
    const cellCy = row * cell + cell / 2;

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawFn = DRAW_FNS[shape];
    if (drawFn) {
      drawFn(ctx, cellCx, cellCy, drawSize);
    }

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getAtlas(): THREE.CanvasTexture {
  if (!atlasTexture) {
    atlasTexture = buildAtlas();
  }
  return atlasTexture;
}

// ═══════════════════════════════════════════════════════════════
// Material factory
// ═══════════════════════════════════════════════════════════════

function getSpriteMaterial(
  elementType: string,
  layerColor: string,
  opacity: number,
): THREE.SpriteMaterial {
  const entry = ARCHIMATE_ICON_MAP[elementType];
  const index = entry?.index ?? FALLBACK_ICON_INDEX;

  const cacheKey = `${index}:${layerColor}`;
  let mat = materialCache.get(cacheKey);

  if (!mat) {
    const atlas = getAtlas();

    // Clone the atlas texture so we can set per-cell UV offset
    const tex = atlas.clone();
    tex.needsUpdate = true;

    const col = index % ICON_ATLAS_GRID;
    const row = Math.floor(index / ICON_ATLAS_GRID);
    const cellUV = 1 / ICON_ATLAS_GRID;

    tex.repeat.set(cellUV, cellUV);
    tex.offset.set(col * cellUV, 1 - (row + 1) * cellUV);

    mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(layerColor),
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    materialCache.set(cacheKey, mat);
  }

  // Update opacity dynamically (not cached, changes per frame)
  mat.opacity = opacity;
  return mat;
}

// ═══════════════════════════════════════════════════════════════
// React component
// ═══════════════════════════════════════════════════════════════

interface ArchiMateIconSpriteProps {
  elementType: string;
  layerColor: string;
  is2DMode: boolean;
  opacity?: number;
  scale?: number;
}

export default function ArchiMateIconSprite({
  elementType,
  layerColor,
  is2DMode,
  opacity = 1,
  scale = 0.4,
}: ArchiMateIconSpriteProps) {
  const material = useMemo(
    () => getSpriteMaterial(elementType, layerColor, opacity),
    [elementType, layerColor, opacity],
  );

  // In 3D mode: above the shape. In 2D mode: top-left corner of the flat card.
  const position: [number, number, number] = is2DMode
    ? [-0.7, 0.15, -0.4]
    : [0, 0.85, 0.55];

  return (
    <sprite
      material={material}
      position={position}
      scale={[scale, scale, 1]}
    />
  );
}
