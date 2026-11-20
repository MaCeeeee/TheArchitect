#!/usr/bin/env node
/**
 * UC-METH-001 — seeds the Landkarte 7.7 loop check into an existing, empty project:
 * three contexts (TE, Produktion, Logistik) with members and the translations ×1, ×10, ×12.
 * Translations sit on association relationships (valid between two groupings in the UI too).
 * Afterwards it runs the negative checks that the mocked route tests cannot prove.
 *
 *   API=http://localhost:4000/api TOKEN=<access token> PROJECT_ID=<id> \
 *     node packages/server/scripts/uc-meth-001/seed-loop-demo.mjs [--shared-member] [--consistent]
 *
 *   --shared-member    one member shared by all three contexts (triple overlap → local defect)
 *   --consistent       TE → Logistik ×10 instead of ×12 (the loop closes → exact)
 *   FOREIGN_PROJECT_ID another project of the same user: its id must not open this project's relationships
 */
const API = process.env.API ?? 'http://localhost:4000/api';
const { TOKEN, PROJECT_ID, FOREIGN_PROJECT_ID } = process.env;
if (!TOKEN || !PROJECT_ID) {
  console.error('TOKEN and PROJECT_ID are required');
  process.exit(1);
}
const sharedMember = process.argv.includes('--shared-member');
const consistent = process.argv.includes('--consistent');

async function request(method, projectId, path, body) {
  const res = await fetch(`${API}/projects/${projectId}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data ?? json };
}

async function call(method, path, body) {
  const { status, data } = await request(method, PROJECT_ID, path, body);
  if (status < 200 || status >= 300) throw new Error(`${method} ${path} → ${status} ${JSON.stringify(data)}`);
  return data;
}

const element = (name, type, x) =>
  call('POST', '/elements', {
    name, type, layer: 'business', togafDomain: 'business', description: 'UC-METH-001 loop demo',
    position3D: { x, y: 0, z: type === 'grouping' ? 0 : 3 },
  }).then((created) => created.id ?? created._id);

const connect = (sourceId, targetId, type, label) =>
  call('POST', '/connections', { sourceId, targetId, type, label }).then((created) => created.id);

const te = await element('TE', 'grouping', -6);
const prod = await element('Produktion', 'grouping', 0);
const log = await element('Logistik', 'grouping', 6);

let membershipId;
if (sharedMember) {
  const material = await element('Material', 'business_object', 0);
  for (const context of [te, prod, log]) membershipId = await connect(context, material, 'composition', 'contains');
} else {
  const members = [[te, 'Stückliste', -6], [prod, 'Fertigungsauftrag', 0], [log, 'Lieferung', 6]];
  for (const [context, name, x] of members) {
    membershipId = await connect(context, await element(name, 'business_object', x), 'composition', 'contains');
  }
}

const translations = [
  [te, prod, 1, 'TE → Produktion'],
  [prod, log, 10, 'Produktion → Logistik'],
  [te, log, consistent ? 10 : 12, 'TE → Logistik'],
];
let translationId;
for (const [from, to, factor, label] of translations) {
  translationId = await connect(from, to, 'association', label);
  await call('PUT', `/advisor/translations/${translationId}`, { factor, quantity: 'pieces' });
  console.log(`${label}: ×${factor}`);
}

const ladder = await call('GET', '/advisor/ladder');
console.log(`highest rung: ${ladder.highestRung}`);
for (const result of ladder.cohomology) {
  console.log(`${result.quantity}: ${result.verdict} — loop defects ${result.loopDefects.length}, face defects ${result.faceDefects.length}, dim H1 ${result.h1Dimension}`);
  if (result.canonicalScale) {
    console.log(`canonical scale: ${result.canonicalScale.map((s) => `${s.contextName} ×${Number(s.factor.toPrecision(7))}`).join(' · ')}`);
  }
}

// ── negative checks against the real database ──
const expect404 = async (label, projectId, connectionId) => {
  const { status } = await request('PUT', projectId, `/advisor/translations/${connectionId}`, { factor: 2 });
  console.log(`${status === 404 ? 'ok  ' : 'FAIL'} ${label} → ${status} (expected 404)`);
  if (status !== 404) process.exitCode = 1;
};
await expect404('translation on a membership relationship', PROJECT_ID, membershipId);
if (FOREIGN_PROJECT_ID) {
  await expect404('relationship of this project addressed through another project', FOREIGN_PROJECT_ID, translationId);
}
const after = await call('GET', '/advisor/ladder');
const unchanged = JSON.stringify(after.cohomology) === JSON.stringify(ladder.cohomology);
console.log(`${unchanged ? 'ok  ' : 'FAIL'} ladder unchanged after the refused writes`);
if (!unchanged) process.exitCode = 1;
