#!/usr/bin/env node
// Erzeugt docs/strategy/2026-08-10-kette-vs-navigation.{excalidraw,svg}
//
// Beantwortet: Was ist „die Kette" — und warum ist sie NICHT das Menue?
//
// Inhalt gespiegelt aus: ComplianceSidebar.tsx (SECTIONS/GROUPS/SUBJECTS),
// CompliancePage.tsx, PropertyPanel.tsx:500, RequirementsForElementSection.tsx,
// requirements.routes.ts (Gate-Route), requirementGates.service.ts,
// compliance-gaps.service.ts, remediationBacklink.service.ts.
//
//   node scripts/gen-kette-vs-navigation-diagram.mjs
//
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newCanvas, wrap, MUTED, RED, GREEN } from './lib/excalidraw.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/strategy/2026-08-10-kette-vs-navigation')

// ---------------------------------------------------------------- Layout ----
const DATA_X = 60, DATA_W = 430          // links: was das Datenmodell traegt
const SPINE_X = 560, SPINE_W = 620       // Mitte: die Kette
const FACE_X = 1250, FACE_W = 700        // rechts: wo im Produkt
const CANVAS_W = 2010, CANVAS_H = 2030

const C = {
  law: '#a5d8ff', req: '#b2f2bb', gap: '#ffec99', measure: '#99e9f2',
  covered: '#d0bfff', evidence: '#ffd8a8', attest: '#ffc9c9',
  shell: '#f8f9fa', note: '#f1f3f5', ok: '#ebfbee', todo: '#fff9db',
}
const BLUE = '#1971c2'

const { text, rect, chip, arrow, writeExcalidraw, writeSvg, overflows, textCollisions } =
  newCanvas({ width: CANVAS_W, height: CANVAS_H })

// ------------------------------------------------------------- Kopfzeile ----
text({ x: DATA_X, y: 40, lines: 'Was ist „die Kette" — und warum ist sie nicht das Menü?', fs: 30 })
text({
  x: DATA_X, y: 88, fs: 15, color: MUTED, lines:
    'Stand 2026-08-10 · Die Kette ist ein DATENFLUSS über sieben Stationen. Das Menü sortiert WERKZEUGE nach drei Toren. Beide Achsen kreuzen sich — sie decken sich nicht.',
})

// ── Spaltenköpfe ──
text({ x: DATA_X, y: 140, lines: 'WAS DAS DATENMODELL TRÄGT', fs: 15, color: MUTED })
text({ x: SPINE_X, y: 140, lines: 'DIE KETTE — sieben Stationen', fs: 15, color: BLUE })
text({ x: FACE_X, y: 140, lines: 'WO IM PRODUKT (Fläche · Menüpunkt)', fs: 15, color: MUTED })

// ------------------------------------------------------------- Stationen ----
const STATIONS = [
  {
    y: 175, h: 130, bg: C.law, title: '1 · GESETZ',
    data: ['Korpus auf Server B — `corpus:<source>`', 'Sektion = Paragraph, Anker `dsgvo:art-32`'],
    face: ['Conformance → Standards → „Add to pipeline"', '(RegulationsPanel)'],
    state: 'belegt',
  },
  {
    y: 335, h: 130, bg: C.req, title: '2 · ANFORDERUNG',
    data: ['ComplianceRequirement', '{ normId, sectionEId, chain }'],
    face: ['Generator-Modal in der PROJEKT-Werkzeugleiste', '— nicht in der Conformance-Navigation'],
    state: 'belegt',
  },
  {
    y: 495, h: 130, bg: C.gap, title: '3 · LÜCKE',
    data: ['status: open | in_progress', 'summary.unlinked = offen OHNE Element'],
    face: ['Conformance → Gap Analysis'],
    state: 'belegt',
  },
  {
    y: 655, h: 130, bg: C.measure, title: '4 · MASSNAHME',
    data: ['RemediationProposal → Elemente in Neo4j', 'sourceRef { normId, sectionIds }'],
    face: ['Conformance → Remediate'],
    state: 'belegt',
  },
  {
    y: 815, h: 140, bg: C.covered, title: '5 · DECKUNG  (covered)',
    data: ['gates.covered — MASCHINELL abgeleitet', 'setBy: "system", aus linkedElementIds'],
    face: ['kein eigener Menüpunkt — entsteht beim Apply', '(remediationBacklink.service)'],
    state: 'belegt',
  },
  {
    y: 985, h: 140, bg: C.evidence, title: '6 · NACHWEIS  (evidence)',
    data: ['Evidence { requirementId, stale }', 'attested verlangt ≥1 NICHT-stale Nachweis'],
    face: ['Architektur-Ansicht → Element anklicken →', 'PropertyPanel → EvidencePanel'],
    state: 'offen',
  },
  {
    y: 1155, h: 150, bg: C.attest, title: '7 · TORE  (enforced · attested)',
    data: ['gates.enforced / .attested — NUR ein Mensch', 'POST /requirements/:id/gates, setBy aus der Session'],
    face: ['Architektur-Ansicht → Element → PropertyPanel', '→ RequirementGatesBadge'],
    state: 'offen',
  },
]

const boxes = []
for (const s of STATIONS) {
  const b = rect({ x: SPINE_X, y: s.y, w: SPINE_W, h: s.h, bg: s.bg })
  text({ x: SPINE_X + 20, y: s.y + 16, lines: s.title, fs: 17 })
  const badge = s.state === 'belegt' ? '✓ am Klick belegt (10.08.)' : '○ gebaut, nie am Klick geprüft'
  text({
    x: SPINE_X + 20, y: s.y + 46, fs: 12.5,
    color: s.state === 'belegt' ? GREEN : RED, lines: badge,
  })
  boxes.push(b)

  chip({ x: DATA_X, y: s.y + 8, w: DATA_W, h: s.h - 16, bg: '#ffffff', fs: 12, label: wrap(s.data.join(' · '), 46) })
  chip({
    x: FACE_X, y: s.y + 8, w: FACE_W, h: s.h - 16,
    bg: s.state === 'belegt' ? C.ok : C.todo, fs: 12.5, label: s.face,
  })
  arrow({ points: [[DATA_X + DATA_W, s.y + s.h / 2], [SPINE_X - 5, s.y + s.h / 2]], color: MUTED, sw: 2 })
  arrow({ points: [[FACE_X, s.y + s.h / 2], [SPINE_X + SPINE_W + 5, s.y + s.h / 2]], color: MUTED, sw: 2 })
}

// Kettenpfeile zwischen den Stationen
for (let i = 0; i < boxes.length - 1; i++) {
  const from = boxes[i], to = boxes[i + 1]
  arrow({
    points: [[SPINE_X + SPINE_W / 2, from.y + from.height], [SPINE_X + SPINE_W / 2, to.y]],
    sw: 3, from, to,
  })
}

// ── Der Schnitt: hier wechselt die Fläche ──
text({
  x: FACE_X, y: 962, fs: 13, color: RED,
  lines: '▲ ab hier verlässt die Kette die Conformance-Fläche',
})

// ------------------------------------------- Die Navigation als 2. Achse ----
const NAV_Y = 1360
rect({ x: DATA_X, y: NAV_Y, w: FACE_X + FACE_W - DATA_X, h: 340, bg: C.shell, stroke: BLUE, dashed: true })
text({ x: DATA_X + 24, y: NAV_Y + 20, lines: 'Das Menü im Screenshot — eine ANDERE Achse', fs: 19, color: BLUE })
text({
  x: DATA_X + 24, y: NAV_Y + 52, fs: 13, color: MUTED,
  lines: 'Es sortiert nach den drei Konformitäts-Toren, nicht nach Stationen. Die Verben stehen als Badge; die Namen sprechen (ComplianceSidebar.tsx:13).',
})

const NAV = [
  {
    x: DATA_X + 24, w: 600, head: 'Subjekt: YOUR MODEL   ·   Cover',
    items: 'Pipeline · Portfolio · Standards · Matrix · Remediate · Gen. Policies · Roadmap · Elements · Progress · Gap Analysis · Audit',
    note: 'Bedient Station 1, 3 und 4.',
  },
  {
    x: DATA_X + 654, w: 480, head: 'Subjekt: YOUR MODEL   ·   Enforce',
    items: 'Dashboard · Approvals · Policy Manager · Audit Trail',
    note: 'Policies gegen das Modell — keine Station der Kette.',
  },
  {
    x: DATA_X + 1164, w: 725, head: 'Subjekt: IMPORTED WORKFLOWS   ·   Attest',
    items: 'Assess Workflow · Certify',
    note: 'ANDERES SUBJEKT. Attestiert Workflows, nicht die Anforderungen deines Modells — das Attest aus Station 7 sitzt woanders.',
  },
]
for (const n of NAV) {
  rect({ x: n.x, y: NAV_Y + 92, w: n.w, h: 220, bg: '#ffffff' })
  text({ x: n.x + 16, y: NAV_Y + 108, lines: n.head, fs: 13.5 })
  text({ x: n.x + 16, y: NAV_Y + 142, fs: 12, color: MUTED, lines: wrap(n.items, Math.floor(n.w / 7.2)) })
  text({
    x: n.x + 16, y: NAV_Y + 236, fs: 12.5,
    color: n.head.includes('IMPORTED') ? RED : MUTED,
    lines: wrap(n.note, Math.floor(n.w / 7.2)),
  })
}

// ----------------------------------------------------------------- Fazit ----
rect({ x: DATA_X, y: 1740, w: FACE_X + FACE_W - DATA_X, h: 230, bg: C.note, stroke: MUTED })
text({ x: DATA_X + 24, y: 1762, lines: 'Die Antwort auf die Frage', fs: 18 })
text({
  x: DATA_X + 24, y: 1798, fs: 14.5, lines: [
    'Nein — die Kette ist nicht das Menü. Sie ist der Weg, den EINE PFLICHT durch das System nimmt: vom Gesetzestext bis zu dem Satz „dafür stehe ich gerade".',
    'Das Menü ist ein Werkzeugkasten, sortiert nach Toren. Beide sind für sich richtig; sie sind nur nicht dieselbe Sache — und an drei Stellen fällt das auf:',
    '',
    '   ·  Station 2 (Anforderungen erzeugen) sitzt in der PROJEKT-Werkzeugleiste, nicht in der Conformance-Navigation — dort, wo die Kette lebt.',
    '   ·  Station 5 (Deckung) hat gar keinen Menüpunkt. Sie entsteht als Nebenwirkung des Apply — sichtbar erst, wenn man weiß, wo man hinsieht.',
    '   ·  Station 6 und 7 liegen in der ARCHITEKTUR-Ansicht am Element (PropertyPanel), nicht unter „Attestation" — das attestiert importierte Workflows.',
  ],
})

// ------------------------------------------------------------- Ausgaben ----
writeExcalidraw(`${OUT}.excalidraw`, 'scripts/gen-kette-vs-navigation-diagram.mjs')
writeSvg(`${OUT}.svg`)
const bad = [...overflows(), ...textCollisions()]
if (bad.length) console.warn('LAYOUT-PROBLEM:', bad)
console.log(`→ ${OUT}.excalidraw + .svg`)
