#!/usr/bin/env node
/**
 * commit-model.mjs — reference implementation for the the-architect-core skill
 * (shared across the architect-* skill family; consumed e.g. by togaf-vision-architect).
 * Commits an ArchiMate Motivation (+ optional Strategy) model into The Architect
 * via the REST API, with correct 3D layout, then verifies via read-back.
 *
 * Proven against The Architect's local dev API. The MCP server will wrap the same
 * operations once it exists.
 *
 * Usage:
 *   API_KEY=ta_… [BASE_URL=http://localhost:4000/api] [PROJECT_ID=…] \
 *     node commit-model.mjs <model.json>
 *   node commit-model.mjs --demo          # runs a tiny built-in example
 *   API_KEY=… PROJECT_ID=… node commit-model.mjs --layout-only <model.json>
 *
 * model.json shape:
 * {
 *   "project": { "name": "...", "description": "...", "tags": ["..."] },   // omit if PROJECT_ID set
 *   "elements": [
 *     { "id": "g1", "type": "goal", "name": "...", "description": "...",
 *       "assumption": true|false,            // → status + metadata.assumption
 *       "layer": "motivation",               // optional; inferred from type
 *       "position3D": {x,y,z} }              // optional; auto-laid-out if omitted
 *   ],
 *   "connections": [ { "s": "id", "t": "id", "type": "influence", "label": "..." } ],
 *   "vision": { "scope","visionStatement","principles":[],"drivers":[],"goals":[] },
 *   "stakeholders": [ { "id","name","role","stakeholderType","interests":[],"influence","attitude" } ]
 * }
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4000/api';
const API_KEY = process.env.API_KEY;
const LOGIN = { email: process.env.EMAIL, password: process.env.PASSWORD };
let PROJECT_ID = process.env.PROJECT_ID;
const args = process.argv.slice(2);
const LAYOUT_ONLY = args.includes('--layout-only');
const DEMO = args.includes('--demo');
const modelPath = args.find((a) => !a.startsWith('--'));

// ── type → layer / togafDomain ────────────────────────────────────────────
const MOTIVATION = ['stakeholder','driver','assessment','goal','outcome','principle','requirement','constraint','am_value','meaning'];
const STRATEGY = ['business_capability','value_stream','resource','course_of_action'];
const layerOf = (t) => MOTIVATION.includes(t) ? 'motivation' : STRATEGY.includes(t) ? 'strategy' : 'business';
const LAYER_TO_DOMAIN = {
  motivation: 'motivation',
  strategy: 'strategy',
  business: 'business',
  information: 'data',
  application: 'application',
  technology: 'technology',
  physical: 'technology',                 // no 'physical' domain — rolls up to technology
  implementation_migration: 'implementation',
};
const domainOf = (l) => LAYER_TO_DOMAIN[l] ?? 'business';

// ── Y bands (mirror togaf.constants resolveElementY; Y is auto-resolved on load,
//    we set it anyway so stored data is clean) ──────────────────────────────
const MOTIVATION_Y = { stakeholder:31, driver:28.5, assessment:26, meaning:26, goal:23.5, outcome:21, am_value:21, principle:18.5, requirement:16, constraint:16 };
const STRATEGY_Y = { value_stream:14.5, business_capability:13, resource:13 };
const PLANE_Y = { motivation:16, strategy:12, business:8, information:4, application:0, technology:-4, physical:-8, implementation_migration:-12 };
const yOf = (layer, type) => MOTIVATION_Y[type] ?? STRATEGY_Y[type] ?? PLANE_Y[layer] ?? 0;

// ── auto-layout: small units (~ scene cell = 3). Keep X/Z within ~[-12,12]. ──
function autoLayout(elements) {
  const spread = (n, i, step) => (i - (n - 1) / 2) * step;       // centered row
  const byKey = {};
  for (const e of elements) {
    const layer = e.layer || layerOf(e.type);
    const key = layer === 'strategy'
      ? (e.type === 'value_stream' ? 'vs' : (e.assumption ? 'cap-gap' : 'cap-have'))
      : `${layer}:${e.type}`;
    (byKey[key] ||= []).push(e);
  }
  for (const [key, group] of Object.entries(byKey)) {
    group.forEach((e, i) => {
      if (e.position3D) return;                                   // respect explicit positions
      const layer = e.layer || layerOf(e.type);
      const y = yOf(layer, e.type);
      let x, z;
      if (key === 'vs') { x = spread(group.length, i, 10); z = 0; }
      else if (key === 'cap-have') { x = spread(group.length, i, 6); z = 4; }
      else if (key === 'cap-gap') { x = spread(group.length, i, 6); z = 9; }
      else if (layer === 'motivation') { x = spread(group.length, i, 5); z = 0; }
      else { x = spread(group.length, i, 6); z = 0; }             // other flat layers
      e.position3D = { x: Math.round(x * 10) / 10, y, z };
    });
  }
  return elements;
}

// ── HTTP ──────────────────────────────────────────────────────────────────
let AUTH = API_KEY ? { 'X-API-Key': API_KEY } : {};

// Namespace element ids per project. KNOWN PLATFORM BUG: the connection endpoint
// matches elements by `id` WITHOUT scoping to projectId, so short generic ids
// (sh-du, cap-…) collide with leftover nodes from other projects → 500 / ambiguous
// match / unique-constraint violation. Prefixing by project makes ids globally
// unique while staying STABLE across re-runs and layout-only passes (prefix derives
// from projectId, not a per-run random). Surfaced by the skill eval, 2026-06.
const NS = (id) => `${(PROJECT_ID || '').slice(-8)}-${id}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `tries` > 1 retries transient 500/401/429 (flaky Neo4j writes + auth hiccups
// under load — also seen in the eval). Use it for every write.
async function api(path, method, body, tries = 1) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', ...AUTH },
      body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    last = { ok: r.ok, status: r.status, j };
    if (r.ok || ![500, 401, 429].includes(r.status)) return last;
    await sleep(250 * (i + 1));
  }
  return last;
}

const DEMO_MODEL = {
  project: { name: 'Demo — Vision', description: 'commit-model.mjs demo', tags: ['demo'] },
  elements: [
    { id: 'sh1', type: 'stakeholder', name: 'CIO', assumption: false },
    { id: 'dr1', type: 'driver', name: 'Cost pressure', assumption: false },
    { id: 'g1', type: 'goal', name: 'Cut run-cost 25%', assumption: true },
    { id: 'o1', type: 'outcome', name: 'Modern platform live', assumption: true },
    { id: 'vs1', type: 'value_stream', name: 'Service delivery', assumption: false },
    { id: 'cap1', type: 'business_capability', name: 'Platform engineering', assumption: false },
    { id: 'cap2', type: 'business_capability', name: 'FinOps', assumption: true },
  ],
  connections: [
    { s: 'sh1', t: 'dr1', type: 'influence', label: 'cares about' },
    { s: 'dr1', t: 'g1', type: 'influence', label: 'drives' },
    { s: 'g1', t: 'o1', type: 'realization', label: 'achieves' },
    { s: 'cap1', t: 'vs1', type: 'serving', label: 'serving' },
    { s: 'cap2', t: 'vs1', type: 'serving', label: 'serving' },
  ],
  vision: { scope: 'Demo', visionStatement: 'Demo vision', principles: [], drivers: ['Cost pressure'], goals: ['Cut run-cost 25%'] },
  stakeholders: [{ id: 'sh1', name: 'CIO', role: 'IT lead', stakeholderType: 'c_level', interests: ['cost'], influence: 'high', attitude: 'champion' }],
};

async function main() {
  if (!API_KEY && !(LOGIN.email && LOGIN.password)) { console.error('FEHLT: API_KEY (ta_…) oder EMAIL+PASSWORD'); process.exit(1); }
  const model = DEMO ? DEMO_MODEL : JSON.parse(readFileSync(modelPath, 'utf8'));

  if (!API_KEY) {
    const lg = await api('/auth/login', 'POST', LOGIN);
    if (!lg.ok) { console.error('Login failed:', lg.status, lg.j); process.exit(1); }
    AUTH = { Authorization: `Bearer ${lg.j.accessToken || lg.j.data?.accessToken}` };
  }

  autoLayout(model.elements);

  // Layout-only fast path: just PUT positions on an existing project.
  if (LAYOUT_ONLY) {
    if (!PROJECT_ID) { console.error('--layout-only braucht PROJECT_ID'); process.exit(1); }
    let ok = 0;
    for (const e of model.elements) {
      const r = await api(`/projects/${PROJECT_ID}/elements/${NS(e.id)}`, 'PUT', { position3D: e.position3D }, 4);
      if (r.ok) ok++; else console.error(`  ✗ ${e.id}: ${r.status}`);
    }
    console.log(`Layout: ${ok}/${model.elements.length} aktualisiert.`); return;
  }

  // Create project if needed.
  if (!PROJECT_ID) {
    const p = await api('/projects', 'POST', model.project || { name: 'New architecture' });
    if (!p.ok) { console.error('Project create failed:', p.status, p.j); process.exit(1); }
    PROJECT_ID = p.j.data?._id || p.j.data?.id || p.j._id || p.j.id;
    console.log('Project:', PROJECT_ID);
  }

  // Elements.
  let okE = 0;
  for (const e of model.elements) {
    const layer = e.layer || layerOf(e.type);
    const body = {
      id: NS(e.id), type: e.type, name: e.name, description: e.description || '',
      layer, togafDomain: e.togafDomain || domainOf(layer),
      status: e.status || (e.assumption ? 'target' : 'current'),
      riskLevel: e.riskLevel || 'low', maturityLevel: e.maturityLevel || 1,
      position3D: e.position3D,
      metadata: { assumption: !!e.assumption, ...(e.metadata || {}) },
    };
    const r = await api(`/projects/${PROJECT_ID}/elements`, 'POST', body, 4);
    if (r.ok) okE++; else console.error(`  ✗ element ${e.id}: ${r.status} ${JSON.stringify(r.j).slice(0,160)}`);
  }
  console.log(`Elements: ${okE}/${model.elements.length}`);

  // Connections.
  let okC = 0;
  for (const c of model.connections || []) {
    const r = await api(`/projects/${PROJECT_ID}/connections`, 'POST', { sourceId: NS(c.s), targetId: NS(c.t), type: c.type, label: c.label }, 4);
    if (r.ok) okC++; else console.error(`  ✗ conn ${c.s}->${c.t}: ${r.status}`);
  }
  console.log(`Connections: ${okC}/${(model.connections || []).length}`);

  // Vision + stakeholders (the Phase-A panel — separate store from elements).
  if (model.vision || model.stakeholders) {
    const r = await api(`/projects/${PROJECT_ID}`, 'PUT', { vision: model.vision, stakeholders: model.stakeholders });
    console.log(r.ok ? 'Vision + stakeholders: set' : `Vision update failed: ${r.status}`);
  }

  // Verify (read-back).
  const ge = await api(`/projects/${PROJECT_ID}/elements`, 'GET');
  const gc = await api(`/projects/${PROJECT_ID}/connections`, 'GET');
  const els = ge.j.data || ge.j, cons = gc.j.data || gc.j;
  const byType = {}; let assumed = 0;
  for (const e of els) { byType[e.type] = (byType[e.type] || 0) + 1; const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata || '{}') : (e.metadata || {}); if (m.assumption) assumed++; }
  console.log(`\nVERIFY — ${els.length} elements (${assumed} assumption), ${cons.length} connections`);
  console.log('  by type:', JSON.stringify(byType));
  console.log(`Project ${PROJECT_ID} — open the 3D view on the client (:3000).`);
}

// ── exported pure helpers (testable without touching the network) ──────────
export { layerOf, domainOf, yOf, autoLayout };

// Only run the committer when executed as a script, not when imported by tests.
// pathToFileURL(argv[1]) survives symlinked invocation paths (e.g. /tmp → /private/tmp
// on macOS), where a raw fileURLToPath string comparison would silently skip main().
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
