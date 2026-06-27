/**
 * liftCompliance (.2 / REQ-WFCOMP-001.2, THE-353) — Semantik-Hebung.
 *
 * Vom strukturellen (sanitisierten) Workflow zum GDPR-Compliance-Graphen (in-memory).
 * Nur deterministisch aus der Struktur Ableitbares, provenance:'import' (= machine-extracted):
 *   - Personenbezogenes data_object (wenn PII-Keys vorhanden)
 *   - business_role{Recipient} aus externen Ziel-Domains (+ thirdCountry-Kandidat)
 *   - application_component (Storage) aus DB-/File-Nodes
 *
 * NICHT hier: Zweck, Verantwortlicher, Betroffenenkategorie, TOM-Adäquanz (→ Attestierung/LLM).
 */
import { v4 as uuid } from 'uuid';
import type { SanitizedWorkflow, LiftedGraph, LiftedElement, LiftedEdge } from './types';
import { isPiiKey } from './scope';

// EU/EWR-ccTLDs (+ .eu). Grobe, ehrliche Kandidaten-Heuristik — Mensch bestätigt.
const EU_TLDS = new Set([
  'de', 'eu', 'fr', 'nl', 'be', 'at', 'it', 'es', 'pl', 'se', 'dk', 'fi', 'ie',
  'pt', 'cz', 'gr', 'hu', 'ro', 'sk', 'si', 'lt', 'lv', 'ee', 'lu', 'hr', 'bg',
  'cy', 'mt', 'is', 'li', 'no',
]);

export function isEuDomain(domain: string): boolean {
  const tld = domain.split('.').pop() || '';
  return EU_TLDS.has(tld.toLowerCase());
}

const STORAGE_RE = /postgres|mongo|mysql|mariadb|redis|sqlite|mssql|oracle|supabase|airtable|dynamodb|\bs3\b/i;
const RECIPIENT_RE = /httpRequest|http|slack|gmail|sheets|notion|discord|telegram|teams|jira|asana|trello|hubspot|salesforce|stripe|twilio|sendgrid|mailchimp/i;

export function liftCompliance(wf: SanitizedWorkflow): LiftedGraph {
  const elements: LiftedElement[] = [];
  const edges: LiftedEdge[] = [];
  const add = (type: string, name: string, attrs: Record<string, unknown>): string => {
    const id = `lift-${uuid().slice(0, 8)}`;
    elements.push({ id, type, name, attrs, provenance: 'import' });
    return id;
  };

  const processId = add('process', wf.name || 'Processing Activity', { gdprScope: true });

  const hasPII = wf.nodes.some((n) => n.paramKeys.some(isPiiKey));
  let dataObjectId: string | null = null;
  if (hasPII) {
    dataObjectId = add('data_object', 'Personal Data', { personal: true });
    edges.push({ from: processId, to: dataObjectId, rel: 'access' });
  }

  for (const node of wf.nodes) {
    // Empfänger (lit. d/e): externe Domain auf einem Push-Out-Node
    if (RECIPIENT_RE.test(node.type) && node.targetDomains.length > 0) {
      for (const domain of node.targetDomains) {
        const rid = add('business_role', node.name, {
          role: 'Recipient',
          domain,
          thirdCountry: !isEuDomain(domain),
        });
        edges.push({ from: processId, to: rid, rel: 'flow' });
      }
    }
    // Storage (lit. g, Existenz): DB-/File-Node → application_component
    if (STORAGE_RE.test(node.type) && dataObjectId) {
      const acId = add('application_component', node.name, { storage: true });
      edges.push({ from: dataObjectId, to: acId, rel: 'access' });
    }
  }

  return { elements, edges };
}
