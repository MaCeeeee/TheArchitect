// Kleine Zeichen-Bibliothek für generierte Excalidraw-Diagramme.
//
// newCanvas() liefert die Zeichen-Primitive plus zwei Ausgaben: die editierbare
// .excalidraw-Datei und eine SVG-Vorschau aus denselben Koordinaten. Die SVG ist
// damit eine echte Vorschau und keine zweite Wahrheit.
//
// Verwendet von scripts/gen-*-diagram.mjs.
import { writeFileSync } from 'node:fs'

export const INK = '#1e1e1e'
export const MUTED = '#868e96'
export const RED = '#e03131'
export const GREEN = '#2f9e44'

// Greedy-Umbruch auf eine Höchstzahl Zeichen je Zeile.
export function wrap(str, maxChars) {
  const out = []
  let line = ''
  for (const word of str.split(' ')) {
    if (line && (line + ' ' + word).length > maxChars) { out.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

export function newCanvas({ width, height }) {
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
  function chip({ x, y, w, h, label, bg, sw = 2, fs = 14, stroke = INK }) {
    const r = rect({ x, y, w, h, bg, sw, stroke })
    const arr = Array.isArray(label) ? label : [label]
    const tw = Math.max(...arr.map((l) => estW(l, fs)))
    const th = arr.length * fs * 1.25
    const t = base({
      id: uid('bt'), type: 'text', x: x + (w - tw) / 2, y: y + (h - th) / 2,
      width: tw, height: th, roundness: null,
      text: arr.join('\n'), originalText: arr.join('\n'), fontSize: fs, fontFamily: 1,
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

  // Band = Container mit Kopfzeile; Inhalt kommt als chips/text obendrauf.
  function band({ x, y, w, h, bg, head, headFs = 19 }) {
    const r = rect({ x, y, w, h, bg })
    text({ x: x + 24, y: y + 20, lines: head, fs: headFs })
    return r
  }

  // Gleich breite Chips nebeneinander; items sind Strings oder {label,bg,sw}.
  function chipRow({ x, w, y, h, items, bg, pad = 24, gap = 14, fs = 14 }) {
    const n = items.length
    const cw = (w - 2 * pad - (n - 1) * gap) / n
    return items.map((it, i) =>
      chip({
        x: x + pad + i * (cw + gap), y, w: cw, h, fs,
        label: typeof it === 'string' ? it : it.label,
        bg: (typeof it === 'object' && it.bg) || bg,
        sw: (typeof it === 'object' && it.sw) || 2,
      }))
  }

  function writeExcalidraw(path, source) {
    writeFileSync(path, JSON.stringify({
      type: 'excalidraw', version: 2, source,
      elements: els, appState: { gridSize: null, viewBackgroundColor: '#ffffff' }, files: {},
    }, null, 1))
  }

  function writeSvg(path) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const colors = [...new Set(els.filter((e) => e.type === 'arrow').map((e) => e.strokeColor))]
    const out = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Helvetica, sans-serif">`,
      `<rect width="${width}" height="${height}" fill="#ffffff"/>`, '<defs>',
      ...colors.map((c) => `<marker id="ah${c.slice(1)}" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 z" fill="${c}"/></marker>`),
      '</defs>',
    ]
    for (const e of els) {
      if (e.type === 'rectangle') {
        out.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="10" fill="${e.backgroundColor}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${e.strokeStyle === 'dashed' ? ' stroke-dasharray="10 6"' : ''}/>`)
      } else if (e.type === 'arrow') {
        const pts = e.points.map(([x, y]) => `${e.x + x},${e.y + y}`).join(' ')
        out.push(`<polyline points="${pts}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" stroke-linejoin="round" marker-end="url(#ah${e.strokeColor.slice(1)})"/>`)
      } else if (e.type === 'text') {
        const anchor = e.textAlign === 'center' ? 'middle' : 'start'
        const tx = e.textAlign === 'center' ? e.x + e.width / 2 : e.x
        e.text.split('\n').forEach((l, i) => {
          out.push(`<text x="${tx}" y="${e.y + (i + 0.8) * e.fontSize * 1.25}" font-size="${e.fontSize}" fill="${e.strokeColor}" text-anchor="${anchor}">${esc(l)}</text>`)
        })
      }
    }
    out.push('</svg>')
    writeFileSync(path, out.join('\n'))
  }

  // Prüft, ob gebundener Text breiter ist als sein Container — der häufigste Layoutfehler.
  // Prueft zwei Faelle: gebundener Text, der seinen Chip sprengt, und freier
  // Text, der aus dem Band laeuft, in dem er sitzt. Der zweite Fall fehlte
  // anfangs und hat eine zu lange Zeile im Preflight-Diagramm durchgelassen.
  function overflows() {
    const byId = new Map(els.map((e) => [e.id, e]))
    const rects = els.filter((e) => e.type === 'rectangle')
    const out = []

    for (const e of els.filter((e) => e.type === 'text' && e.containerId)) {
      if (e.width > byId.get(e.containerId).width - 16) {
        out.push(`Chip zu schmal für: ${e.text.replace(/\n/g, ' / ')}`)
      }
    }

    for (const e of els.filter((e) => e.type === 'text' && !e.containerId)) {
      // kleinstes Rechteck, in dem der Textanfang liegt
      const host = rects
        .filter((r) => e.x >= r.x && e.x < r.x + r.width && e.y >= r.y && e.y < r.y + r.height)
        .sort((a, b) => a.width * a.height - b.width * b.height)[0]
      if (!host) continue
      const dx = host.x + host.width - (e.x + e.width)
      const dy = host.y + host.height - (e.y + e.height)
      if (dx < 0 || dy < 0) {
        out.push(`ragt aus dem Kasten (rechts ${Math.round(dx)}, unten ${Math.round(dy)}): „${e.text.split('\n')[0]}"`)
      }
    }
    return out
  }

  // Findet einander überlappende Textblöcke — der zweithäufigste Layoutfehler,
  // typisch: Kopfzeile eines Bands und der erste Absatz darunter.
  // `tol` schluckt Rundungsfehler der Breitenschätzung.
  function textCollisions(tol = 4) {
    const t = els.filter((e) => e.type === 'text')
    const hits = []
    for (let i = 0; i < t.length; i++) {
      for (let j = i + 1; j < t.length; j++) {
        const a = t[i], b = t[j]
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (overlapX > tol && overlapY > tol) {
          hits.push(`${a.text.split('\n')[0]}  ⟷  ${b.text.split('\n')[0]}`)
        }
      }
    }
    return hits
  }

  return { els, rect, text, chip, arrow, band, chipRow, writeExcalidraw, writeSvg, overflows, textCollisions }
}
