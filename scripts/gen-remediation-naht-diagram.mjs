#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-10-remediation-naht.{excalidraw,svg}
//
// Der Weg vom Klick auf „Generate AI Fix" bis zur gedeckten Anforderung —
// quer durch die Zwei-Welten-Naht (Upload/Korpus). Zeigt die drei Bruchstellen
// aus THE-642 und was PR #171 daran aendert.
//
// Inhalt gespiegelt aus: RemediateGateway.tsx, remediationStore.ts,
// remediation.routes.ts, remediation.service.ts, RemediationProposal.ts,
// remediation-apply.service.ts, remediationBacklink.service.ts, norm.service.ts.
//
//   node scripts/gen-remediation-naht-diagram.mjs
//
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newCanvas, wrap, MUTED, RED, GREEN } from './lib/excalidraw.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-10-remediation-naht')

// ---------------------------------------------------------------- Layout ----
const MAIN_X = 430, MAIN_W = 800
const LEFT_X = 60, LEFT_W = 330            // SSE-Grenze + Sichtbarkeit
const KEY_X = 1300, KEY_W = 600            // die Schluessel-Spur
const CHAIN_X = MAIN_X + MAIN_W / 2
const CANVAS_W = 1960, CANVAS_H = 1810

const C = {
  flaeche: '#a5d8ff', route: '#ffd8a8', service: '#b2f2bb',
  persist: '#d0bfff', apply: '#99e9f2', backlink: '#ffec99',
  shell: '#f8f9fa', note: '#f1f3f5', broken: '#ffe3e3', fixed: '#ebfbee',
}
const BLUE = '#1971c2'

const { text, rect, chip, arrow, band, chipRow, writeExcalidraw, writeSvg, overflows, textCollisions } =
  newCanvas({ width: CANVAS_W, height: CANVAS_H })

const mainBand = (o) => band({ x: MAIN_X, w: MAIN_W, ...o })
const mainRow = (o) => chipRow({ x: MAIN_X, w: MAIN_W, ...o })
const mid = (b) => b.y + b.height / 2

// ------------------------------------------------------------- Kopfzeile ----
text({ x: MAIN_X, y: 40, lines: 'Remediate über die Zwei-Welten-Naht', fs: 30 })
text({
  x: MAIN_X, y: 86, fs: 15, color: MUTED,
  lines: 'Vom Klick zur gedeckten Anforderung · Stand PR #171 (THE-642 / THE-643 / THE-644) · rot = vorher gebrochen, grün = repariert',
})

// ------------------------------------------------------- 1 · Die Fläche ----
const b1 = mainBand({ y: 150, h: 165, bg: C.flaeche, head: '1 · FLÄCHE — RemediateGateway.tsx' })
mainRow({
  y: 222, h: 44, bg: '#ffffff', fs: 12.5,
  items: ['remediation-scope → Zähler', 'Klick: generate(…)', 'error aus dem Store'],
})
text({
  x: MAIN_X + 24, y: 276, fs: 12.5, color: MUTED,
  lines: 'Schickt `standardId` so, wie die Norm heißt: `corpus:dsgvo` oder eine rohe Standard-ObjectId.',
})

// -------------------------------------------------------- 2 · Die Route ----
const b2 = mainBand({ y: 360, h: 235, bg: C.route, head: '2 · ROUTE — remediation.routes.ts (SSE)' })
mainRow({
  y: 432, h: 44, bg: '#ffffff', fs: 12.5,
  items: ['Zod: Form prüfen', { label: 'getPipelineNorm → 404', bg: C.fixed, sw: 3 }, 'flushHeaders()'],
})
text({
  x: MAIN_X + 24, y: 492, fs: 12.5, color: MUTED, lines: [
    'Alles ÜBER `flushHeaders()` kann noch einen Statuscode setzen. Alles darunter nicht mehr —',
    'dort bleibt nur `data: {"type":"error"}` im offenen Strom. Das ist SSE, kein Mangel.',
  ],
})
text({ x: MAIN_X + 24, y: 550, fs: 12.5, color: GREEN, lines: 'NEU: die Norm-Auflösung wandert über die Grenze — unbekannte Norm = 404 statt 200.' })

// ------------------------------------------------------ 3 · Der Service ----
const b3 = mainBand({ y: 640, h: 195, bg: C.service, head: '3 · SERVICE — remediation.service.ts' })
mainRow({
  y: 712, h: 44, bg: '#ffffff', fs: 12.5,
  items: [{ label: 'buildSourceRef(context)', bg: C.fixed, sw: 3 }, 'Kontext + LLM', 'Vorschlag füllen'],
})
text({
  x: MAIN_X + 24, y: 772, fs: 12.5, color: MUTED, lines: [
    'normId := toNormWorkId(standardId)   — immer, in beiden Welten',
    'standardId := nur wenn isValidObjectId — sonst gar nicht',
  ],
})

// --------------------------------------------------- 4 · Die Persistenz ----
const b4 = mainBand({ y: 880, h: 200, bg: C.persist, head: '4 · PERSISTENZ — RemediationProposal (MongoDB)' })
mainRow({
  y: 952, h: 44, bg: '#ffffff', fs: 12.5,
  items: [{ label: 'normId: String', bg: C.fixed, sw: 3 }, { label: 'standardId: ObjectId', bg: C.broken, sw: 3 }, 'sectionIds: [String]'],
})
text({
  x: MAIN_X + 24, y: 1012, fs: 12.5, color: MUTED, lines: [
    'BRUCH 1: `corpus:dsgvo` ist ein String — Mongoose lehnte am ObjectId-Cast ab,',
    'bevor irgendetwas entstand. `standardId` bleibt nur noch für Bestandsdaten stehen.',
  ],
})

// -------------------------------------------------------- 5 · Das Apply ----
const b5 = mainBand({ y: 1125, h: 140, bg: C.apply, head: '5 · APPLY — remediation-apply.service.ts' })
mainRow({
  y: 1194, h: 44, bg: '#ffffff', fs: 12.5,
  items: ['Elemente in Neo4j', 'appliedElementIds', 'sourceRef durchreichen'],
})

// --------------------------------------------------- 6 · Der Rückschluss ----
const b6 = mainBand({ y: 1310, h: 205, bg: C.backlink, head: '6 · RÜCKSCHLUSS — remediationBacklink.service.ts' })
mainRow({
  y: 1382, h: 44, bg: '#ffffff', fs: 12.5,
  items: [{ label: 'Join über normId', bg: C.fixed, sw: 3 }, '$addToSet linkedElementIds', 'gates.covered neu'],
})
text({
  x: MAIN_X + 24, y: 1442, fs: 12.5, color: MUTED, lines: [
    'BRUCH 2: der Join baute `upload:${standardId}` von Hand → `upload:corpus:dsgvo`,',
    'ein Schlüssel ohne Gegenstück. Selbst mit gespeichertem Vorschlag: kein Treffer.',
  ],
})

// ------------------------------------------------------------ Kettenpfeile ----
for (const [from, to, y0, y1, label] of [
  [b1, b2, 315, 360, 'POST /remediation/generate'],
  [b2, b3, 595, 640, ''],
  [b3, b4, 835, 880, 'create()'],
  [b4, b5, 1080, 1125, 'Nutzer bestätigt'],
  [b5, b6, 1265, 1310, ''],
]) {
  arrow({ points: [[CHAIN_X, y0], [CHAIN_X, y1]], sw: 3, from, to })
  if (label) text({ x: CHAIN_X + 22, y: y0 + 8, lines: label, fs: 13, color: MUTED })
}

// ------------------------------------------- Links: Bruch 3 + SSE-Grenze ----
//
// Die Reihenfolge folgt der Kette rechts daneben: die Stille gehört zur
// FLÄCHE (Band 1), die SSE-Grenze zur ROUTE (Band 2). So bleibt jeder
// Verweispfeil kurz und kreuzt nichts.
text({ x: LEFT_X, y: 150, fs: 17, color: RED, lines: 'BRUCH 3 — die Stille' })
chip({
  x: LEFT_X, y: 184, w: LEFT_W, h: 145, bg: C.broken, fs: 12,
  label: wrap('Der Store setzte `error` die ganze Zeit (remediationStore:121). RemediateGateway las ihn nie aus — kein einziges Vorkommen. Der Copilot-Panel rendert ihn seit jeher.', 40),
})
chip({
  x: LEFT_X, y: 339, w: LEFT_W, h: 95, bg: C.fixed, fs: 12,
  label: wrap('NEU: die Fläche zeigt die Server-Meldung im Klartext — nicht „Something went wrong".', 40),
})
arrow({ points: [[LEFT_X + LEFT_W, 256], [MAIN_X - 5, 240]], color: RED, sw: 2, to: b1 })

text({ x: LEFT_X, y: 490, fs: 17, color: BLUE, lines: 'Die SSE-Grenze' })
chip({
  x: LEFT_X, y: 524, w: LEFT_W, h: 105, bg: '#ffffff', fs: 12,
  label: wrap('ÜBER flushHeaders(): echter Statuscode möglich. Hierhin gehört alles, was ohne den Strom entscheidbar ist.', 40),
})
chip({
  x: LEFT_X, y: 639, w: LEFT_W, h: 105, bg: '#ffffff', fs: 12,
  label: wrap('DARUNTER: nur noch error-Events. Der Cast-Fehler fiel hierhin — deshalb HTTP 200 auf einen Abbruch.', 40),
})
arrow({ points: [[LEFT_X + LEFT_W, 576], [MAIN_X - 5, 500]], color: BLUE, sw: 2, to: b2 })

// ------------------------------------------------ Rechts: Schlüssel-Spur ----
rect({ x: KEY_X, y: 150, w: KEY_W, h: 1365, bg: C.shell, stroke: BLUE, dashed: true })
text({ x: KEY_X + 24, y: 172, lines: 'Die Schlüssel-Spur — zwei Welten, ein Name', fs: 18, color: BLUE })
text({
  x: KEY_X + 24, y: 208, fs: 12.5, color: MUTED, lines: [
    'Upload: eine echte Standard-ObjectId in MongoDB.',
    'Korpus: ein Gesetz auf Server B, angesprochen als `corpus:<source>`.',
  ],
})

// Der erste Chip wuerde sonst in die Kopfzeile des Kastens laufen — deshalb
// eine Untergrenze, und der Pfeil darf dafuer schraeg zum Band zeigen.
const KEY_TOP = 272
for (const [target, bg, body] of [
  [b1, '#ffffff', 'Die Fläche kennt nur den Namen der Norm: `corpus:dsgvo` ODER `507f…`. Sie unterscheidet nicht — und muss es nicht.'],
  [b3, C.fixed, 'toNormWorkId(ref) (neu, in shared): trägt der Wert schon ein Präfix, bleibt er; sonst wird `upload:` davorgesetzt. Idempotent.'],
  [b4, C.persist, 'Beide Felder nebeneinander — mit Ablaufdatum. `standardId` stirbt mit dem Index-Flip in THE-390 P4 (ADR-0004 E4).'],
  [b6, C.fixed, 'ComplianceRequirement.normId trägt dieselbe Konvention. Fehlt normId am Vorschlag (Bestand), greift der alte Weg weiter — Schutzraum THE-568.'],
]) {
  const y = mid(target)
  const chipY = Math.max(y - 62, KEY_TOP)
  chip({ x: KEY_X + 24, y: chipY, w: KEY_W - 48, h: 124, bg, fs: 12.5, label: wrap(body, 46) })
  arrow({ points: [[KEY_X, chipY + 62], [MAIN_X + MAIN_W + 5, y]], color: BLUE, sw: 2, to: target })
}

// ----------------------------------------------------------------- Fazit ----
rect({ x: LEFT_X, y: 1590, w: KEY_X + KEY_W - LEFT_X, h: 165, bg: C.note, stroke: MUTED })
text({ x: LEFT_X + 24, y: 1612, lines: 'Was das Bild sagt', fs: 17 })
text({
  x: LEFT_X + 24, y: 1644, fs: 14.5, lines: [
    'Die Kette war an DREI Stellen offen, und keine davon lag dort, wo der Fehlertext hinzeigte. Zwei im Datenpfad — das Schema nahm den Korpus-Schlüssel nicht an, und der Join baute',
    'ihn falsch nach —, eine in der Wahrnehmung: die Fläche kannte den Fehler und schwieg. Der Fix ist additiv und trägt sein eigenes Ende: der kanonische Schlüssel wird überall',
    'geschrieben, das alte Feld bleibt nur für Bestandsdaten stehen, und beide verschwinden mit dem Index-Flip in P4. Was bis dahin gilt, steht als Kommentar am Feld, nicht nur im Ticket.',
  ],
})

// ------------------------------------------------------------- Ausgaben ----
writeExcalidraw(`${OUT}.excalidraw`, 'scripts/gen-remediation-naht-diagram.mjs')
writeSvg(`${OUT}.svg`)
const bad = [...overflows(), ...textCollisions()]
if (bad.length) console.warn('LAYOUT-PROBLEM:', bad)
console.log(`→ ${OUT}.excalidraw + .svg`)
