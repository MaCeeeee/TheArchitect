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
 *   node scripts/nav-graph.mjs --no-chrome         Chrome-Kanten (Toolbar/Sidebar) ausblenden
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

/** Eine Datei, die von mehr Wurzeln als diesem Wert erreicht wird, gilt als Chrome
 *  (Toolbar, Sidebar, Breadcrumb): ihre Kanten stehen überall zur Verfügung. */
const CHROME_THRESHOLD = 3;

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
    const isChrome = owners.size >= CHROME_THRESHOLD;
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
            edges.push({ from, to: target, trigger: t.trigger, scope: 'inferred', evidence: `${rel(f)}:${t.line}` });
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
        edges.push({ from, to, trigger: t.trigger, scope, evidence: `${rel(f)}:${t.line}` });
      }
    }
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
  return {
    nodes: graph.nodes.length, edgesDirected: edges.length, edgesSimple: simple.size,
    oddDegree: odd.length,
    minDoubledEdges: Math.max(0, Math.ceil((odd.length - 2) / 2)),
    eulerVerdict: odd.length === 0 ? 'Eulerkreis' : odd.length === 2 ? 'Eulerweg' : 'kein Eulerweg',
    sinks: sinks.length, unresolved: graph.unresolved.length,
    v2Edges, worldLeaving,
    authEdges: graph.edges.filter((e) => e.scope === 'auth').length,
    inferredEdges: edges.filter((e) => e.scope === 'inferred').length,
    topDegree: Object.entries(deg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, d]) => `${n} (${d})`),
    oddNodes: odd.sort((a, b) => deg[b] - deg[a]),
    sinkNodes: sinks.sort(),
  };
}

// ─── Ausgabe ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const graph = build();
const m = metrics(graph, { chrome: !has('--no-chrome') });
const mNoChrome = metrics(graph, { chrome: false });

if (has('--json')) { console.log(JSON.stringify({ graph, metrics: m }, null, 2)); process.exit(0); }

if (has('--write-baseline')) {
  const out = val('--write-baseline') || DEFAULT_BASELINE;
  writeFileSync(out, JSON.stringify({ generated: 'nav-graph.mjs', metrics: m, metricsNoChrome: mNoChrome }, null, 2) + '\n');
  console.log(`Baseline geschrieben: ${relative(ROOT, out)}`);
  process.exit(0);
}

const WATCH = [
  ['oddDegree',   'Knoten ungeraden Grades', 'lower'],
  ['sinks',       'Sackgassen',              'lower'],
  ['worldLeaving','v2-Kanten, die die Welt verlassen', 'lower'],
  ['nodes',       'Knoten',                  'lower'],
  ['edgesSimple', 'Kanten (einfach)',        'any'],
];

console.log(`\nNavigationsgraph — packages/client/src\n${'─'.repeat(60)}`);
console.log(`Knoten                       ${m.nodes}`);
console.log(`Kanten (gerichtet / einfach) ${m.edgesDirected} / ${m.edgesSimple}`);
console.log(`Knoten ungeraden Grades      ${m.oddDegree}   → ${m.eulerVerdict}${m.oddDegree > 2 ? `, mind. ${m.minDoubledEdges} Kanten doppelt` : ''}`);
console.log(`Sackgassen (ohne Weiterweg)  ${m.sinks}`);
console.log(`v2-Kanten / davon heraus     ${m.v2Edges} / ${m.worldLeaving}`);
console.log(`davon abgeleitet (Fan-out)   ${m.inferredEdges}   (Sidebar/Rail über Listen — nicht wörtlich im Code)`);
console.log(`Auth-Umleitungen (401→Login) ${m.authEdges}   (nicht mitgezählt: Systemreaktion)`);
console.log(`nicht auflösbar              ${m.unresolved}`);
console.log(`\nohne Chrome-Kanten (Toolbar/Sidebar ausgeblendet):`);
console.log(`  Kanten ${mNoChrome.edgesSimple} · ungerade ${mNoChrome.oddDegree} · Sackgassen ${mNoChrome.sinks}`);
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

const basePath = val('--baseline');
if (basePath) {
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  console.log(`\nVergleich gegen ${relative(ROOT, resolve(basePath))}\n${'─'.repeat(60)}`);
  let worse = 0;
  for (const [key, label, dir] of WATCH) {
    const was = base.metrics?.[key], now = m[key];
    if (was == null) continue;
    const d = now - was;
    const bad = dir === 'lower' && d > 0;
    if (bad) worse++;
    const sign = d === 0 ? '=' : d > 0 ? `+${d}` : `${d}`;
    console.log(`${bad ? '✗' : d === 0 ? ' ' : '✓'} ${label.padEnd(36)} ${String(was).padStart(4)} → ${String(now).padStart(4)}  ${sign}`);
  }
  if (worse) { console.log(`\n${worse} Kennzahl(en) verschlechtert — Wächter-Zeile aus THE-663 verletzt.`); process.exit(1); }
  console.log(`\nKeine Kennzahl verschlechtert.`);
}
console.log('');
