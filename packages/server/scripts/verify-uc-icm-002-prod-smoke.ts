/**
 * UC-ICM-002 D5 — Production Smoke-Test
 *
 * Verifiziert dass das UC-ICM-002 Deploy auf thearchitect.site live ist.
 *
 * Was wir prüfen können OHNE Auth:
 *  - thearchitect.site antwortet (DNS + Traefik + App)
 *  - /api/health 200 (App lebt)
 *  - /api/regulations/crawler/health 401 (W1 endpoint, auth-gated)
 *  - /api/projects/X/compliance/mappings/auto 401 (W2 endpoint, auth-gated → existiert)
 *  - /api/projects/X/compliance/mappings/preview 401 (W2 endpoint, auth-gated → existiert)
 *
 * Was wir NICHT prüfen können ohne Production-User-JWT:
 *  - Tatsächliches Mapping-Funktion
 *  - Mongo + Neo4j Integration in Production
 *  - 16 Regulations × BSH-Architecture E2E
 *
 * Run: cd packages/server && npx tsx scripts/verify-uc-icm-002-prod-smoke.ts
 */

const BASE = process.env.SMOKE_BASE || 'https://thearchitect.site';
const FAKE_PROJECT_ID = '507f1f77bcf86cd799439011';

interface Probe {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  expectStatus: number;
  // Optional: actual response body check for unauthenticated routes
  bodyMatch?: RegExp;
}

const PROBES: Probe[] = [
  // Health endpoint — public (no auth)
  { name: 'app health', method: 'GET', path: '/api/health', expectStatus: 200 },

  // W1 endpoint (already deployed before today) — must still work
  {
    name: 'W1 regulations crawler-health (auth-gated)',
    method: 'GET',
    path: '/api/regulations/crawler/health',
    expectStatus: 401,
    bodyMatch: /Authentication required|Unauthorized/,
  },

  // W2 endpoints (deployed today) — must respond with auth-gate (not 404)
  {
    name: 'W2 compliance/mappings/auto (POST, auth-gated)',
    method: 'POST',
    path: `/api/projects/${FAKE_PROJECT_ID}/compliance/mappings/auto`,
    expectStatus: 401,
  },
  {
    name: 'W2 compliance/mappings/preview (POST, auth-gated)',
    method: 'POST',
    path: `/api/projects/${FAKE_PROJECT_ID}/compliance/mappings/preview`,
    expectStatus: 401,
  },
  {
    name: 'W2 compliance/mappings/by-element (GET, auth-gated)',
    method: 'GET',
    path: `/api/projects/${FAKE_PROJECT_ID}/compliance/mappings/by-element/cap-1`,
    expectStatus: 401,
  },
  {
    name: 'W2 compliance/mappings/by-regulation (GET, auth-gated)',
    method: 'GET',
    path: `/api/projects/${FAKE_PROJECT_ID}/compliance/mappings/by-regulation/${FAKE_PROJECT_ID}`,
    expectStatus: 401,
  },
  {
    name: 'W2 compliance/mappings/confirm (POST, auth-gated)',
    method: 'POST',
    path: `/api/projects/${FAKE_PROJECT_ID}/compliance/mappings/confirm`,
    expectStatus: 401,
  },
];

async function runProbe(p: Probe): Promise<{ ok: boolean; status: number; detail: string }> {
  try {
    const res = await fetch(`${BASE}${p.path}`, {
      method: p.method,
      headers: { 'Content-Type': 'application/json' },
      body: p.method === 'POST' ? JSON.stringify({}) : undefined,
    });
    const status = res.status;
    let body = '';
    try { body = await res.text(); } catch { /* no body */ }

    const statusOk = status === p.expectStatus;
    const bodyOk = !p.bodyMatch || p.bodyMatch.test(body);
    const ok = statusOk && bodyOk;
    return {
      ok,
      status,
      detail: ok
        ? `HTTP ${status} ✓`
        : `HTTP ${status} (expected ${p.expectStatus})${p.bodyMatch ? ` | body=${body.slice(0, 100)}` : ''}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: `network error: ${(err as Error).message}`,
    };
  }
}

async function main() {
  console.log(`▶ UC-ICM-002 Production Smoke @ ${BASE}\n`);

  let passed = 0;
  for (const probe of PROBES) {
    process.stdout.write(`  • ${probe.name.padEnd(60)} `);
    const r = await runProbe(probe);
    console.log(`${r.ok ? '✅' : '❌'} ${r.detail}`);
    if (r.ok) passed++;
  }

  console.log('\n' + '━'.repeat(72));
  console.log(`Result: ${passed}/${PROBES.length} smoke probes passed`);
  console.log('━'.repeat(72));

  if (passed === PROBES.length) {
    console.log('\n⚠️  Probes alle 401 — Auth-Gate steht VOR der Route-Resolution.');
    console.log('   Das bedeutet: wir können NICHT zwischen "Endpoint existiert" und "Endpoint fehlt"');
    console.log('   unterscheiden. Diese Smoke beweist NICHT, dass UC-ICM-002 deployed ist!');
    console.log('\nUm Deploy-Erfolg zu bestätigen, brauchen wir:');
    console.log('  - Production-User-JWT (Login)');
    console.log('  - dann z.B.: GET /api/projects/<real-id>/compliance/mappings/by-element/foo');
    console.log('    → 200 mit data:[] = endpoint existiert');
    console.log('    → 404 = endpoint fehlt → deploy hat UC-ICM-002 nicht ausgerollt');
  } else {
    console.log('\n❌ One or more probes FAIL — investigate before declaring deploy successful.');
  }
  process.exit(passed === PROBES.length ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
