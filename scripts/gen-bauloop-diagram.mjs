#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-09-bau-loop.{excalidraw,svg}
//
// Das Stueck zwischen Pre-Flight-Freigabe und Abnahme. Inhalt gespiegelt aus
// writing-plans, executing-plans, test-driven-development, systematic-debugging,
// verification-before-completion, requesting-code-review,
// finishing-a-development-branch und rvtm-traceability.
//
//   node scripts/gen-bauloop-diagram.mjs
//
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newCanvas, wrap, MUTED, RED } from './lib/excalidraw.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-09-bau-loop')

// ---------------------------------------------------------------- Layout ----
const MAIN_X = 340, MAIN_W = 780
const RVTM_X = 1400, RVTM_W = 470
const LOOP_X = 60, LOOP_W = 150      // Erklaerkaesten des roten Zyklus
const RING_INNER = 270, RING_OUTER = 230 // die zwei Rueckkanten
const CHAIN_X = MAIN_X + MAIN_W / 2
const CANVAS_W = 1950, CANVAS_H = 1875

const C = {
  freigabe: '#f1f3f5', plan: '#a5d8ff', bau: '#b2f2bb', verif: '#d0bfff',
  review: '#ffec99', merge: '#ffd8a8', abnahme: '#99e9f2',
  shell: '#f8f9fa', note: '#f1f3f5',
}
const BLUE = '#1971c2'

const { text, rect, chip, arrow, band, chipRow, writeExcalidraw, writeSvg, overflows, textCollisions } =
  newCanvas({ width: CANVAS_W, height: CANVAS_H })

const mainBand = (o) => band({ x: MAIN_X, w: MAIN_W, ...o })
const mainRow = (o) => chipRow({ x: MAIN_X, w: MAIN_W, ...o })
const mid = (b) => b.y + b.height / 2

// ------------------------------------------------------------- Diagramm ----
text({ x: MAIN_X, y: 44, lines: 'Der Bau-Loop — von der Freigabe zum belegten Done', fs: 30 })
text({
  x: MAIN_X, y: 90, fs: 15, color: MUTED,
  lines: 'Stand 2026-08-09 · das Stück zwischen Pre-Flight und Abnahme · gespiegelt aus writing-plans, TDD, verification-before-completion, finishing-a-development-branch',
})

const b0 = mainBand({ y: 150, h: 95, bg: C.freigabe, head: 'FREIGABE — der Pre-Flight ist durch', headFs: 17 })
text({
  x: MAIN_X + 24, y: 200, fs: 13, color: MUTED, lines: [
    'Bestand · Prämissen-Urteil · Score · Komplexitäts-Verdikt · Loop-Kontrakt · Slice liegen vor.',
    'Ohne die Freigabe des Nutzers beginnt hier nichts.',
  ],
})

const b1 = mainBand({ y: 305, h: 160, bg: C.plan, head: '1 · PLAN + RVTM  (writing-plans)' })
mainRow({
  y: 380, h: 48, bg: '#ffffff', fs: 13,
  items: ['Tasks in Bissen', 'Plan Review Loop', 'RVTM: alles PENDING'],
})
text({
  x: MAIN_X + 24, y: 440, fs: 12.5, color: MUTED,
  lines: 'Der Plan entsteht vor dem Code — und die RVTM mit ihm, damit die Messlatte nicht nachträglich fällt.',
})

const b2 = mainBand({ y: 525, h: 215, bg: C.bau, head: '2 · BAU — Red · Green · Refactor  (TDD)' })
mainRow({
  y: 600, h: 46, bg: '#ffffff', fs: 13,
  items: ['RED: Test schreiben', 'Verify RED: fallen sehen', 'GREEN: minimal'],
})
mainRow({
  y: 656, h: 46, bg: '#ffffff', fs: 13,
  items: ['Verify GREEN: laufen sehen', 'REFACTOR'],
})
text({
  x: MAIN_X + 24, y: 710, fs: 12.5, color: MUTED,
  lines: '„Wer den Test nicht hat fallen sehen, weiß nicht, ob er das Richtige prüft."',
})

const b3 = mainBand({ y: 800, h: 160, bg: C.verif, head: '3 · VERIFIKATION — Belege vor Behauptungen' })
mainRow({
  y: 875, h: 46, bg: '#ffffff', fs: 13,
  items: ['jede RVTM-Zeile PASS', 'kein PENDING bleibt', 'Evidenz = Ausgabe'],
})
text({
  x: MAIN_X + 24, y: 930, fs: 12.5, color: MUTED,
  lines: '„Evidence before claims, always." — ohne Beleg gilt es als nicht fertig, nicht als wahrscheinlich fertig.',
})

const b4 = mainBand({ y: 1020, h: 155, bg: C.review, head: '4 · REVIEW — früh und oft' })
mainRow({
  y: 1095, h: 46, bg: '#ffffff', fs: 13,
  items: ['requesting-code-review', 'PR + Diff-Kommentare', 'receiving-code-review'],
})
text({
  x: MAIN_X + 24, y: 1148, fs: 12.5, color: MUTED,
  lines: 'Feedback technisch prüfen, nicht performativ zustimmen — Unklares zurückfragen statt blind umsetzen.',
})

const b5 = mainBand({ y: 1235, h: 160, bg: C.merge, head: '5 · MERGE + DEPLOY — den Branch abschließen' })
mainRow({
  y: 1310, h: 46, bg: '#ffffff', fs: 13,
  items: ['Tests verifizieren', 'Base-Branch bestimmen', 'Optionen vorlegen'],
})
text({
  x: MAIN_X + 24, y: 1365, fs: 12.5, color: MUTED,
  lines: 'Deploy immer mit `-f docker-compose.prod.yml`, nie `reset --hard` · vor dem Commit den Branch prüfen.',
})

const b6 = mainBand({ y: 1455, h: 145, bg: C.abnahme, head: '6 · ABNAHME — Done nennt die Wirkung' })
text({
  x: MAIN_X + 24, y: 1528, fs: 13.5, lines: [
    'REQs einzeln auf Done · der Parent schließt mit dem Impact (Ist) im Soll-Format',
    'Die fertige RVTM ist der Audit-Trail · bei Linear-Autoclose den Impact als Kommentar nachtragen',
  ],
})

// Kettenpfeile
const steps = [
  [b0, b1, 245, 305, ''],
  [b1, b2, 465, 525, 'Plan freigegeben'],
  [b2, b3, 740, 800, ''],
  [b3, b4, 960, 1020, 'grün — sonst zurück nach links'],
  [b4, b5, 1175, 1235, 'approved'],
  [b5, b6, 1395, 1455, ''],
]
for (const [from, to, y0, y1, label] of steps) {
  arrow({ points: [[CHAIN_X, y0], [CHAIN_X, y1]], sw: 3, from, to })
  if (label) text({ x: CHAIN_X + 22, y: y0 + 18, lines: label, fs: 14, color: MUTED })
}

// --------------------------------------------------- Der rote Zyklus links ----
// Innere Rueckkante: Verifikation rot → zurueck in den Bau
arrow({
  points: [[MAIN_X, mid(b3)], [RING_INNER, mid(b3)], [RING_INNER, mid(b2)], [MAIN_X - 5, mid(b2)]],
  color: RED, sw: 3, from: b3, to: b2,
})
// Aeussere Rueckkante: Review findet etwas → zurueck in den Bau
arrow({
  points: [[MAIN_X, mid(b4)], [RING_OUTER, mid(b4)], [RING_OUTER, mid(b2) + 26], [MAIN_X - 5, mid(b2) + 26]],
  color: RED, sw: 3, from: b4, to: b2,
})

text({ x: LOOP_X, y: 530, fs: 14, color: RED, lines: ['WENN ES', 'ROT WIRD'] })
const LOOPNOTES = [
  [590, 'ab dem 2. roten Zyklus: systematic-debugging statt nächster Patch'],
  [835, 'Loop-Budget 3 — Zyklen mit NEUER Diagnose zählen nicht mit'],
  [1055, 'danach Eskalation mit Befund, kein vierter Versuch'],
]
for (const [y, body] of LOOPNOTES) {
  chip({ x: LOOP_X, y, w: LOOP_W, h: 84, bg: '#ffffff', fs: 11.5, label: wrap(body, 21) })
}
text({
  x: LOOP_X, y: 1160, fs: 11.5, color: RED,
  lines: wrap('Symptom-Fixes sind Scheitern — erst die Ursache, dann der Fix.', 21),
})

// ------------------------------------------------------------------ RVTM ----
rect({ x: RVTM_X, y: 150, w: RVTM_W, h: 1450, bg: C.shell, stroke: BLUE, dashed: true })
text({ x: RVTM_X + 24, y: 172, lines: 'RVTM — der Faden durch den Lauf', fs: 19, color: BLUE })
text({
  x: RVTM_X + 24, y: 206, fs: 13, color: MUTED, lines: [
    'Requirement → Task → Verifikation → Beleg',
    'Status: PASS · FAIL · PARTIAL · PENDING · N/A · BLOCKED',
  ],
})

const RVTM = [
  [b1, 'Entsteht hier: jede Anforderung wird eine Zeile, alle auf PENDING. Die Messlatte liegt, bevor Code existiert.'],
  [b2, 'Nach JEDER fertigen Task nachziehen — geänderte Dateien, Status, Evidenz. Nicht am Ende in einem Rutsch.'],
  [b3, 'Ist die Checkliste: kein PENDING darf übrig bleiben. Offen heißt jetzt prüfen oder N/A mit Begründung.'],
  [b4, 'Zeigt dem Reviewer, was womit belegt ist — die Diskussion läuft über Belege statt über Meinungen.'],
  [b5, 'Wird zum Audit-Trail des Branches: was wurde versprochen, was ist bewiesen.'],
  [b6, 'Liefert die Zahlen für das Impact-Statement (Ist) — Coverage und Evidenz stehen bereits drin.'],
]
for (const [target, body] of RVTM) {
  const y = mid(target)
  chip({ x: RVTM_X + 24, y: y - 55, w: RVTM_W - 48, h: 110, bg: C.plan, fs: 13, label: wrap(body, 50) })
  arrow({ points: [[RVTM_X, y], [MAIN_X + MAIN_W + 5, y]], color: BLUE, sw: 3, to: target })
}

// ----------------------------------------------------------------- Fazit ----
rect({ x: MAIN_X, y: 1660, w: RVTM_X + RVTM_W - MAIN_X, h: 145, bg: C.note, stroke: MUTED })
text({ x: MAIN_X + 24, y: 1682, lines: 'Die Kernaussage', fs: 17 })
text({
  x: MAIN_X + 24, y: 1712, fs: 15, lines: [
    'Der Loop dreht sich an der Evidenz, nicht an der Zuversicht: weiter geht es erst, wenn ein Beleg vorliegt. Und bleibt derselbe Befund dreimal',
    'rot, endet der Loop mit einer Eskalation statt mit einem vierten Versuch. Das Budget ist die Grenze, die aus einer Schleife einen Prozess macht.',
  ],
})

// ------------------------------------------------------------- Ausgaben ----
writeExcalidraw(`${OUT}.excalidraw`, 'scripts/gen-bauloop-diagram.mjs')
writeSvg(`${OUT}.svg`)
const bad = [...overflows(), ...textCollisions()]
if (bad.length) console.warn('LAYOUT-PROBLEM:', bad)
console.log(`→ ${OUT}.excalidraw + .svg`)
