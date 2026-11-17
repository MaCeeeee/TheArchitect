/**
 * Connector duplicate cleanup — planning only, no I/O (THE-739 / REQ-THE739-2).
 *
 * Before THE-739 every connector sync CREATEd a fresh node, so one external item
 * appears once per sync run. A group is (projectId, source, connectorConfigId,
 * name, type); nodes from before UC-PROV-002 carry no connector tag and join a
 * group only via their connector-unique id prefix (gh-, gl-, jira-).
 *
 * Safety: a group is skipped — never merged — when its members look like distinct
 * items rather than repeated syncs (two members from the same batch, or two
 * different externalIds).
 */

export interface DedupeNode {
  id: string;
  projectId: string;
  name: string;
  type: string;
  source: string | null;
  connectorConfigId: string | null;
  externalId: string | null;
  createdAt: string | null;
  certifiedBy: string | null;
}

export interface DedupeGroup {
  key: string;
  keep: DedupeNode;
  remove: DedupeNode[];
}

export interface DedupePlan {
  groups: DedupeGroup[];
  skipped: Array<{ key: string; reason: string; ids: string[] }>;
}

/** Id prefixes only one connector uses — `elem-` is shared with file imports, so it is not here. */
export const LEGACY_ID_PREFIX: Record<string, string> = { github: 'gh-', gitlab: 'gl-', jira: 'jira-' };

const groupKey = (n: { projectId: string; name: string; type: string }, source: string, cfg: string) =>
  [n.projectId, source, cfg, n.name, n.type].join(' | ');

/** Connector-tagged first (keeps provenance), then certified (a notary's work survives), then has externalId, then oldest. */
function rank(a: DedupeNode, b: DedupeNode): number {
  const tagged = Number(b.connectorConfigId != null) - Number(a.connectorConfigId != null);
  if (tagged) return tagged;
  const cert = Number(b.certifiedBy != null) - Number(a.certifiedBy != null);
  if (cert) return cert;
  const ext = Number(b.externalId != null) - Number(a.externalId != null);
  if (ext) return ext;
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
}

export function planConnectorDedupe(nodes: DedupeNode[]): DedupePlan {
  const groups = new Map<string, DedupeNode[]>();

  for (const n of nodes) {
    if (n.source == null || n.connectorConfigId == null) continue;
    const key = groupKey(n, n.source, n.connectorConfigId);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  // Untagged legacy nodes join a tagged group of the same project/name/type by prefix.
  for (const n of nodes) {
    if (n.connectorConfigId != null) continue;
    if (n.source != null && n.source !== 'upload') continue;
    const matches = [...groups.entries()].filter(([, members]) => {
      const m = members[0];
      const prefix = LEGACY_ID_PREFIX[m.source ?? ''];
      return prefix != null && n.id.startsWith(prefix)
        && m.projectId === n.projectId && m.name === n.name && m.type === n.type;
    });
    if (matches.length === 1) matches[0][1].push(n);
  }

  const plan: DedupePlan = { groups: [], skipped: [] };
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const ids = members.map((m) => m.id);

    const batches = members.map((m) => m.createdAt ?? '');
    if (new Set(batches).size !== batches.length) {
      plan.skipped.push({ key, reason: 'members share a createdAt (same sync batch → distinct items)', ids });
      continue;
    }
    const externalIds = new Set(members.map((m) => m.externalId).filter((x) => x != null));
    if (externalIds.size > 1) {
      plan.skipped.push({ key, reason: 'members carry different externalIds (distinct items)', ids });
      continue;
    }

    const [keep, ...remove] = [...members].sort(rank);
    plan.groups.push({ key, keep, remove });
  }
  return plan;
}
