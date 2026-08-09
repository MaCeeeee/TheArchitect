#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-08-taxonomie-wert-zu-requirement.{excalidraw,svg}
//
//   node scripts/gen-taxonomie-diagram.mjs
//
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newCanvas, wrap, INK, MUTED, RED, GREEN } from './lib/excalidraw.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-08-taxonomie-wert-zu-requirement')

// ---------------------------------------------------------------- Layout ----
const MAIN_X = 180, MAIN_W = 760
const ONT_X = 1240, ONT_W = 460
const GAP_CX = (MAIN_X + MAIN_W + ONT_X) / 2 // Mitte der Beitrags-Spalte
const CHAIN_X = MAIN_X + MAIN_W / 2          // vertikale Kettenachse
const LOOP_A_X = 90, LOOP_B_X = 1780
const CANVAS_W = 1860, CANVAS_H = 1700

const C = {
  wert: '#ffec99', treiber: '#ffd8a8', uc: '#a5d8ff',
  req: '#b2f2bb', evidenz: '#d0bfff', onto: '#99e9f2',
  shell: '#f8f9fa', note: '#f1f3f5',
}
const TEAL = '#0c8599', TEAL_DARK = '#0b7285'

const { text, rect, chip, arrow, band, chipRow, writeExcalidraw, writeSvg, overflows, textCollisions } =
  newCanvas({ width: CANVAS_W, height: CANVAS_H })

const mainBand = (o) => band({ x: MAIN_X, w: MAIN_W, ...o })
const mainRow = (o) => chipRow({ x: MAIN_X, w: MAIN_W, ...o })

// ------------------------------------------------------------- Diagramm ----
text({ x: MAIN_X, y: 44, lines: 'Von Wert zu Requirement — und was die Ontologie beiträgt', fs: 30 })
text({
  x: MAIN_X, y: 90, fs: 15, color: MUTED,
  lines: 'Taxonomie der Wertkette · TheArchitect · Stand 2026-08-08 · Quellen: Lean-Canvas/Fermi 2026-08-01, Canon-Architektur 2026-07-05 (ADR-0004-R), Pre-Flight-Skill',
})

const bWert = mainBand({ y: 150, h: 140, bg: C.wert, head: '0 · WERT — der Anker, gegen den alles zählt' })
text({
  x: MAIN_X + 24, y: 200, fs: 15, lines: [
    'MSC: ~500 k € ARR bis Ende 2029 · Team 2–4',
    'Engpass: Vertriebsdurchsatz — nicht der Preis, nicht das Produkt',
    'Schlüsselmetrik: erster Audit-Export pro Kunde',
  ],
})

const bTreiber = mainBand({ y: 350, h: 180, bg: C.treiber, head: '1 · WERT-TREIBER — worauf Wertsteigerung einzahlt' })
mainRow({ y: 412, h: 48, bg: '#ffffff', items: ['ein Nachweis, mehrere Gesetze', 'belegbare Herkunft'] })
mainRow({ y: 472, h: 48, bg: '#ffffff', items: ['Partner-/Kanzlei-Kanal', 'Zeit bis zum Audit-Export'] })

const bUC = mainBand({ y: 590, h: 210, bg: C.uc, head: '2 · USE CASE (UC-XXX-NNN) — bewegt genau einen Treiber' })
mainRow({ y: 652, h: 52, bg: '#ffffff', items: ['St. 1–2 · Bestand', 'St. 3 · Prämisse gemessen?', 'St. 4 · WSJF (8 Kriterien)'] })
mainRow({
  y: 716, h: 52, bg: '#ffffff',
  items: ['St. 5 · Komplexität (Ousterhout)', { label: 'St. 6 · Loop-Kontrakt ⟵ neu', bg: C.wert, sw: 4 }],
})

const bREQ = mainBand({ y: 860, h: 180, bg: C.req, head: '3 · REQUIREMENT (REQ-…) — WAS wahr sein muss' })
mainRow({ y: 922, h: 48, bg: '#ffffff', items: ['prüfbare Bedingung, keine Aufgabe', 'eigene Akzeptanzkriterien'] })
mainRow({ y: 982, h: 48, bg: '#ffffff', items: ['1..n je UC (komplex: 3–8)', 'RVTM: REQ → Task → Beleg'] })

const bEvidenz = mainBand({ y: 1100, h: 180, bg: C.evidenz, head: '4 · EVIDENZ — woran „fertig" gemessen wird' })
mainRow({ y: 1162, h: 48, bg: '#ffffff', items: ['E2E grün, nicht Config-Row', 'Gold-Set + κ, out-of-sample'] })
mainRow({ y: 1222, h: 48, bg: '#ffffff', items: ['Adjudikation bei Dissens', 'Positiv- + Negativ-Kontrolle'] })

const bImpact = mainBand({ y: 1340, h: 120, bg: C.wert, head: '5 · IMPACT (Ist) — Done nennt Wirkung, nicht Aktivität' })
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
const spine = rect({ x: ONT_X, y: 150, w: ONT_W, h: 1130, bg: C.shell, stroke: TEAL, dashed: true })
text({ x: ONT_X + 24, y: 172, lines: 'ONTOLOGIE — die gemeinsame Sprache', fs: 19, color: TEAL_DARK })
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
    color: TEAL, from: ontBoxes[i], to: ontBoxes[i + 1],
  })
}
text({
  x: ONT_X + 24, y: 1200, fs: 13, color: TEAL_DARK,
  lines: ['Subject × Norm — drei Tore:', 'COVER · ENFORCE · ATTEST'],
})

// Beitrags-Pfeile: Ontologie → jede Ebene der Kette
const contribs = [
  [440, bTreiber, ['eine Pflicht, mehrere Gesetze —', '„assess once, comply many"']],
  [695, bUC, ['kanonische Handlungen (26 aus 216)', 'machen UCs komponierbar']],
  [950, bREQ, ['REQ zitiert die Norm-Klausel', '→ maschinell prüfbar']],
  [1190, bEvidenz, ['Text-Anker (versionHash):', 'Anker gebrochen = Beleg ungültig']],
]
for (const [y, target, label] of contribs) {
  arrow({ points: [[ONT_X, y], [MAIN_X + MAIN_W + 5, y]], color: TEAL, sw: 3, to: target })
  text({ x: GAP_CX, y: y - 44, lines: label, fs: 14, color: TEAL_DARK, align: 'center' })
}

// ---------------------------------------------------------- Rückkopplung ----
arrow({
  points: [[MAIN_X, 1400], [LOOP_A_X, 1400], [LOOP_A_X, 220], [MAIN_X - 5, 220]],
  color: RED, sw: 3, from: bImpact, to: bWert,
})
text({
  x: LOOP_A_X + 18, y: 296, fs: 14, color: RED,
  lines: ['Rückkopplung 1 — Loop-Kontrakt:', 'Impact (Ist) gegen Soll'],
})

arrow({
  points: [[MAIN_X + MAIN_W, 1400], [LOOP_B_X, 1400], [LOOP_B_X, 200], [ONT_X + ONT_W + 5, 200]],
  color: GREEN, sw: 3, from: bImpact, to: spine,
})
text({
  x: ONT_X + 60, y: 1310, fs: 14, color: GREEN,
  lines: ['Rückkopplung 2 — Wertsteigerung:', 'jeder Durchlauf reichert den Korpus an'],
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
writeExcalidraw(`${OUT}.excalidraw`, 'scripts/gen-taxonomie-diagram.mjs')
writeSvg(`${OUT}.svg`)
const bad = [...overflows(), ...textCollisions()]
if (bad.length) console.warn("LAYOUT-PROBLEM:", bad)
console.log(`→ ${OUT}.excalidraw + .svg`)
