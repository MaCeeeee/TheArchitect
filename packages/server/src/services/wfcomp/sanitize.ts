/**
 * sanitizeN8nWorkflow (.0 / REQ-WFCOMP-001.0, THE-358) — Privacy-by-Design-Adaptergrenze.
 *
 * Liest rohes n8n-Workflow-JSON, gibt struktur-only zurück:
 *   - VERWIRFT: pinData (ganz), credentials, Parameter-WERTE.
 *   - BEHÄLT:   Node-Typ/Name/Topologie, Parameter-/Feld-SCHLÜSSEL, Ziel-HOSTNAMES.
 *
 * Datenminimierung (Art. 5 Abs. 1 lit. c) + Privacy by Design (Art. 25): The Architect
 * darf sich nicht selbst zum Auftragsverarbeiter (Art. 28) machen.
 */
import type { SanitizedWorkflow, SanitizedNode, SanitizedEdge } from './types';

interface RawNode {
  name?: string;
  type?: string;
  parameters?: unknown;
}

/** Hostnames aus URL-artigen String-Werten — nur Host, kein Pfad/Query (AC-4). */
function extractDomains(parameters: unknown): string[] {
  if (parameters == null) return [];
  const domains = new Set<string>();
  // Regex über die serialisierten Parameter; wir behalten NUR den Hostname.
  const json = JSON.stringify(parameters);
  const re = /https?:\/\/([a-z0-9.-]+)(?::\d+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    const host = m[1].toLowerCase().replace(/\.$/, '');
    if (host.includes('.')) domains.add(host);
  }
  return [...domains];
}

/**
 * Parameter-SCHLÜSSEL (nie Werte). Flach + Set/Edit-Feldnamen
 * (`parameters.values.<kind>[].name` sind die Feld-Keys wie 'email'/'iban').
 */
function extractParamKeys(parameters: unknown): string[] {
  if (parameters == null || typeof parameters !== 'object') return [];
  const keys = new Set<string>();
  const p = parameters as Record<string, unknown>;

  for (const k of Object.keys(p)) keys.add(k);

  // Set/Edit-Fields-Node: parameters.values.{string|number|boolean|...}[] = [{ name, value }]
  const values = p.values;
  if (values && typeof values === 'object') {
    for (const arr of Object.values(values as Record<string, unknown>)) {
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
            keys.add((entry as { name: string }).name);
          }
        }
      }
    }
  }
  // n8n v2 "assignments" shape: parameters.assignments.assignments[] = [{ name, value, type }]
  const assignments = (p.assignments as { assignments?: unknown })?.assignments;
  if (Array.isArray(assignments)) {
    for (const entry of assignments) {
      if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
        keys.add((entry as { name: string }).name);
      }
    }
  }
  // 'values'/'assignments' selbst sind strukturelle Container, keine Feld-Keys → entfernen.
  keys.delete('values');
  keys.delete('assignments');
  return [...keys];
}

/** Trigger = Eintritts-/Collection-Punkt. Webhook/Form heißen nicht „trigger", sind es aber. */
function isTriggerType(type: string | undefined): boolean {
  return !!type && /trigger|webhook|formtrigger/i.test(type);
}

export function sanitizeN8nWorkflow(input: string | object): SanitizedWorkflow {
  const raw = (typeof input === 'string' ? JSON.parse(input) : input) as {
    name?: string;
    nodes?: RawNode[];
    connections?: Record<string, Record<string, Array<Array<{ node: string }>>>>;
    // pinData / credentials werden BEWUSST nicht gelesen.
  };

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes: SanitizedNode[] = rawNodes.map((n) => ({
    name: typeof n.name === 'string' ? n.name : '',
    type: typeof n.type === 'string' ? n.type : '',
    paramKeys: extractParamKeys(n.parameters),
    targetDomains: extractDomains(n.parameters),
  }));

  const typeByName = new Map(nodes.map((n) => [n.name, n.type]));

  const edges: SanitizedEdge[] = [];
  if (raw.connections && typeof raw.connections === 'object') {
    for (const [sourceName, outputs] of Object.entries(raw.connections)) {
      if (!outputs || typeof outputs !== 'object') continue;
      for (const groups of Object.values(outputs)) {
        if (!Array.isArray(groups)) continue;
        for (const targets of groups) {
          if (!Array.isArray(targets)) continue;
          for (const t of targets) {
            if (!t || typeof t.node !== 'string') continue;
            edges.push({
              from: sourceName,
              to: t.node,
              kind: isTriggerType(typeByName.get(sourceName)) ? 'trigger' : 'flow',
            });
          }
        }
      }
    }
  }

  return { name: typeof raw.name === 'string' ? raw.name : '', nodes, edges };
}
