#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-09-preflight-ablauf.{excalidraw,svg}
//
// Inhalt gespiegelt aus docs/skills/pre-flight/SKILL.md (Stand nach der
// Loop-Kontrakt-Erweiterung 2026-08-08). Aendert sich der Skill, aendert sich
// dieses Diagramm mit — beides zusammen anfassen.
//
//   node scripts/gen-preflight-diagram.mjs
//
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newCanvas, wrap, MUTED, RED, GREEN } from './lib/excalidraw.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-09-preflight-ablauf')

// ---------------------------------------------------------------- Layout ----
const MAIN_X = 280, MAIN_W = 780
const RULE_X = 1350, RULE_W = 470
const EXIT_X = 60, EXIT_W = 170
const CHAIN_X = MAIN_X + MAIN_W / 2
const CANVAS_W = 1900, CANVAS_H = 2060

const C = {
  ausloeser: '#f1f3f5', bestand: '#a5d8ff', praemisse: '#ffc9c9',
  score: '#ffec99', komplex: '#d0bfff', issue: '#b2f2bb',
  uebergabe: '#ffd8a8', rule: '#ffc9c9', shell: '#f8f9fa', note: '#f1f3f5',
}
const ROSE = '#c2255c'

const { text, rect, chip, arrow, band, chipRow, writeExcalidraw, writeSvg, overflows, textCollisions } =
  newCanvas({ width: CANVAS_W, height: CANVAS_H })

const mainBand = (o) => band({ x: MAIN_X, w: MAIN_W, ...o })
const mainRow = (o) => chipRow({ x: MAIN_X, w: MAIN_W, ...o })
const mid = (b) => b.y + b.height / 2

// ------------------------------------------------------------- Diagramm ----
text({ x: MAIN_X, y: 44, lines: 'Der Pre-Flight — sechs Tore, bevor ein Ticket entsteht', fs: 30 })
text({
  x: MAIN_X, y: 90, fs: 15, color: MUTED,
  lines: 'Stand 2026-08-09 · gespiegelt aus docs/skills/pre-flight/SKILL.md · Reihenfolge ist bindend — jede Stufe darf stoppen oder umschneiden',
})

const bAusloeser = mainBand({ y: 150, h: 90, bg: C.ausloeser, head: 'AUSLÖSER — wann der Pre-Flight läuft', headFs: 17 })
text({
  x: MAIN_X + 24, y: 196, fs: 13, color: MUTED, lines: [
    'neue Aufgabe · „lass uns X bauen" · ein Altticket aktivieren · vor writing-plans',
    'Er läuft VOR dem Plan, nicht erst vor dem Bau.',
  ],
})

const b1 = mainBand({ y: 300, h: 130, bg: C.bestand, head: '1 · LINEAR-SUCHE — gibt es das schon?' })
mainRow({
  y: 356, h: 48, bg: '#ffffff', fs: 13,
  items: ['Titel UND Beschreibung', 'Done-Issues melden', 'bestehende REQs sammeln'],
})

const b2 = mainBand({ y: 490, h: 130, bg: C.bestand, head: '2 · CODEBASE-SCAN — tut der Code das schon?' })
mainRow({
  y: 546, h: 48, bg: '#ffffff', fs: 13,
  items: ['Komponenten · Stores · Routen', 'Ist-Zustand lesen, nicht raten', 'Explore-Agent: Datei:Zeile'],
})

const b3 = mainBand({ y: 680, h: 175, bg: C.praemisse, head: '3 · PRÄMISSEN-PRÜFUNG — stimmt die Annahme?' })
text({
  x: MAIN_X + 24, y: 734, fs: 14, color: MUTED,
  lines: 'Was nimmt dieses Vorhaben als wahr an — und ist das gemessen oder geglaubt?',
})
mainRow({
  y: 762, h: 48, fs: 13, bg: '#ffffff',
  items: [
    { label: 'gemessen → Beleg verlinken, weiter', bg: '#b2f2bb' },
    { label: 'geglaubt → STOPP, Decision-Ticket blockt', bg: '#ffffff', sw: 4 },
  ],
})
text({
  x: MAIN_X + 24, y: 820, fs: 12.5, color: MUTED, lines: [
    'Pflicht: Optionen (mind. 2, „nichts tun" zählt) · Konsequenzen je Option · Rückholbarkeit',
    'Präzedenz THE-438: 7 REQs auf ungeprüfter Annahme — zwei Stunden Messung entzogen ihr die Grundlage.',
  ],
})

const b4 = mainBand({ y: 915, h: 150, bg: C.score, head: '4 · WSJF-SCORING — lohnt es sich? (8 Kriterien, je 0–5)' })
text({
  x: MAIN_X + 24, y: 970, fs: 14, lines: [
    'Business Value · Business Risk · Implementation Challenges · Chance of Success',
    'Compliance · Relationship to Requirements · Urgency · Status (abgeleitet)',
  ],
})
text({
  x: MAIN_X + 24, y: 1024, fs: 12.5, color: MUTED,
  lines: 'gleich gewichtet (8 × 12,5 %) · bestimmt die Backlog-Reihenfolge · Score in Ticket UND RVTM',
})

const b5 = mainBand({ y: 1125, h: 205, bg: C.komplex, head: '5 · KOMPLEXITÄT (Ousterhout) — was handeln wir uns ein?' })
mainRow({
  y: 1180, h: 44, bg: '#ffffff', fs: 13,
  items: [
    'Change Amplification', 'Cognitive Load',
    { label: 'Unknown Unknowns', bg: C.score, sw: 4 },
  ],
})
mainRow({
  y: 1234, h: 44, bg: '#ffffff', fs: 13,
  items: ['Hebel: Abhängigkeiten', 'Hebel: Obscurity'],
})
text({
  x: MAIN_X + 24, y: 1288, fs: 12.5, color: MUTED, lines: [
    'oben die drei Symptome, unten die zwei Ursachen — drehen lässt sich nur an den Ursachen',
    'Regel: hoch bei Unknown Unknowns oder Abhängigkeiten → vor der Issue-Erstellung umschneiden',
  ],
})

const b6 = mainBand({ y: 1390, h: 200, bg: C.issue, head: '6 · ISSUE ANLEGEN — erst jetzt entsteht etwas in Linear' })
mainRow({
  y: 1446, h: 54, bg: '#ffffff', fs: 13,
  items: [
    { label: ['Parent: UC-XXX-NNN', 'Label Feature | Improvement | Bug'] },
    { label: ['REQ-Kinder: 1..n (komplex 3–8)', 'Label Requirement · eigene AC'] },
  ],
})
mainRow({
  y: 1510, h: 44, bg: C.score, fs: 13,
  items: ['Kill-Kriterium + Re-Trigger', 'Loop-Budget (Default 3)', 'Impact-Statement (Soll)'],
})
text({
  x: MAIN_X + 24, y: 1564, fs: 12.5, color: MUTED,
  lines: 'REQs beschreiben, WAS wahr sein muss — prüfbare Bedingungen, keine Aufgaben.',
})

const b7 = mainBand({ y: 1650, h: 140, bg: C.uebergabe, head: 'ÜBERGABE — sechs Ergebnisse, dann Freigabe abwarten' })
text({
  x: MAIN_X + 24, y: 1704, fs: 14, lines: [
    'Bestand · Prämissen-Urteil · Score · Komplexitäts-Verdikt · Loop-Kontrakt · Slice-Vorschlag',
    'Erst nach der Freigabe: writing-plans (Plan + RVTM) → subagent-driven-development',
  ],
})

// Kettenpfeile
const steps = [
  [bAusloeser, b1, 240, 300, ''],
  [b1, b2, 430, 490, ''],
  [b2, b3, 620, 680, 'Ergebnis aus 1+2 dem Nutzer vorlegen'],
  [b3, b4, 855, 915, 'nur mit gemessener Prämisse'],
  [b4, b5, 1065, 1125, ''],
  [b5, b6, 1330, 1390, 'erst wenn der Schnitt steht'],
  [b6, b7, 1590, 1650, ''],
]
for (const [from, to, y0, y1, label] of steps) {
  arrow({ points: [[CHAIN_X, y0], [CHAIN_X, y1]], sw: 3, from, to })
  if (label) text({ x: CHAIN_X + 22, y: y0 + 18, lines: label, fs: 14, color: MUTED })
}

// ------------------------------------------------ Ausgaenge nach links ----
text({ x: EXIT_X, y: 256, fs: 14, color: RED, lines: ['STOPP oder', 'UMSCHNEIDEN'] })
const EXITS = [
  [b1, 'schon gebaut → Ticket schließen'],
  [b2, 'teilweise da → Umfang schneiden'],
  [b3, 'geglaubt → Entscheidung blockt'],
  [b4, 'Score zu niedrig → Backlog'],
  [b5, 'Unknown Unknowns hoch → anders schneiden'],
]
for (const [target, label] of EXITS) {
  const y = mid(target)
  const box = chip({ x: EXIT_X, y: y - 32, w: EXIT_W, h: 64, bg: '#ffffff', fs: 12, label: wrap(label, 22) })
  arrow({ points: [[MAIN_X, y], [EXIT_X + EXIT_W + 5, y]], color: RED, sw: 2, dashed: true, from: target, to: box })
}

// ------------------------------------------------------------ Rote Linien ----
rect({ x: RULE_X, y: 150, w: RULE_W, h: 1660, bg: C.shell, stroke: ROSE, dashed: true })
text({ x: RULE_X + 24, y: 172, lines: 'ROTE LINIEN — je Stufe', fs: 19, color: ROSE })
text({
  x: RULE_X + 24, y: 206, fs: 13, color: MUTED,
  lines: ['Was an genau dieser Stufe', 'nie passieren darf.'],
})

const RULES = [
  [b1, 'Nie eine bereits erledigte Arbeit übersehen — bestehende REQs sind der Schutzraum, den der Plan nicht brechen darf.'],
  [b2, 'Nie den Ist-Zustand raten. Und nie überspringen, weil „das kenne ich doch" — genau dort sitzen die Dubletten.'],
  [b3, 'Nie ein Bau-Ticket auf geglaubter Prämisse. Und nie eine Entscheidung ohne die verworfenen Alternativen samt ihrem Preis.'],
  [b4, 'Nie einen Alt-Score ungeprüft übernehmen — Scores sind Momentaufnahmen, gefallene Blocker verschieben sie.'],
  [b5, 'Nie bauen, wenn Unknown Unknowns oder Abhängigkeiten hoch sind — vorher anders schneiden.'],
  [b6, 'Nie ein Done, das nur Aktivität nennt. Nie das Loop-Budget stillschweigend überziehen.'],
  [b7, 'Nie mit der Implementierung beginnen, bevor der Nutzer den Plan freigegeben hat.'],
]
for (const [target, body] of RULES) {
  const y = mid(target)
  chip({ x: RULE_X + 24, y: y - 55, w: RULE_W - 48, h: 110, bg: C.rule, fs: 13, label: wrap(body, 50) })
  arrow({ points: [[RULE_X, y], [MAIN_X + MAIN_W + 5, y]], color: ROSE, sw: 3, to: target })
}

// ----------------------------------------------------------------- Fazit ----
rect({ x: MAIN_X, y: 1870, w: RULE_X + RULE_W - MAIN_X, h: 130, bg: C.note, stroke: MUTED })
text({ x: MAIN_X + 24, y: 1892, lines: 'Die Kernaussage', fs: 17 })
text({
  x: MAIN_X + 24, y: 1922, fs: 15, lines: [
    'Die Reihenfolge ist bindend, und jede Stufe darf das Vorhaben stoppen oder umschneiden — das ist ihr Zweck, kein Nebeneffekt. Der Pre-Flight',
    'ist deshalb kein Formular vor dem Bau, sondern die Stelle, an der ein Vorhaben am billigsten stirbt: Stufe 3 kostet Stunden, ein Fehlbau Wochen.',
  ],
})

// ------------------------------------------------------------- Ausgaben ----
writeExcalidraw(`${OUT}.excalidraw`, 'scripts/gen-preflight-diagram.mjs')
writeSvg(`${OUT}.svg`)
const bad = [...overflows(), ...textCollisions()]
if (bad.length) console.warn('LAYOUT-PROBLEM:', bad)
console.log(`→ ${OUT}.excalidraw + .svg`)
