#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-08-taxonomie-wert-zu-requirement.{excalidraw,svg}
// aus einer Layout-Definition. Beide Ausgaben stammen aus denselben Koordinaten,
// die SVG ist damit eine echte Vorschau der Excalidraw-Datei.
//
//   node scripts/gen-taxonomie-diagram.mjs
//
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-08-taxonomie-wert-zu-requirement')

// ---------------------------------------------------------------- Layout ----
const MAIN_X = 180, MAIN_W = 760
const ONT_X = 1240, ONT_W = 460
const GAP_CX = (MAIN_X + MAIN_W + ONT_X) / 2 // Mitte der Beitrags-Spalte
const CHAIN_X = MAIN_X + MAIN_W / 2          // vertikale Kettenachse
const LOOP_A_X = 90, LOOP_B_X = 1780
const CANVAS_W = 1860, CANVAS_H = 1700

const INK = '#1e1e1e', MUTED = '#868e96', RED = '#e03131', GREEN = '#2f9e44'
const C = {
  wert: '#ffec99', treiber: '#ffd8a8', uc: '#a5d8ff',
  req: '#b2f2bb', evidenz: '#d0bfff', onto: '#99e9f2',
  shell: '#f8f9fa', note: '#f1f3f5',
}

const els = []
let seq = 0
const uid = (p) => `${p}${++seq}`
const estW = (t, fs) => t.length * fs * 0.55
const base = (o) => ({
  angle: 0, fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
  roughness: 1, opacity: 100, groupIds: [], frameId: null, seed: ++seq,
  version: 1, versionNonce: 1, isDeleted: false, updated: 1, link: null,
  locked: false, strokeColor: INK, backgroundColor: 'transparent',
  boundElements: [], ...o,
})

function rect({ x, y, w, h, bg = 'transparent', stroke = INK, sw = 2, dashed = false, id = uid('r') }) {
  const el = base({
    id, type: 'rectangle', x, y, width: w, height: h,
    backgroundColor: bg, strokeColor: stroke, strokeWidth: sw,
    strokeStyle: dashed ? 'dashed' : 'solid', roundness: { type: 3 },
  })
  els.push(el)
  return el
}

// Freistehender Text. align:'left' → x ist linke Kante, align:'center' → x ist Mitte.
function text({ x, y, lines, fs = 15, color = INK, align = 'left' }) {
  const arr = Array.isArray(lines) ? lines : [lines]
  const w = Math.max(...arr.map((l) => estW(l, fs)))
  const h = arr.length * fs * 1.25
  const el = base({
    id: uid('t'), type: 'text', x: align === 'center' ? x - w / 2 : x, y,
    width: w, height: h, strokeColor: color, roundness: null,
    text: arr.join('\n'), originalText: arr.join('\n'),
    fontSize: fs, fontFamily: 1, textAlign: align === 'center' ? 'center' : 'left',
    verticalAlign: 'top', containerId: null, lineHeight: 1.25,
  })
  els.push(el)
  return el
}

// Rechteck mit gebundenem, zentriertem Text (bleibt in Excalidraw zusammen).
function chip({ x, y, w, h, label, bg, sw = 2, fs = 14 }) {
  const r = rect({ x, y, w, h, bg, sw })
  const tw = estW(label, fs), th = fs * 1.25
  const t = base({
    id: uid('bt'), type: 'text', x: x + (w - tw) / 2, y: y + (h - th) / 2,
    width: tw, height: th, roundness: null,
    text: label, originalText: label, fontSize: fs, fontFamily: 1,
    textAlign: 'center', verticalAlign: 'middle', containerId: r.id, lineHeight: 1.25,
  })
  els.push(t)
  r.boundElements = [{ type: 'text', id: t.id }]
  return r
}

function arrow({ points, color = INK, sw = 2, dashed = false, from = null, to = null }) {
  const [x0, y0] = points[0]
  const rel = points.map(([x, y]) => [x - x0, y - y0])
  const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1])
  const el = base({
    id: uid('a'), type: 'arrow', x: x0, y: y0,
    width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
    strokeColor: color, strokeWidth: sw, strokeStyle: dashed ? 'dashed' : 'solid',
    roundness: { type: 2 }, points: rel, lastCommittedPoint: null,
    startArrowhead: null, endArrowhead: 'arrow',
    startBinding: from ? { elementId: from.id, focus: 0, gap: 6 } : null,
    endBinding: to ? { elementId: to.id, focus: 0, gap: 6 } : null,
  })
  els.push(el)
  for (const s of [from, to]) if (s) s.boundElements = [...(s.boundElements || []), { id: el.id, type: 'arrow' }]
  return el
}

// Band = Container + Kopfzeile; Inhalt kommt als chips/text obendrauf.
function band({ x = MAIN_X, y, h, w = MAIN_W, bg, head }) {
  const r = rect({ x, y, w, h, bg })
  text({ x: x + 24, y: y + 20, lines: head, fs: 19 })
  return r
}

function chipRow({ x = MAIN_X, w = MAIN_W, y, h, items, bg, pad = 24, gap = 14 }) {
  const n = items.length
  const cw = (w - 2 * pad - (n - 1) * gap) / n
  return items.map((it, i) =>
    chip({
      x: x + pad + i * (cw + gap), y, w: cw, h,
      label: typeof it === 'string' ? it : it.label,
      bg: (typeof it === 'object' && it.bg) || bg,
      sw: (typeof it === 'object' && it.sw) || 2,
    }))
}

// ------------------------------------------------------------- Diagramm ----
text({ x: MAIN_X, y: 44, lines: 'Von Wert zu Requirement — und was die Ontologie beiträgt', fs: 30 })
text({
  x: MAIN_X, y: 90, fs: 15, color: MUTED,
  lines: 'Taxonomie der Wertkette · TheArchitect · Stand 2026-08-08 · Quellen: Lean-Canvas/Fermi 2026-08-01, Canon-Architektur 2026-07-05 (ADR-0004-R), Pre-Flight-Skill',
})

const bWert = band({
  y: 150, h: 140, bg: C.wert,
  head: '0 · WERT — der Anker, gegen den alles zählt',
})
text({
  x: MAIN_X + 24, y: 200, fs: 15, lines: [
    'MSC: ~500 k € ARR bis Ende 2029 · Team 2–4',
    'Engpass: Vertriebsdurchsatz — nicht der Preis, nicht das Produkt',
    'Schlüsselmetrik: erster Audit-Export pro Kunde',
  ],
})

const bTreiber = band({
  y: 350, h: 180, bg: C.treiber,
  head: '1 · WERT-TREIBER — worauf Wertsteigerung einzahlt',
})
chipRow({
  y: 412, h: 48, bg: '#ffffff',
  items: ['ein Nachweis, mehrere Gesetze', 'belegbare Herkunft'],
})
chipRow({
  y: 472, h: 48, bg: '#ffffff',
  items: ['Partner-/Kanzlei-Kanal', 'Zeit bis zum Audit-Export'],
})

const bUC = band({
  y: 590, h: 210, bg: C.uc,
  head: '2 · USE CASE (UC-XXX-NNN) — bewegt genau einen Treiber',
})
chipRow({
  y: 652, h: 52, bg: '#ffffff',
  items: ['St. 1–2 · Bestand', 'St. 3 · Prämisse gemessen?', 'St. 4 · WSJF (8 Kriterien)'],
})
chipRow({
  y: 716, h: 52, bg: '#ffffff',
  items: [
    'St. 5 · Komplexität (Ousterhout)',
    { label: 'St. 6 · Loop-Kontrakt ⟵ neu', bg: C.wert, sw: 4 },
  ],
})

const bREQ = band({
  y: 860, h: 180, bg: C.req,
  head: '3 · REQUIREMENT (REQ-…) — WAS wahr sein muss',
})
chipRow({ y: 922, h: 48, bg: '#ffffff', items: ['prüfbare Bedingung, keine Aufgabe', 'eigene Akzeptanzkriterien'] })
chipRow({ y: 982, h: 48, bg: '#ffffff', items: ['1..n je UC (komplex: 3–8)', 'RVTM: REQ → Task → Beleg'] })

const bEvidenz = band({
  y: 1100, h: 180, bg: C.evidenz,
  head: '4 · EVIDENZ — woran „fertig" gemessen wird',
})
chipRow({ y: 1162, h: 48, bg: '#ffffff', items: ['E2E grün, nicht Config-Row', 'Gold-Set + κ, out-of-sample'] })
chipRow({ y: 1222, h: 48, bg: '#ffffff', items: ['Adjudikation bei Dissens', 'Positiv- + Negativ-Kontrolle'] })

const bImpact = band({
  y: 1340, h: 120, bg: C.wert,
  head: '5 · IMPACT (Ist) — Done nennt Wirkung, nicht Aktivität',
})
text({
  x: MAIN_X + 24, y: 1390, fs: 15, lines: [
    '„5 von 7 EA-Fragen auf Niveau A/B" statt „deployed" · bei Bugs: E2E-Evidenz',
    'Autoclose per Commit-Titel ⇒ Impact als Kommentar nachtragen',
  ],
})

// Kettenpfeile + Übergangs-Label
const steps = [
  [bWert, bTreiber, 290, 350, 'welcher Treiber löst den Engpass?'],
  [bTreiber, bUC, 530, 590, 'Pre-Flight St. 3–5'],
  [bUC, bREQ, 800, 860, 'Pre-Flight St. 6'],
  [bREQ, bEvidenz, 1040, 1100, 'Bau + Verifikation'],
  [bEvidenz, bImpact, 1280, 1340, 'Abnahme'],
]
for (const [from, to, y0, y1, label] of steps) {
  arrow({ points: [[CHAIN_X, y0], [CHAIN_X, y1]], sw: 3, from, to })
  text({ x: CHAIN_X + 22, y: y0 + 16, lines: label, fs: 14, color: MUTED })
}

// ------------------------------------------------------------- Ontologie ----
const spine = rect({ x: ONT_X, y: 150, w: ONT_W, h: 1130, bg: C.shell, stroke: '#0c8599', dashed: true })
text({ x: ONT_X + 24, y: 172, lines: 'ONTOLOGIE — die gemeinsame Sprache', fs: 19, color: '#0b7285' })
text({
  x: ONT_X + 24, y: 206, fs: 13, color: MUTED, lines: [
    'Identität = opake workId + NormAlias,',
    'nie ein Publikationsschlüssel (ADR-0004-R)',
  ],
})

const ONT = [
  'Norm — workId · Alias · bitemporal',
  'Structure (@eId) — Chapter → Article → Paragraph',
  'Obligation — die Pflicht selbst',
  'Control — die Maßnahme',
  'Subject — Modell · Graph · Workflow',
  'Assessment / Evidence — Beleg + Herkunft',
  'Finding / Risk — die Lücke',
  'Remediation — der Fix',
]
const ontBoxes = ONT.map((label, i) =>
  chip({ x: ONT_X + 24, y: 270 + i * 120, w: ONT_W - 48, h: 60, label, bg: C.onto }))
for (let i = 0; i < ontBoxes.length - 1; i++) {
  arrow({
    points: [[ONT_X + ONT_W / 2, 330 + i * 120], [ONT_X + ONT_W / 2, 390 + i * 120]],
    color: '#0c8599', from: ontBoxes[i], to: ontBoxes[i + 1],
  })
}
text({
  x: ONT_X + 24, y: 1200, fs: 13, color: '#0b7285', lines: [
    'Subject × Norm — drei Tore:',
    'COVER · ENFORCE · ATTEST',
  ],
})

// Beitrags-Pfeile: Ontologie → jede Ebene der Kette
const contribs = [
  [440, bTreiber, ['eine Pflicht, mehrere Gesetze —', '„assess once, comply many"']],
  [695, bUC, ['kanonische Handlungen (26 aus 216)', 'machen UCs komponierbar']],
  [950, bREQ, ['REQ zitiert die Norm-Klausel', '→ maschinell prüfbar']],
  [1190, bEvidenz, ['Text-Anker (versionHash):', 'Anker gebrochen = Beleg ungültig']],
]
for (const [y, target, label] of contribs) {
  arrow({ points: [[ONT_X, y], [MAIN_X + MAIN_W + 5, y]], color: '#0c8599', sw: 3, to: target })
  text({ x: GAP_CX, y: y - 44, lines: label, fs: 14, color: '#0b7285', align: 'center' })
}

// ---------------------------------------------------------- Rückkopplung ----
arrow({
  points: [[MAIN_X, 1400], [LOOP_A_X, 1400], [LOOP_A_X, 220], [MAIN_X - 5, 220]],
  color: RED, sw: 3, from: bImpact, to: bWert,
})
text({
  x: LOOP_A_X + 18, y: 296, fs: 14, color: RED, lines: [
    'Rückkopplung 1 — Loop-Kontrakt:',
    'Impact (Ist) gegen Soll',
  ],
})

arrow({
  points: [[MAIN_X + MAIN_W, 1400], [LOOP_B_X, 1400], [LOOP_B_X, 200], [ONT_X + ONT_W + 5, 200]],
  color: GREEN, sw: 3, from: bImpact, to: spine,
})
text({
  x: ONT_X + 60, y: 1310, fs: 14, color: GREEN, lines: [
    'Rückkopplung 2 — Wertsteigerung:',
    'jeder Durchlauf reichert den Korpus an',
  ],
})

// ----------------------------------------------------------------- Fazit ----
rect({ x: MAIN_X, y: 1520, w: ONT_X + ONT_W - MAIN_X, h: 120, bg: C.note, stroke: MUTED })
text({ x: MAIN_X + 24, y: 1542, lines: 'Die Kernaussage', fs: 17 })
text({
  x: MAIN_X + 24, y: 1572, fs: 15, lines: [
    'Wert entsteht je Use Case — linear. WERTSTEIGERUNG entsteht in der Ontologie: jeder Durchlauf reichert Korpus und Handlungs-Katalog an, dadurch',
    'wird der nächste UC billiger und der Nachweis über mehr Gesetze tragfähig. Die Ontologie ist kein Nebenprodukt der Kette, sondern ihr Zinseszins.',
  ],
})

// ------------------------------------------------------------- Ausgaben ----
writeFileSync(`${OUT}.excalidraw`, JSON.stringify({
  type: 'excalidraw', version: 2, source: 'scripts/gen-taxonomie-diagram.mjs',
  elements: els, appState: { gridSize: null, viewBackgroundColor: '#ffffff' }, files: {},
}, null, 1))

// --- SVG-Vorschau aus denselben Elementen -----------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const colors = [...new Set(els.filter((e) => e.type === 'arrow').map((e) => e.strokeColor))]
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" font-family="Segoe UI, Helvetica, sans-serif">`,
  `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>`, '<defs>',
  ...colors.map((c) => `<marker id="ah${c.slice(1)}" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 z" fill="${c}"/></marker>`),
  '</defs>',
]
for (const e of els) {
  if (e.type === 'rectangle') {
    svg.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="10" fill="${e.backgroundColor}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${e.strokeStyle === 'dashed' ? ' stroke-dasharray="10 6"' : ''}/>`)
  } else if (e.type === 'arrow') {
    const pts = e.points.map(([x, y]) => `${e.x + x},${e.y + y}`).join(' ')
    svg.push(`<polyline points="${pts}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" stroke-linejoin="round" marker-end="url(#ah${e.strokeColor.slice(1)})"/>`)
  } else if (e.type === 'text') {
    const lines = e.text.split('\n')
    const anchor = e.textAlign === 'center' ? 'middle' : 'start'
    const tx = e.textAlign === 'center' ? e.x + e.width / 2 : e.x
    // gebundener Text sitzt vertikal mittig im Container, freier Text hängt oben
    const top = e.containerId ? e.y : e.y
    lines.forEach((l, i) => {
      svg.push(`<text x="${tx}" y="${top + (i + 0.8) * e.fontSize * 1.25}" font-size="${e.fontSize}" fill="${e.strokeColor}" text-anchor="${anchor}">${esc(l)}</text>`)
    })
  }
}
svg.push('</svg>')
writeFileSync(`${OUT}.svg`, svg.join('\n'))

console.log(`${els.length} Elemente → ${OUT}.excalidraw + .svg`)
