/**
 * Security-Audit H2 — Wächter für die ganze Fehlerklasse.
 *
 * `requireProjectAccess` prüft nur `:projectId`. Lädt ein Handler danach ein
 * projektgebundenes Dokument per `findById*(<id aus dem Request>)`, ist die
 * Mandantentrennung weg. Projektgebundene Modelle werden deshalb in Routen
 * und Services per `findOne*({ _id, projectId })` geladen. `findById*` bleibt
 * nur für Ids aus einem bereits mandantengeprüft geladenen Dokument
 * (`doc._id`, `run.id`) oder für die unten begründeten Stellen.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

// Begründete Ausnahmen: "<datei>|<argument>"
const ALLOWED = new Set([
  // reqId stammt aus Evidence einer mandantengebundenen Abfrage, kein Request-Wert.
  'services/regulationDrift.service.ts|reqId',
  // interne Id aus einem bereits geladenen Requirement.
  'services/remediationBacklink.service.ts|requirementId',
  // prüft std.projectId unmittelbar nach dem Laden.
  'services/norm.service.ts|standardId',
]);

function projectScopedModels(): string[] {
  const dir = path.join(SRC, 'models');
  const names: string[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts')) continue;
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!/^\s+projectId: \{/m.test(text)) continue;
    for (const m of text.matchAll(/export const (\w+)\s*=\s*mongoose\.model/g)) names.push(m[1]);
  }
  return names;
}

function sources(): string[] {
  const out: string[] = [];
  for (const sub of ['routes', 'services']) {
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.ts')) out.push(full);
      }
    };
    walk(path.join(SRC, sub));
  }
  return out;
}

describe('findById auf projektgebundenen Modellen (Security-Audit H2)', () => {
  it('finds the project-scoped models — sonst prüft der Wächter nichts', () => {
    const models = projectScopedModels();
    for (const m of ['Policy', 'Standard', 'StandardMapping', 'TransformationRoadmap', 'SimulationRun', 'OracleAssessment']) {
      expect(models).toContain(m);
    }
  });

  it('no route or service loads a project-scoped document by a bare id', () => {
    const models = projectScopedModels();
    const call = new RegExp(`\\b(${models.join('|')})\\.(findById|findByIdAndUpdate|findByIdAndDelete)\\(\\s*([^,)]+?)\\s*[,)]`, 'g');
    const offenders: string[] = [];
    for (const file of sources()) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(call)) {
        const arg = m[3].trim();
        if (/^[a-z]\w*\.(_id|id)$/.test(arg)) continue; // Id eines bereits geladenen Dokuments
        if (ALLOWED.has(`${rel}|${arg}`)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line} ${m[1]}.${m[2]}(${arg})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
