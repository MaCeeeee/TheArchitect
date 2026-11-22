/**
 * THE-781 — Parser: SCF 2026.2 + ENISA-Mapping-Tabelle v1.2 → points.json für analyse.py.
 * Entsteht NACH dem Download; justiert nur gegen Positivkontrolle 1 (47 Punkte, Recall 0,653).
 *
 * Aufruf: node parse.cjs <scf.xlsx> <enisa.xlsx> <out.json>
 */
const XLSX = require('xlsx');
const fs = require('fs');

const [, , scfPath, enisaPath, outPath] = process.argv;

const VALID = new Set([
  ...Array.from({ length: 37 }, (_, i) => `5.${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `6.${i + 1}`),
  ...Array.from({ length: 14 }, (_, i) => `7.${i + 1}`),
  ...Array.from({ length: 34 }, (_, i) => `8.${i + 1}`),
]);

const SCF_COL_ISO27002 = 61; // "ISO 27002 2022"
const SCF_COL_NIS2_ANNEX = 202; // "EMEA EU NIS2 Annex 2024" = CIR (EU) 2024/2690 Annex

function lines(v) {
  return String(v ?? '').split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
}

// ── SCF: CIR-Punkt → Vereinigung der ISO-27002-Referenzen aller dort gemappten SCF-Kontrollen
const scfWb = XLSX.readFile(scfPath, { dense: true });
const scfSheet = scfWb.SheetNames.find((s) => /^SCF 20/.test(s));
const scfRows = XLSX.utils.sheet_to_json(scfWb.Sheets[scfSheet], { header: 1, defval: '' }).slice(1);
const scf = new Map();
let scfIsoDropped = 0;
for (const r of scfRows) {
  const cirs = new Set();
  for (const ref of lines(r[SCF_COL_NIS2_ANNEX])) {
    const m = ref.match(/^(\d+)\.(\d+)/);
    if (m) cirs.add(`${+m[1]}.${+m[2]}`);
  }
  if (!cirs.size) continue;
  const iso = new Set();
  for (const ref of lines(r[SCF_COL_ISO27002])) {
    const m = ref.match(/^(\d+)\.(\d+)/);
    const k = m ? `${+m[1]}.${+m[2]}` : null;
    if (k && VALID.has(k)) iso.add(k);
    else scfIsoDropped += 1;
  }
  for (const c of cirs) {
    if (!scf.has(c)) scf.set(c, new Set());
    for (const k of iso) scf.get(c).add(k);
  }
}

// ── ENISA: nur Annex-A-Referenzen (Präfix A, auch griechisches Alpha), ISO-27001-Klauseln 4–10 fallen weg
const enWb = XLSX.readFile(enisaPath);
const enRows = XLSX.utils.sheet_to_json(enWb.Sheets['Mapping table'], { header: 1, defval: '' }).slice(2);
const enisa = new Map();
const titles = {};
for (const r of enRows) {
  const p = String(r[0]).trim();
  if (!/^\d+\.\d+$/.test(p)) continue;
  titles[p] = String(r[1]).trim();
  const iso = new Set();
  const re = /[AΑ]\s*\.?\s*([5-8])\s*\.\s*(\d{1,2})(?!\d)/g;
  let m;
  while ((m = re.exec(String(r[2])))) {
    const k = `${+m[1]}.${+m[2]}`;
    if (VALID.has(k)) iso.add(k);
  }
  enisa.set(p, iso);
}

const all = new Set([...scf.keys(), ...enisa.keys()]);
const points = [...all]
  .sort((a, b) => a.split('.').map(Number).reduce((x, v, i) => x || v - b.split('.').map(Number)[i], 0))
  .map((cir) => ({
    cir,
    title: titles[cir] ?? null,
    scf: [...(scf.get(cir) ?? [])].sort(),
    enisa: [...(enisa.get(cir) ?? [])].sort(),
  }));

const meta = {
  scfSheet,
  scfCirPoints: scf.size,
  scfCirPointsWithIso: [...scf.values()].filter((s) => s.size).length,
  enisaPoints: enisa.size,
  enisaPointsWithAnnexA: [...enisa.values()].filter((s) => s.size).length,
  scfIsoDropped,
};
fs.writeFileSync(outPath, JSON.stringify({ meta, points }, null, 2));
console.log(JSON.stringify(meta));
