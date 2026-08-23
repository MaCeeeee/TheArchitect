#!/usr/bin/env node
/**
 * nav-graph.mjs — zählt den Navigationsgraphen des Clients aus dem Quelltext.
 *
 * Hintergrund: THE-696 (REQ-FOCUS-001.3). Die Eulertour-Kennzahlen aus THE-663
 * wurden einmalig von Hand erhoben. Von Hand gezählte Kennzahlen driften — dieses
 * Skript macht sie reproduzierbar.
 *
 *   node scripts/nav-graph.mjs                     Kennzahlen-Report
 *   node scripts/nav-graph.mjs --json              vollständiger Graph als JSON
 *   node scripts/nav-graph.mjs --write-baseline    Baseline schreiben
 *   node scripts/nav-graph.mjs --baseline <datei>  gegen Baseline prüfen (Exit 1 bei Verschlechterung)
 *
 * Zwei Schichten: der INHALTSGRAPH (führt der Inhalt per Call-to-Action weiter?) ist die
 * Messgröße; der VOLLGRAPH (mit Sidebar/Toolbar/⌘K) zeigt daneben, was per Menü erreichbar ist.
 *
 * Was das Skript NICHT kann, weist es als `unresolved` aus — ein Graph, der
 * Vollständigkeit vortäuscht, ist derselbe Fehler wie ein Prüflauf, der bei
 * 2 von 22 geprüften Elementen "keine Befunde" meldet.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages/client/src');
const APP = join(SRC, 'App.tsx');
const DEFAULT_BASELINE = join(ROOT, 'docs/strategy/nav-graph-baseline.json');

/** Chrome = Menüs, die von jeder Fläche aus erreichbar sind (Toolbar, Sidebars, Breadcrumb,
 *  ⌘K-Palette, Stations-Rail). Erkannt über den Dateipfad — und zusätzlich über die Besitzerzahl:
 *  eine Datei, die von ≥ CHROME_THRESHOLD Routen erreicht wird, verhält sich wie ein Menü. */
const CHROME_THRESHOLD = 3;
const CHROME_FILES = /\/(components\/ui\/(Toolbar|Sidebar|BreadcrumbBar|MainLayout|PhaseBar)|components\/compliance\/ComplianceSidebar|components\/analyze\/(AnalyzeSidebar|AnalyzeStepper)|components\/compliance\/PipelineStepper|components\/journey\/(commands|CommandMenu|StationRail|stationCommands)|components\/settings\/SettingsSidebar)\.tsx?$/;

// ─── Dateien einsammeln ────────────────────────────────────────────────────
function collectFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      collectFiles(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}
const rel = (p) => relative(ROOT, p);

// ─── Zielpfade kanonisieren ────────────────────────────────────────────────
const UNRESOLVED = Symbol('unresolved');
function canonicalise(raw) {
  let s = raw.trim();
  if (!s.startsWith('/')) return UNRESOLVED;              // relative/berechnete Ziele
  if (s.startsWith('/api/')) return UNRESOLVED;          // Server-Endpunkt, keine UI-Fläche
  // nur der Projekt-Platzhalter wird vereinheitlicht — alles andere Dynamische bleibt ungelöst
  s = s.replace(/\$\{\s*(projectId|project\._id|project\.id|id)\s*\}/g, ':id');
  s = s.replace(/:projectId\b/g, ':id');
  if (/\$\{/.test(s)) return UNRESOLVED;                  // dynamische Segmente (z.B. ${activeSection})
  s = s.split('?')[0].split('#')[0];
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s;
}

// ─── Wurzeln: Routen aus App.tsx + Sektionen aus den Page-Dateien ─────────
const ROUTE_WRAPPERS = new Set(['ProtectedRoute', 'Suspense', 'ErrorBoundary', 'MainLayout', 'Fragment', 'Navigate']);
function parseRoutes(appSrc) {
  const routes = [];
  // <Route path="X" ... element={<Wrapper?><Comp ...   — Wrapper werden übersprungen
  const re = /<Route\b[^>]*?path=["']([^"']+)["'][\s\S]{0,400}?element=\{([\s\S]{0,300}?)\/?>\s*(?:<\/|\}|\/>)/g;
  let m;
  while ((m = re.exec(appSrc))) {
    const path = m[1].replace(/:projectId\b/g, ':id').replace(/\/+$/, '') || '/';
    const comps = [...m[2].matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((x) => x[1]);
    const component = comps.find((c) => !ROUTE_WRAPPERS.has(c)) || comps[0];
    if (component) routes.push({ path, component });
  }
  return routes;
}

function parseSections(files) {
  // {activeSection === 'matrix' && <ComplianceMatrix ...>}  →  Sektion ist ein eigener Knoten
  const out = [];
  const pageOf = {
    'compliance': '/project/:id/compliance',
    'analyze': '/project/:id/analyze',
    'settings': '/settings',
  };
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const base = rel(f);
    let prefix = null;
    for (const key in pageOf) if (new RegExp(`/${key}/`, 'i').test(base) && /Page\.tsx$/.test(base)) prefix = pageOf[key];
    if (!prefix) continue;
    const re = /activeSection\s*===\s*['"]([\w-]+)['"]\s*&&[\s\S]{0,120}?<([A-Z][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(src))) out.push({ path: `${prefix}/${m[1]}`, component: m[2], from: base });
  }
  return out;
}

// ─── Import-Graph ──────────────────────────────────────────────────────────
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}
function buildImportGraph(files) {
  const g = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const deps = new Set();
    const re = /(?:import[\s\S]{0,300}?from|import)\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const r = resolveImport(f, m[1]);
      if (r) deps.add(r);
    }
    g.set(f, deps);
  }
  return g;
}

/** Datei, die eine Komponente definiert (Dateiname zuerst, sonst Definition suchen). */
function fileForComponent(name, files) {
  const byName = files.find((f) => new RegExp(`/${name}\\.(tsx|ts)$`).test(f));
  if (byName) return byName;
  const re = new RegExp(`(?:export\\s+(?:default\\s+)?(?:function|const|class)\\s+${name}\\b|export\\s+default\\s+${name}\\b)`);
  return files.find((f) => re.test(readFileSync(f, 'utf8'))) || null;
}

// ─── Navigationsziele je Datei ────────────────────────────────────────────
function extractTargets(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const found = [];
  const pats = [
    { re: /navigate\(\s*[`'"]([^`'"]+)[`'"]/g,        trigger: 'navigate()' },
    { re: /to=\{?\s*[`'"]([^`'"]+)[`'"]/g,             trigger: '<Link to>' },
    { re: /route:\s*[`'"]([^`'"]+)[`'"]/g,             trigger: 'nextAction.route' },
    { re: /nav\(\s*[`'"]([^`'"]+)[`'"]/g,              trigger: 'command nav()' },
    { re: /classicRoute:.*?[`'"]([^`'"]+)[`'"]/g,      trigger: 'station classicRoute' },
    { re: /window\.location\.href\s*=\s*[`'"]([^`'"]+)[`'"]/g, trigger: 'location.href', auth: true },
    { re: /<Navigate\s+to=[`'"]([^`'"]+)[`'"]/g,      trigger: '<Navigate>', auth: true },
  ];
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;                       // Kommentarzeilen
    for (const { re, trigger, auth } of pats) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) found.push({ raw: m[1], trigger, auth: !!auth, line: i + 1 });
    }
  });
  return found;
}


/** Ziel der Form `/prefix/${var}` mit dynamischem LETZTEM Segment: liefert alle bekannten
 *  Knoten unter diesem Präfix. Grundlage der `inferred`-Kanten (Sidebar/Rail/Stepper). */
function fanOut(raw, nodes) {
  const m = /^(.*)\/\$\{[^}]+\}$/.exec(raw.split('?')[0]);
  if (!m) return null;
  let prefix = m[1].replace(/\$\{\s*(projectId|project\._id|project\.id|id)\s*\}/g, ':id');
  if (/\$\{/.test(prefix) || !prefix.startsWith('/')) return null;
  const hits = [...nodes.keys()].filter((n) => n.startsWith(prefix + '/') && !n.slice(prefix.length + 1).includes('/'));
  return hits.length >= 2 ? hits : null;   // erst ab zwei Zielen ist es wirklich ein Fan-out
}

// ─── Graph bauen ───────────────────────────────────────────────────────────
function build() {
  const files = collectFiles(SRC);
  const routes = parseRoutes(readFileSync(APP, 'utf8'));
  const sections = parseSections(files);
  // Muster-Route (…/:section) und ihre konkreten Sektionen sind dieselbe Fläche.
  // Wo Sektionen aufgelöst wurden, entfällt das Muster — sonst zählt die Page doppelt.
  const sectionPrefixes = new Set(sections.map((s) => s.path.replace(/\/[^/]+$/, '')));
  const routesDeduped = routes.filter((r) => !(/\/:section$/.test(r.path) && sectionPrefixes.has(r.path.replace(/\/:section$/, ''))));
  const roots = [...routesDeduped, ...sections];

  // Wurzel-Datei je Knoten
  const rootFile = new Map();                       // path → file
  const unresolvedRoots = [];
  for (const r of roots) {
    const f = fileForComponent(r.component, files);
    if (f) rootFile.set(r.path, f);
    else unresolvedRoots.push({ node: r.path, reason: `Komponente <${r.component}> nicht gefunden` });
  }

  // Welche Wurzeln erreichen welche Datei? (BFS über Imports)
  const imports = buildImportGraph(files);
  const ownersOf = new Map();                       // file → Set(rootPath)
  for (const [path, file] of rootFile) {
    const seen = new Set([file]);
    const q = [file];
    while (q.length) {
      const cur = q.shift();
      if (!ownersOf.has(cur)) ownersOf.set(cur, new Set());
      ownersOf.get(cur).add(path);
      for (const d of imports.get(cur) || []) if (!seen.has(d)) { seen.add(d); q.push(d); }
    }
  }

  // Seiten-Chrome an Sektionen vererben (Back-Button, Sidebar, Stepper liegen in der Seite, nicht in der Sektion)
  const reach = (file) => { const seen = new Set([file]); const q = [file]; while (q.length) { const c = q.shift(); for (const d of imports.get(c) || []) if (!seen.has(d)) { seen.add(d); q.push(d); } } return seen; };
  const byPrefix = new Map();
  for (const sct of sections) { const pre = sct.path.replace(/\/[^/]+$/, ''); if (!byPrefix.has(pre)) byPrefix.set(pre, []); byPrefix.get(pre).push(sct.path); }
  for (const [pre, paths] of byPrefix) {
    const pageRoot = rootFile.get(pre); if (!pageRoot) continue;
    const sectionReach = new Set(); for (const sp of paths) { const rf = rootFile.get(sp); if (rf) for (const f of reach(rf)) sectionReach.add(f); }
    for (const f of reach(pageRoot)) { if (sectionReach.has(f)) continue; if (!ownersOf.has(f)) ownersOf.set(f, new Set()); for (const sp of paths) ownersOf.get(f).add(sp); }
  }

  const nodes = new Map();                          // id → {id, kind, evidence}
  const addNode = (id, kind, evidence) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, evidence: evidence || null });
    return nodes.get(id);
  };
  for (const r of routesDeduped) addNode(r.path, 'route', `${rel(APP)} <${r.component}>`);
  for (const s of sections) addNode(s.path, 'section', `${s.from} <${s.component}>`);

  const edges = [];
  const unresolved = [...unresolvedRoots];
  const seenEdge = new Set();

  // Durchlauf 1: alle statisch auflösbaren Ziele als Knoten anlegen (fanOut braucht sie)
  for (const f of files) {
    for (const t of extractTargets(f)) {
      const to = canonicalise(t.raw);
      if (to !== UNRESOLVED) addNode(to, nodes.has(to) ? nodes.get(to).kind : 'target', `${rel(f)}:${t.line}`);
    }
  }
  // Durchlauf 2: Kanten
  for (const f of files) {
    const owners = ownersOf.get(f);
    const targets = extractTargets(f);
    if (!targets.length) continue;
    if (!owners || owners.size === 0) {
      for (const t of targets) unresolved.push({ node: null, target: t.raw, reason: 'Datei gehört zu keiner Route (nicht von einer Wurzel erreichbar)', evidence: `${rel(f)}:${t.line}` });
      continue;
    }
    const isChrome = owners.size >= CHROME_THRESHOLD || CHROME_FILES.test(f);
    for (const t of targets) {
      const to = canonicalise(t.raw);
      if (to === UNRESOLVED) {
        // Iteriert die Quelle über eine Liste (Sidebar, Rail, Stepper)? Dann ist das letzte
        // Segment dynamisch, das Präfix aber bekannt → Kanten auf alle Knoten dieses Präfixes.
        const fan = fanOut(t.raw, nodes);
        if (fan) {
          for (const from of owners) for (const target of fan) {
            if (from === target) continue;
            const key = `${from}→${target}|${rel(f)}:${t.line}`;
            if (seenEdge.has(key)) continue;
            seenEdge.add(key);
            edges.push({ from, to: target, trigger: t.trigger, scope: isChrome ? 'chrome' : 'content', inferred: true, evidence: `${rel(f)}:${t.line}` });
          }
          continue;
        }
        unresolved.push({ target: t.raw, reason: 'Ziel nicht statisch auflösbar', evidence: `${rel(f)}:${t.line}` });
        continue;
      }
      addNode(to, nodes.has(to) ? nodes.get(to).kind : 'target', `${rel(f)}:${t.line}`);
      for (const from of owners) {
        if (from === to) continue;
        const key = `${from}→${to}|${rel(f)}:${t.line}`;
        if (seenEdge.has(key)) continue;
        seenEdge.add(key);
        const scope = t.auth ? 'auth' : isChrome ? 'chrome' : 'content';
        edges.push({ from, to, trigger: t.trigger, scope, inferred: false, evidence: `${rel(f)}:${t.line}` });
      }
    }
  }
  // Muster-Knoten (…/:param) durch ihre konkreten Kinder ersetzen
  for (const pattern of [...nodes.keys()].filter((n) => /\/:[\w]+\??$/.test(n) && !/:id$/.test(n))) {
    const prefix = pattern.replace(/\/:[\w]+\??$/, '');
    const children = [...nodes.keys()].filter((n) => n !== pattern && n.startsWith(prefix + '/') && !n.slice(prefix.length + 1).includes('/'));
    if (children.length < 2) continue;
    const out = edges.filter((e) => e.from === pattern);
    for (const e of out) for (const c of children) if (c !== e.to) edges.push({ ...e, from: c });   // Schicht bleibt: Sheet-Inhalt ist Inhalt, ⌘K bleibt Chrome
    for (const e of edges) if (e.to === pattern) e.to = children[0];   // Index-Route → erste Station (DEFAULT_STATION-Nähe)
    for (let i = edges.length - 1; i >= 0; i--) if (edges[i].from === pattern) edges.splice(i, 1);
    nodes.delete(pattern);
  }
  return { nodes: [...nodes.values()], edges, unresolved };
}

// ─── Kennzahlen ────────────────────────────────────────────────────────────
function metrics(graph, { chrome = true } = {}) {
  // auth-Kanten (401 → /login) sind Systemreaktion, kein Navigationsangebot: nie mitzählen
  const edges = graph.edges.filter((e) => e.scope !== 'auth' && (chrome || e.scope !== 'chrome'));
  const simple = new Set();
  for (const e of edges) if (e.from !== e.to) simple.add([e.from, e.to].sort().join('|'));
  const deg = {};
  for (const k of simple) { const [a, b] = k.split('|'); deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; }
  const outdeg = {};
  for (const e of edges) outdeg[e.from] = (outdeg[e.from] || 0) + 1;
  const touched = new Set([...Object.keys(deg), ...Object.keys(outdeg)]);
  const odd = Object.keys(deg).filter((n) => deg[n] % 2);
  const sinks = [...touched].filter((n) => !outdeg[n]);
  const worldLeaving = edges.filter((e) => e.from.startsWith('/v2/') && !e.to.startsWith('/v2/')).length;
  const v2Edges = edges.filter((e) => e.from.startsWith('/v2/') || e.to.startsWith('/v2/')).length;
  const pairs = distinctPairs(edges);
  const cyc = cyclomatic(pairs);
  const bet = betweenness(pairs);
  const comm = communityReport([...simple]);
  return {
    nodes: graph.nodes.length, edgesDirected: edges.length, edgesSimple: simple.size,
    cyclomatic: cyc.M, components: cyc.P,
    betweennessTop: bet.slice(0, 8).map(([n, c]) => `${n} (${c.toFixed(3)})`),
    communities: comm.communities.length,
    stationFidelity: comm.fidelity == null ? null : Math.round(comm.fidelity * 100) / 100,
    communityDetail: comm.communities.map((c) => ({ size: c.size, dominant: c.dominant, purity: c.purity == null ? null : Math.round(c.purity * 100) / 100, domN: c.domN, withStation: c.withStation, members: c.members })),
    _pairs: pairs,
    oddDegree: odd.length,
    minDoubledEdges: Math.max(0, Math.ceil((odd.length - 2) / 2)),
    eulerVerdict: odd.length === 0 ? 'Eulerkreis' : odd.length === 2 ? 'Eulerweg' : 'kein Eulerweg',
    sinks: sinks.length, unresolved: graph.unresolved.length,
    v2Edges, worldLeaving,
    authEdges: graph.edges.filter((e) => e.scope === 'auth').length,
    inferredEdges: edges.filter((e) => e.inferred).length,
    topDegree: Object.entries(deg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, d]) => `${n} (${d})`),
    oddNodes: odd.sort((a, b) => deg[b] - deg[a]),
    sinkNodes: sinks.sort(),
  };
}


// ─── Graph-Maße jenseits der Eulertour ────────────────────────────────────
/** gerichtete Kanten auf eindeutige (from,to)-Paare reduziert */
function distinctPairs(edges) {
  const seen = new Set(); const out = [];
  for (const e of edges) { const k = `${e.from}→${e.to}`; if (!seen.has(k)) { seen.add(k); out.push([e.from, e.to]); } }
  return out;
}
function adjacency(pairs, directed) {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); if (!adj.has(b)) adj.set(b, new Set()); };
  for (const [a, b] of pairs) { add(a, b); if (!directed) add(b, a); }
  return adj;
}
/** schwach zusammenhängende Komponenten */
function components(adjUndirected) {
  const seen = new Set(); let n = 0;
  for (const start of adjUndirected.keys()) {
    if (seen.has(start)) continue; n++;
    const q = [start]; seen.add(start);
    while (q.length) { const c = q.shift(); for (const d of adjUndirected.get(c)) if (!seen.has(d)) { seen.add(d); q.push(d); } }
  }
  return n;
}
/** McCabe 1976: M = E − N + 2P auf dem gerichteten Graphen eindeutiger Paare */
function cyclomatic(pairs) {
  const nodes = new Set(); for (const [a, b] of pairs) { nodes.add(a); nodes.add(b); }
  const P = components(adjacency(pairs, false));
  return { M: pairs.length - nodes.size + 2 * P, E: pairs.length, N: nodes.size, P };
}
/** Brandes 2001: Betweenness-Zentralität, gerichtet, ungewichtet */
function betweenness(pairs) {
  const adj = adjacency(pairs, true); const CB = new Map(); for (const v of adj.keys()) CB.set(v, 0);
  for (const s of adj.keys()) {
    const stack = [], pred = new Map(), sigma = new Map(), dist = new Map();
    for (const v of adj.keys()) { pred.set(v, []); sigma.set(v, 0); dist.set(v, -1); }
    sigma.set(s, 1); dist.set(s, 0); const q = [s];
    while (q.length) {
      const v = q.shift(); stack.push(v);
      for (const w of adj.get(v)) {
        if (dist.get(w) < 0) { q.push(w); dist.set(w, dist.get(v) + 1); }
        if (dist.get(w) === dist.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); pred.get(w).push(v); }
      }
    }
    const delta = new Map(); for (const v of adj.keys()) delta.set(v, 0);
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      if (w !== s) CB.set(w, CB.get(w) + delta.get(w));
    }
  }
  const n = adj.size; const norm = n > 2 ? (n - 1) * (n - 2) : 1;   // gerichtet: (n−1)(n−2)
  return [...CB.entries()].map(([v, c]) => [v, c / norm]).sort((a, b) => b[1] - a[1]);
}
/** Louvain (Blondel et al. 2008), kompakt: lokales Verschieben + Aggregation bis keine Modularitätsgewinne mehr */
function louvain(simpleKeys) {
  let nodes = [...new Set(simpleKeys.flatMap((k) => k.split('|')))];
  let idx = new Map(nodes.map((n, i) => [n, i]));
  let W = nodes.map(() => new Map());                                 // gewichtete Adjazenz
  for (const k of simpleKeys) { const [a, b] = k.split('|').map((x) => idx.get(x)); W[a].set(b, (W[a].get(b) || 0) + 1); W[b].set(a, (W[b].get(a) || 0) + 1); }
  let membership = nodes.map((_, i) => i);                           // Original-Knoten → Community (als Index in aktueller Ebene)
  for (let level = 0; level < 10; level++) {
    const n = W.length; const deg = W.map((m) => [...m.values()].reduce((a, b) => a + b, 0)); const m2 = deg.reduce((a, b) => a + b, 0);
    if (!m2) break;
    const comm = W.map((_, i) => i); const tot = deg.slice();
    let moved = true, any = false;
    while (moved) {
      moved = false;
      for (let i = 0; i < n; i++) {
        const ci = comm[i]; const kin = new Map();
        for (const [j, w] of W[i]) if (j !== i) kin.set(comm[j], (kin.get(comm[j]) || 0) + w);
        tot[ci] -= deg[i];
        let best = ci, bestGain = (kin.get(ci) || 0) - (tot[ci] * deg[i]) / m2;
        for (const [c, k] of kin) { const g = k - (tot[c] * deg[i]) / m2; if (g > bestGain + 1e-12) { bestGain = g; best = c; } }
        tot[best] += deg[i];
        if (best !== ci) { comm[i] = best; moved = true; any = true; }
      }
    }
    if (!any) break;
    // Aggregation
    const ids = [...new Set(comm)]; const re = new Map(ids.map((c, i) => [c, i]));
    const W2 = ids.map(() => new Map());
    for (let i = 0; i < n; i++) for (const [j, w] of W[i]) { const a = re.get(comm[i]), b = re.get(comm[j]); W2[a].set(b, (W2[a].get(b) || 0) + w); }
    membership = membership.map((c) => re.get(comm[c]));
    W = W2;
    if (W.length === n) break;
  }
  const groups = new Map();
  nodes.forEach((nd, i) => { const c = membership[i]; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(nd); });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}
/** Welche Station sollte ein Knoten laut ADR-0005 / stations.ts / Conformance-Toren bedienen? */
function stationOf(id) {
  const v2 = /^\/v2\/project\/:id\/(vision|model|explore|plan|govern|track)$/.exec(id); if (v2) return v2[1];
  if (/^\/v2\//.test(id)) return 'model';
  const c = /^\/project\/:id\/compliance\/([\w-]+)$/.exec(id);
  if (c) {
    if (['compliance-dashboard', 'approvals', 'policy-mgr', 'audit-trail'].includes(c[1])) return 'govern';   // Tor Enforce
    if (['audit', 'assess', 'certify'].includes(c[1])) return 'track';                                        // Tor Attest
    if (c[1] === 'roadmap') return 'plan';                                                                    // stations.ts plan → roadmap
    return 'explore';                                                                                         // Tor Cover
  }
  if (/^\/project\/:id\/analyze/.test(id) || /^\/project\/:id\/(portfolio)$/.test(id)) return 'plan';
  if (/^\/project\/:id(\/(blueprint|stakeholder|ai-agents))?$/.test(id)) return 'model';
  return null;   // außerhalb der Stationen (Landing, Login, Dashboard, Settings)
}
function communityReport(simpleKeys) {
  const comms = louvain(simpleKeys);
  let matched = 0, total = 0;
  const rows = comms.map((members) => {
    const counts = {}; for (const mbr of members) { const st = stationOf(mbr); if (st) counts[st] = (counts[st] || 0) + 1; }
    const [dom, domN] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const withStation = Object.values(counts).reduce((a, b) => a + b, 0);
    matched += domN; total += withStation;
    return { size: members.length, dominant: dom, purity: withStation ? domN / withStation : null, domN, withStation, members };
  });
  return { communities: rows, fidelity: total ? matched / total : null };
}

// ─── Mission-Graph gegen Space-Graph ──────────────────────────────────────
function shortestPath(pairs, sources, targets) {
  const adj = adjacency(pairs, true); const T = new Set(targets);
  const prev = new Map(); const q = [];
  for (const s of sources) if (adj.has(s)) { prev.set(s, null); q.push(s); }
  while (q.length) {
    const c = q.shift();
    if (T.has(c)) { const path = []; for (let x = c; x != null; x = prev.get(x)) path.unshift(x); return path; }
    for (const d of adj.get(c) || []) if (!prev.has(d)) { prev.set(d, c); q.push(d); }
  }
  return null;
}
function missionAlignment(mission, pairs, nodeIds, fullPairs) {
  const rows = []; let direct = 0, detour = 0, noPlace = 0, unreachable = 0, menuOnly = 0;
  const steps = mission.steps;
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i], b = steps[i + 1];
    const sa = a.surfaces.filter((x) => !x.startsWith('modal:')), sb = b.surfaces.filter((x) => !x.startsWith('modal:'));
    const missingA = a.surfaces.filter((x) => x.startsWith('modal:') || !nodeIds.has(x));
    const missingB = b.surfaces.filter((x) => x.startsWith('modal:') || !nodeIds.has(x));
    let status, via = [];
    if (!sa.length || !sb.length || sa.every((x) => !nodeIds.has(x)) || sb.every((x) => !nodeIds.has(x))) { status = 'kein Ort'; noPlace++; }
    else if (sa.some((x) => sb.includes(x))) { status = 'gleiche Fläche'; direct++; }
    else {
      const A = sa.filter((x) => nodeIds.has(x)), B = sb.filter((x) => nodeIds.has(x));
      const path = shortestPath(pairs, A, B);
      if (path && path.length === 2) { status = 'direkt (Inhalt führt weiter)'; direct++; }
      else if (path) { status = `Umweg über ${path.length - 2}`; via = path.slice(1, -1); detour += path.length - 2; }
      else {
        const full = fullPairs ? shortestPath(fullPairs, A, B) : null;
        if (full) { status = `nur über Menü (${full.length - 1} Klick${full.length > 2 ? 's' : ''})`; menuOnly++; }
        else { status = 'unerreichbar'; unreachable++; }
      }
    }
    rows.push({ from: a.id, to: b.id, status, via, missing: [...missingA, ...missingB] });
  }
  return { rows, direct, detour, noPlace, unreachable, menuOnly, transitions: steps.length - 1 };
}


// ─── HTML-Bericht (selbstständig, Artifact-tauglich: keine Skripte, keine externen Assets außer Google Fonts) ──
function esc(x) { return String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const STATION_COLOR = { vision: '#8B5CF6', model: '#2348C8', explore: '#0E9F8A', plan: '#D4A017', govern: '#D2561E', track: '#6B7680' };
function renderHtml() {
  const today = new Date().toISOString().slice(0, 10);
  const tag = (t, cls, inner) => `<${t}${cls ? ` class="${cls}"` : ''}>${inner}</${t}>`;
  const stat = (v, l, cls = '') => `<div class="stat ${cls}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  const layers = `
  <div class="layers">
    <div class="layer primary"><h3>Inhaltsgraph <small>Messgröße</small></h3><p class="q">Führt der Inhalt per Call-to-Action weiter?</p>
      <div class="stats">${stat(m.nodes, 'Knoten')}${stat(m.edgesSimple, 'Kanten')}${stat(m.oddDegree, 'ungerader Grad', m.oddDegree > 2 ? 'bad' : 'good')}${stat(m.sinks, 'Sackgassen', 'bad')}${stat(m.cyclomatic, 'zyklomatisch')}${stat(`${m.worldLeaving}/${m.v2Edges}`, 'v2 verlässt Welt')}</div>
      <p class="verdict">${esc(m.eulerVerdict)}${m.oddDegree > 2 ? ` — mindestens ${m.minDoubledEdges} Kanten müssen doppelt gegangen werden` : ''}</p></div>
    <div class="layer"><h3>Vollgraph <small>Menüwand</small></h3><p class="q">Was ist per Sidebar, Toolbar, ⌘K und Rail erreichbar?</p>
      <div class="stats">${stat(mFull.nodes, 'Knoten')}${stat(mFull.edgesSimple, 'Kanten')}${stat(mFull.oddDegree, 'ungerader Grad')}${stat(mFull.sinks, 'Sackgassen')}${stat(mFull.cyclomatic, 'zyklomatisch')}${stat(`${mFull.worldLeaving}/${mFull.v2Edges}`, 'v2 verlässt Welt')}</div>
      <p class="verdict muted">Fast alles ist von überall erreichbar — das ist die Menüwand, nicht der Weg.</p></div>
  </div>`;
  const bet = m.betweennessTop.map((x) => { const mm = /^(.*) \(([\d.]+)\)$/.exec(x); return mm ? [mm[1], +mm[2]] : [x, 0]; });
  const betMax = Math.max(...bet.map((b) => b[1]), 0.0001);
  const betRows = bet.map(([n, c]) => `<tr><td><code>${esc(n)}</code></td><td class="bar"><i style="width:${Math.round((c / betMax) * 100)}%"></i></td><td class="num">${c.toFixed(3)}</td></tr>`).join('');
  const commRows = m.communityDetail.map((c) => {
    const counts = {}; for (const mbr of c.members) { const st = stationOf(mbr); counts[st || 'none'] = (counts[st || 'none'] || 0) + 1; }
    const segs = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([st, n]) => `<i title="${esc(st)} ${n}" style="flex:${n};background:${STATION_COLOR[st] || 'var(--grid)'}"></i>`).join('');
    return `<tr><td class="num">${c.size}</td><td><div class="comp">${segs}</div></td><td>${c.dominant === '—' ? '<span class="muted">außerhalb der Stationen</span>' : `<b>${esc(c.dominant)}</b> ${c.domN}/${c.withStation}`}</td><td class="members"><code>${c.members.slice(0, 5).map(esc).join('</code> <code>')}</code>${c.members.length > 5 ? ` <span class="muted">+${c.members.length - 5}</span>` : ''}</td></tr>`;
  }).join('');
  const legend = Object.entries(STATION_COLOR).map(([st, col]) => `<span class="lg"><i style="background:${col}"></i>${st}</span>`).join('');
  const missions = missionReport.map(({ mission, r }) => `
    <div class="mission">
      <h3>${esc(mission.name)}</h3>
      <p class="meta">${esc(mission.source)}</p>
      <div class="stats small">${stat(`${r.direct}/${r.transitions}`, 'Inhalt führt weiter', r.direct === r.transitions ? 'good' : '')}${stat(r.menuOnly, 'nur über Menü', r.menuOnly ? 'bad' : '')}${stat(r.detour, 'Umwegsumme', r.detour ? 'bad' : '')}${stat(r.noPlace, 'ohne Ort', r.noPlace ? 'bad' : '')}${stat(r.unreachable, 'unerreichbar', r.unreachable ? 'bad' : '')}</div>
      <table class="steps">${r.rows.map((row) => { const ok = row.status.startsWith('direkt') || row.status === 'gleiche Fläche'; const cls = ok ? 'ok' : row.status === 'kein Ort' ? 'none' : row.status === 'unerreichbar' ? 'bad' : 'warn';
        return `<tr class="${cls}"><td><b>${esc(row.from)}</b> → <b>${esc(row.to)}</b></td><td>${esc(row.status)}${row.via.length ? `: <code>${row.via.map(esc).join('</code> → <code>')}</code>` : ''}${row.missing.length ? ` <span class="muted">fehlt: ${row.missing.map(esc).join(', ')}</span>` : ''}</td></tr>`; }).join('')}</table>
      ${mission.steps.filter((st) => st.note).map((st) => `<p class="note"><b>${esc(st.id)}:</b> ${esc(st.note)}</p>`).join('')}
    </div>`).join('');
  const sinks = m.sinkNodes.map((n) => `<code>${esc(n)}</code>`).join(' ');
  const byReason = {}; for (const u of graph.unresolved) (byReason[u.reason] ||= []).push(u);
  const unresolved = Object.entries(byReason).map(([r, list]) => `<details><summary>${esc(r)} <span class="muted">(${list.length})</span></summary><ul>${list.map((u) => `<li><code>${esc(u.target ?? u.node)}</code> <span class="muted">${esc(u.evidence || '')}</span></li>`).join('')}</ul></details>`).join('');
  return `<meta charset="utf-8">
<title>Der Graph zählt sich selbst</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--paper:#F2F4F1;--card:#fff;--ink:#1A2230;--ink-soft:#5E6974;--grid:#D8DED7;--line:#CFD6CF;--path:#2348C8;--path-soft:#DCE3FA;--odd:#D2561E;--odd-soft:#FBE4D8;--ok:#1F8A5B;--ok-soft:#DDF2E6;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#0F1419;--card:#171D24;--ink:#E8ECEA;--ink-soft:#9AA5AE;--grid:#222B33;--line:#2B3640;--path:#7D9BFF;--path-soft:#1B2748;--odd:#FF8A5B;--odd-soft:#3A2117;--ok:#46D39A;--ok-soft:#12362A}}
:root[data-theme="dark"]{--paper:#0F1419;--card:#171D24;--ink:#E8ECEA;--ink-soft:#9AA5AE;--grid:#222B33;--line:#2B3640;--path:#7D9BFF;--path-soft:#1B2748;--odd:#FF8A5B;--odd-soft:#3A2117;--ok:#46D39A;--ok-soft:#12362A}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Atkinson Hyperlegible",system-ui,sans-serif;font-size:15.5px;line-height:1.5;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:32px 32px}
main{max-width:66rem;margin:0 auto;padding:2.5rem 1.25rem 5rem}h1,h2,h3{font-family:"Fraunces",Georgia,serif;line-height:1.15;margin:0;text-wrap:balance}h1{font-size:2.4rem;font-weight:600}h2{font-size:1.45rem;margin:2.8rem 0 .7rem}h3{font-size:1.1rem}h3 small{font-family:"Atkinson Hyperlegible",sans-serif;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);margin-left:.5rem}
.eyebrow{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--path);font-weight:700}.lede{font-size:1.08rem;color:var(--ink-soft);max-width:46rem;margin:.6rem 0 0}.meta,.muted{color:var(--ink-soft);font-size:.86rem}code{font-family:var(--mono);font-size:.82em}p{max-width:46rem}
.layers{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1.4rem}@media(max-width:780px){.layers{grid-template-columns:1fr}}.layer{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem}.layer.primary{border-color:var(--path);box-shadow:0 0 0 1px var(--path)}.layer .q{margin:.2rem 0 .8rem;color:var(--ink-soft);font-size:.9rem}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}.stats.small{grid-template-columns:repeat(5,1fr)}@media(max-width:600px){.stats.small{grid-template-columns:repeat(2,1fr)}}.stat{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:.45rem .65rem}.stat b{display:block;font-family:var(--mono);font-size:1.3rem;line-height:1.1;font-variant-numeric:tabular-nums}.stat span{font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em}.stat.bad b{color:var(--odd)}.stat.good b{color:var(--ok)}
.verdict{margin:.8rem 0 0;font-weight:700}.verdict.muted{font-weight:400}
table{border-collapse:collapse;width:100%;font-size:.9rem}.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card);margin-top:.8rem}td,th{padding:.5rem .7rem;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft)}tr:last-child td{border-bottom:none}td.num{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.bar{width:40%}td.bar i{display:block;height:.7rem;background:var(--path);border-radius:3px;min-width:2px}
.comp{display:flex;height:.9rem;border-radius:4px;overflow:hidden;min-width:8rem}.comp i{display:block}.lg{display:inline-flex;align-items:center;gap:.3rem;margin-right:.9rem;font-size:.8rem}.lg i{width:.8rem;height:.8rem;border-radius:3px;display:inline-block}td.members code{margin-right:.2rem}
.mission{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem;margin-top:1rem}.mission .steps{margin-top:.7rem}.mission .steps tr.ok td:first-child{border-left:4px solid var(--ok)}.mission .steps tr.warn td:first-child{border-left:4px solid var(--odd)}.mission .steps tr.none td:first-child{border-left:4px solid var(--ink-soft)}.mission .steps tr.bad td:first-child{border-left:4px solid var(--odd);background:var(--odd-soft)}.note{font-size:.86rem;color:var(--ink-soft);margin:.5rem 0 0}
details{margin:.4rem 0;font-size:.9rem}summary{cursor:pointer}details ul{margin:.3rem 0 0;padding-left:1.2rem}details li{margin:.15rem 0}
.callout{border:1px solid var(--line);border-radius:10px;background:var(--path-soft);padding:.9rem 1.2rem;margin:1rem 0;font-size:.94rem}
</style>
<main>
<p class="eyebrow">nav-graph.mjs · Inhaltsgraph als Messgröße · Stand ${today}</p>
<h1>Der Graph zählt sich selbst</h1>
<p class="lede">Diese Seite ist generiert — aus demselben Lauf wie die Baseline, mit der <code>npm run nav:check</code> rechnet. Sie kann nicht veralten, nur neu erzeugt werden: <code>npm run nav:graph -- --html</code>.</p>
${layers}
<div class="callout"><b>Warum zwei Schichten:</b> Sobald jede Fläche die Sidebar ihrer Seite erbt, verbindet das Menü alles mit allem — 2 Sackgassen, zyklomatisch ${mFull.cyclomatic}. Das ist wahr, aber es ist die Frage „kann ich irgendwie hin?", nicht „führt mich der Inhalt weiter?". Sackgasse im Inhaltsgraph heißt: kein Weiterweg außer Menü oder Zurück.</div>

<h2>Nadelöhre</h2>
<p>Betweenness-Zentralität (Brandes): Anteil der kürzesten Wege, die durch einen Knoten laufen. Ein Wert weit über allen anderen ist kein Hub, sondern ein Flaschenhals.</p>
<div class="tablewrap"><table><tr><th>Fläche</th><th>Anteil</th><th class="num">Wert</th></tr>${betRows}</table></div>

<h2>Communities gegen Stationen</h2>
<p>Louvain findet die Gruppen, die der Graph tatsächlich bildet. Daneben steht, zu welcher der sechs Stationen aus ADR-0005 die Flächen <em>gehören sollten</em>. Schnitt-Treue <b>${m.stationFidelity == null ? '—' : Math.round(m.stationFidelity * 100) + ' %'}</b> bei ${m.communities} Communities für 6 Stationen.</p>
<p class="meta">${legend}</p>
<div class="tablewrap"><table><tr><th class="num">Flächen</th><th>Zusammensetzung</th><th>dominante Station</th><th>Mitglieder</th></tr>${commRows}</table></div>

<h2>Mission gegen Space</h2>
<p>Der Mission-Graph ist die Aufgabenkette im Kopf des Nutzers (<code>docs/strategy/mission-graph.json</code>, von Hand gepflegt). Je Übergang: Bietet der Inhalt ihn an, geht er nur über das Menü, braucht er einen Umweg — oder hat ein Schritt gar keinen Ort?</p>
${missions}

<h2>Sackgassen im Inhaltsgraph (${m.sinks})</h2>
<p class="members" style="line-height:2">${sinks}</p>

<h2>Was der Extraktor nicht sieht (${m.unresolved})</h2>
<p>Deckungslücke, nicht Abwesenheit. Dazu ${m.inferredEdges} abgeleitete Fan-out-Kanten (Sidebar/Rail über Listen) und ${m.authEdges} Auth-Umleitungen, die als Systemreaktion nicht mitzählen.</p>
${unresolved}
<p class="meta" style="margin-top:2.5rem">Grenze: Sheet-Inhalte der v2-Welt lassen sich statisch keiner Station zuordnen — jede Station erhält alle Sheet-Kanten; die v2-Zahlen sind eine Obergrenze. Modals und 3D-Zustände haben keine Route und sind keine Knoten. Referenz THE-696 / THE-663.</p>
</main>
`;
}

// ─── Ausgabe ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const graph = build();
const m = metrics(graph, { chrome: false });     // Inhaltsgraph: führt der Inhalt weiter? (Sackgasse = kein Weiterweg außer Menü/Back)
const mFull = metrics(graph, { chrome: true });  // Vollgraph: alles, was per Sidebar/Toolbar/⌘K erreichbar ist

if (has('--json')) { const { _pairs, ...mm } = m; const { _pairs: _p2, ...mf } = mFull; console.log(JSON.stringify({ graph, metrics: mm, metricsFull: mf }, null, 2)); process.exit(0); }

function missionResultsForBaseline() {
  const mp = val('--mission') || join(ROOT, 'docs/strategy/mission-graph.json');
  if (!existsSync(mp)) return null;
  const nodeIds = new Set(graph.nodes.map((n) => n.id)); const out = {};
  for (const mission of JSON.parse(readFileSync(mp, 'utf8')).missions) { const r = missionAlignment(mission, m._pairs, nodeIds, mFull._pairs); out[mission.id] = { direct: r.direct, detour: r.detour, noPlace: r.noPlace, menuOnly: r.menuOnly, unreachable: r.unreachable, transitions: r.transitions }; }
  return out;
}
if (has('--write-baseline')) {
  const out = val('--write-baseline') || DEFAULT_BASELINE;
  const strip = (x) => { const { _pairs, ...rest } = x; return rest; };
  writeFileSync(out, JSON.stringify({ generated: 'nav-graph.mjs', layer: 'content', metrics: strip(m), metricsFull: strip(mFull), mission: missionResultsForBaseline() }, null, 2) + '\n');
  console.log(`Baseline geschrieben: ${relative(ROOT, out)}`);
  process.exit(0);
}

// QUALITÄT wird bewacht (Exit 1), GRÖSSE nur angezeigt.
// Der Unterschied ist entscheidend für ein Tor, das man nicht wegdrückt: Knoten,
// Kanten und zyklomatische Komplexität wachsen mit jedem Feature — sie hart zu
// bewachen hieße, jede neue Fläche zu bestrafen. Ungerader Grad und Sackgassen
// wachsen NICHT mit der Größe: eine sauber eingebundene Fläche (rein und weiter)
// lässt beide unverändert. Nur eine schlecht eingebundene hebt sie.
const WATCH = [
  ['oddDegree',       'Knoten ungeraden Grades',           'lower'],
  ['sinks',           'Sackgassen',                        'lower'],
  ['worldLeaving',    'v2-Kanten, die die Welt verlassen', 'lower'],
  ['stationFidelity', 'Schnitt-Treue',                     'higher'],
];
const INFO = [
  ['nodes',       'Knoten'],
  ['edgesSimple', 'Kanten (einfach)'],
  ['cyclomatic',  'Zyklomatische Komplexität'],
];

if (!has('--html')) {
console.log(`\nNavigationsgraph — packages/client/src\n${'─'.repeat(60)}`);
console.log(`INHALTSGRAPH — führt der Inhalt weiter? (ohne Sidebar/Toolbar/⌘K)`);
console.log(`Knoten                       ${m.nodes}`);
console.log(`Kanten (gerichtet / einfach) ${m.edgesDirected} / ${m.edgesSimple}`);
console.log(`Knoten ungeraden Grades      ${m.oddDegree}   → ${m.eulerVerdict}${m.oddDegree > 2 ? `, mind. ${m.minDoubledEdges} Kanten doppelt` : ''}`);
console.log(`Sackgassen (ohne Weiterweg)  ${m.sinks}`);
console.log(`v2-Kanten / davon heraus     ${m.v2Edges} / ${m.worldLeaving}`);
console.log(`davon abgeleitet (Fan-out)   ${m.inferredEdges}   (Sidebar/Rail über Listen — nicht wörtlich im Code)`);
console.log(`Auth-Umleitungen (401→Login) ${m.authEdges}   (nicht mitgezählt: Systemreaktion)`);
console.log(`nicht auflösbar              ${m.unresolved}`);
console.log(`\nVOLLGRAPH — mit Menü-Chrome (Sidebar/Toolbar/⌘K von jeder Fläche aus):`);
console.log(`  Kanten ${mFull.edgesSimple} · ungerade ${mFull.oddDegree} · Sackgassen ${mFull.sinks} · zyklomatisch ${mFull.cyclomatic}`);
console.log(`  Lesart: Im Vollgraph ist fast alles von überall erreichbar — das ist die Menüwand, nicht der Weg.`);
console.log(`\nJenseits der Eulertour:`);
console.log(`  Zyklomatische Komplexität   ${m.cyclomatic}   (McCabe: E − N + 2P = ${m._pairs.length} − ${new Set(m._pairs.flat()).size} + 2·${m.components} → unabhängige Wege durch die App)`);
console.log(`  Communities (Louvain)       ${m.communities}   bei 6 Stationen laut ADR-0005`);
console.log(`  Schnitt-Treue               ${m.stationFidelity == null ? '—' : Math.round(m.stationFidelity * 100) + ' %'}   (Anteil der Flächen, deren Community zu ihrer Station passt)`);
console.log(`\nNadelöhre (Betweenness, gerichtet):\n  ${m.betweennessTop.join('\n  ')}`);
console.log(`\nCommunities → dominante Station (Reinheit):`);
for (const c of m.communityDetail) console.log(`  ${String(c.size).padStart(2)} Flächen → ${c.dominant.padEnd(8)} ${c.withStation ? `${c.domN}/${c.withStation}` : '  —'}   ${c.members.slice(0, 4).join(', ')}${c.members.length > 4 ? ', …' : ''}`);
console.log(`\nHöchster Grad:\n  ${m.topDegree.join('\n  ')}`);
console.log(`\nSackgassen:\n  ${m.sinkNodes.join('\n  ') || '—'}`);
if (m.unresolved) {
  console.log(`\nNicht statisch auflösbar (${m.unresolved}) — Deckungslücke, nicht Abwesenheit:`);
  const byReason = {};
  for (const u of graph.unresolved) (byReason[u.reason] ||= []).push(u);
  for (const r in byReason) {
    console.log(`  ${r} (${byReason[r].length}):`);
    byReason[r].slice(0, 6).forEach((u) => console.log(`    ${u.target ?? u.node}  ${u.evidence || ''}`));
    if (byReason[r].length > 6) console.log(`    … ${byReason[r].length - 6} weitere`);
  }
}

}
const missionPath = val('--mission') || (existsSync(join(ROOT, 'docs/strategy/mission-graph.json')) ? join(ROOT, 'docs/strategy/mission-graph.json') : null);
const missionResults = {};
const missionReport = [];   // [{mission, r}] — Terminal und HTML lesen dieselbe Rechnung
if (missionPath) {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const mg = JSON.parse(readFileSync(missionPath, 'utf8'));
  for (const mission of mg.missions) {
    const r = missionAlignment(mission, m._pairs, nodeIds, mFull._pairs);
    missionResults[mission.id] = { direct: r.direct, detour: r.detour, noPlace: r.noPlace, menuOnly: r.menuOnly, unreachable: r.unreachable, transitions: r.transitions };
    missionReport.push({ mission, r });
  }
}
if (has('--html')) { const out = val('--html') && !val('--html').startsWith('--') ? resolve(val('--html')) : join(ROOT, 'docs/strategy/nav-graph-report.html'); writeFileSync(out, renderHtml()); console.log(`HTML-Bericht geschrieben: ${relative(ROOT, out)}`); process.exit(0); }
if (missionPath) {
  console.log(`\nMission-Graph gegen Space-Graph (${relative(ROOT, resolve(missionPath))})\n${'─'.repeat(60)}`);
  for (const { mission, r } of missionReport) {
    console.log(`\n${mission.name}  —  ${r.direct}/${r.transitions} Übergänge, die der Inhalt selbst anbietet · ${r.menuOnly} nur über Menü · Umwegsumme ${r.detour} · ${r.noPlace} ohne Ort · ${r.unreachable} unerreichbar`);
    for (const row of r.rows) {
      const mark = row.status.startsWith('direkt') || row.status === 'gleiche Fläche' ? '✓' : row.status === 'kein Ort' ? '∅' : row.status === 'unerreichbar' ? '✗' : row.status.startsWith('nur über Menü') ? '≡' : '↪';
      console.log(`  ${mark} ${row.from.padEnd(12)} → ${row.to.padEnd(12)} ${row.status}${row.via.length ? ': ' + row.via.join(' → ') : ''}${row.missing.length ? '   [fehlt: ' + row.missing.join(', ') + ']' : ''}`);
    }
  }
}

const basePath = val('--baseline');
if (basePath) {
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  console.log(`\nVergleich gegen ${relative(ROOT, resolve(basePath))}\n${'─'.repeat(60)}`);
  let worse = 0;
  for (const [key, label, dir] of WATCH) {
    const was = base.metrics?.[key], now = m[key];
    if (was == null) continue;
    const d = Math.round((now - was) * 100) / 100;
    const bad = (dir === 'lower' && d > 0) || (dir === 'higher' && d < 0);
    if (bad) worse++;
    const sign = d === 0 ? '=' : d > 0 ? `+${d}` : `${d}`;
    console.log(`${bad ? '✗' : d === 0 ? ' ' : '✓'} ${label.padEnd(36)} ${String(was).padStart(4)} → ${String(now).padStart(4)}  ${sign}`);
  }
  for (const [key, label] of INFO) {
    const was = base.metrics?.[key], now = m[key];
    if (was == null) continue;
    const d = now - was;
    console.log(`· ${label.padEnd(36)} ${String(was).padStart(4)} → ${String(now).padStart(4)}  ${d === 0 ? '=' : d > 0 ? `+${d}` : d}   ${d === 0 ? '' : 'wächst mit dem Produkt — kein Tor'}`);
  }
  for (const id in (base.mission || {})) {
    const was = base.mission[id], now = missionResults[id]; if (!now) continue;
    for (const [k, label, dir] of [['direct', `Mission „${id}": Inhalt führt weiter`, 'higher'], ['menuOnly', `Mission „${id}": nur über Menü`, 'lower'], ['detour', `Mission „${id}": Umwegsumme`, 'lower'], ['noPlace', `Mission „${id}": Schritte ohne Ort`, 'lower']]) {
      const d = now[k] - was[k]; const bad = (dir === 'lower' && d > 0) || (dir === 'higher' && d < 0); if (bad) worse++;
      console.log(`${bad ? '✗' : d === 0 ? ' ' : '✓'} ${label.padEnd(36)} ${String(was[k]).padStart(4)} → ${String(now[k]).padStart(4)}  ${d === 0 ? '=' : d > 0 ? `+${d}` : d}`);
    }
  }
  if (worse) {
    console.log(`\n${worse} Qualitäts-Kennzahl(en) verschlechtert — Wächter-Zeile aus THE-663 verletzt.\n`);
    console.log(`Was jetzt zu tun ist:`);
    console.log(`  • Unbeabsichtigt? Dann ist eine Fläche ohne Weiterweg entstanden oder ein Inhalt`);
    console.log(`    springt aus der Welt. \`npm run nav:graph\` zeigt, welche — die Sackgassen-Liste`);
    console.log(`    und die Mission-Übersicht benennen die Stelle.`);
    console.log(`  • Beabsichtigt und begründet? Dann die Baseline bewusst nachziehen:`);
    console.log(`      npm run nav:graph -- --write-baseline`);
    console.log(`      git add docs/strategy/nav-graph-baseline.json`);
    console.log(`    Die Begründung gehört in die Commit-Nachricht — eine stillschweigend`);
    console.log(`    angehobene Baseline ist dasselbe wie ein weggedrücktes rotes Tor.`);
    process.exit(1);
  }
  console.log(`\nKeine Qualitäts-Kennzahl verschlechtert.`);
}
console.log('');
