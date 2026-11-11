// Pre-Flight Schnitt 3 (THE-745): misst β₀, β₁, starke Komponenten, gerichtete Zyklen 2..6 und Inseln
// Aufruf aus dem Repo-Wurzelverzeichnis: node --experimental-strip-types docs/landkarte/schnitt3-messung.mjs
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).pathname;
const { DEMO_ELEMENTS, DEMO_CONNECTIONS } = await import(R + 'packages/server/src/data/demo-architecture.ts');
const { DEMO_ELEMENTS_BSH, DEMO_CONNECTIONS_BSH } = await import(R + 'packages/server/src/data/demo-architecture-bsh.ts');
const pick = (o, ...k) => k.map((x) => o[x]).find((v) => v !== undefined);
function fromDemo(els, cons) {
  return { V: els.map((e) => ({ id: e.id, name: e.name, type: e.type })),
           E: cons.map((c) => ({ s: pick(c, 'sourceId', 'source'), t: pick(c, 'targetId', 'target'), type: c.type })) };
}
function fromCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const parse = (l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const V = [], E = []; let mode = 'el';
  for (const l of lines.slice(1)) { const f = parse(l); if (f[0] === 'sourceName') { mode = 'con'; continue; }
    if (mode === 'el') V.push({ id: f[0], name: f[0], type: f[1] }); else E.push({ s: f[0], t: f[1], type: f[2] }); }
  return { V, E };
}
function fromLandkarte(path) { const m = JSON.parse(fs.readFileSync(path, 'utf8'));
  return { V: m.nodes.map((n) => ({ id: n.id, name: n.name, type: n.archimateType })), E: m.edges.map((e) => ({ s: e.from, t: e.to, type: e.relation })) }; }
function wf() { const el = JSON.parse(fs.readFileSync(R + 'docs/landkarte/landkarte.model.json', 'utf8')).fixtures.homology.edgeList;
  const ids = [...new Set(el.flat())]; return { V: ids.map((i) => ({ id: i, name: i })), E: el.map(([s, t]) => ({ s, t, type: 'flow' })) }; }

function analyze(name, { V, E }, filter = null) {
  const ids = new Set(V.map((v) => v.id)); const dangling = E.filter((e) => !ids.has(e.s) || !ids.has(e.t)).length;
  let Es = E.filter((e) => ids.has(e.s) && ids.has(e.t)); if (filter) Es = Es.filter((e) => filter.includes(e.type));
  const p = new Map([...ids].map((i) => [i, i])); const f = (x) => { while (p.get(x) !== x) x = p.get(x); return x; };
  for (const e of Es) p.set(f(e.s), f(e.t));
  const comps = new Map(); for (const i of ids) comps.set(f(i), (comps.get(f(i)) || 0) + 1);
  const b0 = comps.size, b1 = Es.length - ids.size + b0, isolated = [...ids].filter((i) => !Es.some((e) => e.s === i || e.t === i)).length;
  // Tarjan
  const adj = new Map([...ids].map((i) => [i, []])); for (const e of Es) adj.get(e.s).push(e.t);
  let idx = 0; const ix = new Map(), low = new Map(), st = [], on = new Set(), sccs = [];
  const sc = (v) => { ix.set(v, idx); low.set(v, idx++); st.push(v); on.add(v);
    for (const w of adj.get(v)) { if (!ix.has(w)) { sc(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), ix.get(w))); }
    if (low.get(v) === ix.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) sccs.push(c); } };
  for (const v of ids) if (!ix.has(v)) sc(v);
  // einfache gerichtete Zyklen Länge 2..6 (wie detectCycles, ohne LIMIT), kanonisch gezählt
  const seen = new Set(); const nm = new Map(V.map((v) => [v.id, v.name]));
  const dfs = (start, v, path) => { for (const w of adj.get(v)) { if (w === start && path.length >= 2) { const k = [...path].sort().join('|'); seen.add(k); }
      else if (!path.includes(w) && path.length < 6 && w > start) dfs(start, w, [...path, w]); } };
  for (const v of ids) dfs(v, v, [v]);
  const types = {}; for (const e of Es) types[e.type] = (types[e.type] || 0) + 1;
  const groups = new Map(); for (const i of ids) { const r = f(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(nm.get(i)); }
  const islands = [...groups.values()].sort((a, b) => b.length - a.length).slice(1).filter((g) => g.length > 1);
  console.log(`\n## ${name}${filter ? ' [nur ' + filter.join('/') + ']' : ''}`);
  console.log(`V=${ids.size} E=${Es.length} (verwaist: ${dangling}) isoliert=${isolated} β0=${b0} β1=${b1} | SCC>1: ${sccs.length} ${JSON.stringify(sccs.map((c) => c.map((i) => nm.get(i))))} | einfache Zyklen 2..6: ${seen.size} | Inseln ≥ 2: ${islands.length} ${JSON.stringify(islands)}`);
  if (!filter) console.log('Kantentypen:', JSON.stringify(types));
}
const models = { 'Banking-Demo': fromDemo(DEMO_ELEMENTS, DEMO_CONNECTIONS), 'BSH-Demo': fromDemo(DEMO_ELEMENTS_BSH, DEMO_CONNECTIONS_BSH),
  'Self-Model (CSV)': fromCsv(R + 'thearchitect-self-architecture.csv'), 'Landkarte-Modell': fromLandkarte(R + 'docs/landkarte/landkarte.model.json'), 'Workflow-Fixture 7.6': wf() };
for (const [n, m] of Object.entries(models)) { analyze(n, m); analyze(n, m, ['triggering', 'flow']); }
