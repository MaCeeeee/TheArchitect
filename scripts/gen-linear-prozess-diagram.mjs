#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-08-ticket-prozess-linear.{excalidraw,svg}
//
// Status und Labels sind aus dem echten Workspace (Team THE) gelesen, nicht geraten:
// Backlog · Todo · In Progress · In Review · Done · Canceled · Duplicate
// Feature · Improvement · Bug · Requirement
//
//   node scripts/gen-linear-prozess-diagram.mjs
//
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newCanvas, wrap, MUTED, RED, GREEN } from './lib/excalidraw.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-08-ticket-prozess-linear')

// ---------------------------------------------------------------- Layout ----
const MAIN_X = 180, MAIN_W = 780
const RULE_X = 1250, RULE_W = 470
const CHAIN_X = MAIN_X + MAIN_W / 2
const LOOP_X = 90
const CANVAS_W = 1900, CANVAS_H = 1890

const C = {
  zulauf: '#f1f3f5', preflight: '#ffd8a8', fork: '#f8f9fa',
  entscheidung: '#ffc9c9', bau: '#a5d8ff', struktur: '#d0ebff',
  lauf: '#b2f2bb', done: '#ffec99', rule: '#ffc9c9',
  shell: '#f8f9fa', note: '#f1f3f5',
}
const ROSE = '#c2255c'

const { text, rect, chip, arrow, band, chipRow, writeExcalidraw, writeSvg, overflows, textCollisions } =
  newCanvas({ width: CANVAS_W, height: CANVAS_H })

const mainBand = (o) => band({ x: MAIN_X, w: MAIN_W, ...o })

// Bandmitten — die Regel-Kästen rechts richten sich exakt daran aus.
const MID = { preflight: 395, fork: 665, struktur: 970, lauf: 1280, done: 1555 }

// ------------------------------------------------------------- Diagramm ----
text({ x: MAIN_X, y: 44, lines: 'Der Ticket-Prozess in Linear — von der Idee zum belegten Done', fs: 30 })
text({
  x: MAIN_X, y: 90, fs: 15, color: MUTED,
  lines: 'Team THE · Stand 2026-08-08 · Status und Labels aus dem Workspace gelesen · Quellen: Pre-Flight-Skill, RVTM-Skill, reale Tickets THE-577 / THE-628',
})

const bZulauf = mainBand({ y: 150, h: 110, bg: C.zulauf, head: '0 · ZULAUF — hier gibt es noch kein Ticket' })
text({
  x: MAIN_X + 24, y: 202, fs: 14, lines: [
    'neue Aufgabe · UC-Idee · Bug aus Prod · Kundenfeedback · ein Blocker ist gefallen',
    'Der Pre-Flight läuft VOR dem Ticket und vor dem Plan — nicht erst vor dem Bau.',
  ],
})

const bPreflight = mainBand({ y: 320, h: 150, bg: C.preflight, head: '1 · PRE-FLIGHT — Pflichtstufen, bevor irgendetwas angelegt wird' })
chipRow({
  x: MAIN_X, w: MAIN_W, y: 382, h: 46, bg: '#ffffff', fs: 13,
  items: ['St. 1–2 · Bestand', 'St. 3 · Prämisse', 'St. 4 · WSJF', 'St. 5 · Komplexität'],
})
text({
  x: MAIN_X + 24, y: 440, fs: 13, color: MUTED,
  lines: 'Erst Stufe 6 legt Tickets an — vorher existiert in Linear nichts.',
})

// --- Die Gabelung: welches Ticket überhaupt entstehen darf -------------------
const bFork = mainBand({ y: 530, h: 270, bg: C.fork, head: '2 · DIE GABELUNG — welches Ticket überhaupt entstehen darf' })
text({
  x: MAIN_X + 24, y: 586, fs: 15, color: MUTED,
  lines: 'Stufe 3 fragt: Ist die tragende Prämisse gemessen oder geglaubt?',
})
const boxEntscheidung = rect({ x: 204, y: 620, w: 336, h: 160, bg: C.entscheidung })
text({
  x: 222, y: 638, fs: 13, lines: [
    'geglaubt →  ENTSCHEIDUNGS-TICKET',
    '',
    'Titel: „ENTSCHEIDUNG: …"',
    'Label: Feature (kein eigenes)',
    'schließt mit einer belegten Antwort',
    'DoD: Positiv- + Negativ-Kontrolle',
  ],
})
const boxBau = rect({ x: 600, y: 620, w: 336, h: 160, bg: C.bau })
text({
  x: 618, y: 638, fs: 13, lines: [
    'gemessen →  BAU-TICKET (Parent)',
    '',
    'Titel: „UC-XXX-NNN: …"',
    'Label: Feature | Improvement | Bug',
    'schließt mit Code + Impact (Ist)',
    'darf erst existieren, wenn',
    'die Entscheidung steht',
  ],
})
arrow({ points: [[540, 700], [600, 700]], color: RED, sw: 3, from: boxEntscheidung, to: boxBau })
text({ x: 570, y: 674, fs: 12, color: RED, align: 'center', lines: 'blockiert' })

// --- Ticket-Struktur --------------------------------------------------------
const bStruktur = mainBand({ y: 860, h: 220, bg: C.struktur, head: '3 · TICKET-STRUKTUR — Parent und REQ-Kinder' })
const parent = chip({ x: 204, y: 918, w: 430, h: 46, bg: C.bau, label: 'THE-628 · UC-E2E-001 · Label Feature' })
const kinder = [
  ['THE-629 · REQ-E2E-001.1 · Label Requirement', 986],
  ['THE-630 · REQ-E2E-001.2 · Label Requirement', 1032],
].map(([label, y]) => chip({ x: 264, y, w: 420, h: 40, bg: '#ffffff', fs: 13, label }))
for (const k of kinder) {
  arrow({ points: [[240, 964], [240, k.y + 20], [264, k.y + 20]], color: MUTED, to: k })
}
text({
  x: 712, y: 920, fs: 13,
  lines: ['+ Loop-Kontrakt im Parent:', 'Kill · Budget 3 · Impact-Soll'],
})
text({
  x: 712, y: 1000, fs: 13, color: MUTED,
  lines: ['REQs beschreiben Bedingungen,', 'keine Aufgaben.'],
})

// --- Der Statuslauf ---------------------------------------------------------
const bLauf = mainBand({ y: 1140, h: 280, bg: C.lauf, head: '4 · DER LAUF — die Status im Team THE' })
const status = chipRow({
  x: MAIN_X, w: MAIN_W, y: 1230, h: 52, bg: '#ffffff', fs: 13, gap: 36,
  items: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'],
})
for (let i = 0; i < status.length - 1; i++) {
  const a = status[i], b = status[i + 1]
  arrow({ points: [[a.x + a.width, 1256], [b.x, 1256]], sw: 2, from: a, to: b })
}
const inProgress = status[2], inReview = status[3]
const cxIn = inProgress.x + inProgress.width / 2
const cxRev = inReview.x + inReview.width / 2

// In Review findet einen Blocker → zurück auf In Progress
arrow({ points: [[cxRev, 1230], [cxRev, 1200], [cxIn, 1200], [cxIn, 1230]], color: RED, to: inProgress })
text({ x: cxIn + 36, y: 1176, fs: 11, color: RED, lines: 'Blocker gefunden → zurück' })

// Die zwei Ausgänge des Loop-Kontrakts
const exits = [
  ['Eskalation (Mensch)', 380, 180, 'Loop-Budget erschöpft'],
  ['Canceled', 600, 150, 'Kill-Kriterium erfüllt → Re-Trigger notieren'],
]
for (const [label, x, w, note] of exits) {
  const box = chip({ x, y: 1310, w, h: 44, bg: '#ffffff', fs: 13, label })
  arrow({ points: [[cxIn, 1282], [x + w / 2, 1310]], color: RED, from: inProgress, to: box })
  text({ x, y: 1362, fs: 12, color: RED, lines: note })
}

// --- Done -------------------------------------------------------------------
const bDone = mainBand({ y: 1480, h: 150, bg: C.done, head: '5 · DONE — was ein geschlossenes Ticket tragen muss' })
text({
  x: MAIN_X + 24, y: 1532, fs: 14, lines: [
    'REQs gehen einzeln auf Done · der Parent schließt mit Impact (Ist)',
    'RVTM: jede Zeile PASS mit konkreter Evidenz — die Matrix ist der Audit-Trail',
    'Autoclose per Branch-Name oder Commit-Titel ⇒ Impact als Kommentar nachtragen',
  ],
})

// Kettenpfeile
const steps = [
  [bZulauf, bPreflight, 260, 320, ''],
  [bPreflight, bFork, 470, 530, 'Stufe 6 legt an'],
  [bFork, bStruktur, 800, 860, 'nur das Bau-Ticket läuft weiter'],
  [bStruktur, bLauf, 1080, 1140, 'Status auf In Progress'],
  [bLauf, bDone, 1420, 1480, 'Abnahme'],
]
for (const [from, to, y0, y1, label] of steps) {
  arrow({ points: [[CHAIN_X, y0], [CHAIN_X, y1]], sw: 3, from, to })
  if (label) text({ x: CHAIN_X + 22, y: y0 + 18, lines: label, fs: 14, color: MUTED })
}

// ------------------------------------------------------ Regeln und Fallen ----
rect({ x: RULE_X, y: 150, w: RULE_W, h: 1500, bg: C.shell, stroke: ROSE, dashed: true })
text({ x: RULE_X + 24, y: 172, lines: 'REGELN & FALLEN — was den Lauf absichert', fs: 19, color: ROSE })
text({
  x: RULE_X + 24, y: 206, fs: 13, color: MUTED,
  lines: ['Jede Regel hängt an genau dem Schritt,', 'an dem sie zubeißt.'],
})

const RULES = [
  [MID.preflight, bPreflight, 'Score ist eine Momentaufnahme. Beim Aktivieren eines Alt-Tickets neu bewerten — gefallene Blocker verschieben ihn.'],
  [MID.fork, bFork, 'ENTSCHEIDUNG hat kein eigenes Label. Nur das Titel-Präfix trennt sie vom Bau-Ticket — beim Suchen mitdenken.'],
  [MID.struktur, bStruktur, 'REQ ist eine prüfbare Bedingung, keine Aufgabe. Sonst ist am Ende nicht messbar, ob es fertig ist.'],
  [MID.lauf, bLauf, 'Parallele Sessions teilen den Git-Index — atomar committen oder im Worktree arbeiten. Squash-Merge schneidet beim damaligen HEAD ab.'],
  [MID.done, bDone, 'Branch-Name UND Commit-Titel schließen Tickets automatisch. Fehlschließungen auditieren, Impact nachtragen.'],
]
for (const [y, target, body] of RULES) {
  chip({ x: RULE_X + 24, y: y - 55, w: RULE_W - 48, h: 110, bg: C.rule, fs: 13, label: wrap(body, 52) })
  arrow({ points: [[RULE_X, y], [MAIN_X + MAIN_W + 5, y]], color: ROSE, sw: 3, to: target })
}

// ---------------------------------------------------------- Rückkopplung ----
arrow({
  points: [[204, 700], [LOOP_X, 700], [LOOP_X, MID.preflight], [MAIN_X - 5, MID.preflight]],
  color: GREEN, sw: 3, from: boxEntscheidung, to: bPreflight,
})
text({
  x: LOOP_X + 18, y: 486, fs: 13, color: GREEN,
  lines: ['Entscheidung geschlossen →', 'Blocker fällt, Score neu bewerten'],
})

// ----------------------------------------------------------------- Fazit ----
rect({ x: MAIN_X, y: 1690, w: RULE_X + RULE_W - MAIN_X, h: 130, bg: C.note, stroke: MUTED })
text({ x: MAIN_X + 24, y: 1712, lines: 'Die Kernaussage', fs: 17 })
text({
  x: MAIN_X + 24, y: 1742, fs: 15, lines: [
    'Der Prozess trennt zwei Ticket-Arten: eine Entscheidung schließt mit einem Beleg, ein Bau-Ticket mit Code. Ein Bau-Ticket auf geglaubter Prämisse',
    'ist der teuerste Fehler — darum blockiert die Entscheidung, statt dass beide parallel laufen. Und Done heißt Wirkung, nicht Aktivität.',
  ],
})

// ------------------------------------------------------------- Ausgaben ----
writeExcalidraw(`${OUT}.excalidraw`, 'scripts/gen-linear-prozess-diagram.mjs')
writeSvg(`${OUT}.svg`)
const bad = [...overflows(), ...textCollisions()]
if (bad.length) console.warn("LAYOUT-PROBLEM:", bad)
console.log(`→ ${OUT}.excalidraw + .svg`)
