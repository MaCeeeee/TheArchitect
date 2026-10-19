# CLAUDE.md — TheArchitect

## Project Overview

**TheArchitect** is an Enterprise Architecture Management Platform with 3D visualization, TOGAF 10 compliance, governance workflows, AI copilot, and a template marketplace.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Three.js/React Three Fiber (3D), Zustand (state), Tailwind CSS, Vite
- **Backend:** Express.js + TypeScript, Passport.js (auth), Socket.IO (realtime)
- **Databases:** MongoDB (documents), Neo4j (graph/dependencies), Redis (sessions/cache), MinIO (file storage)
- **Shared:** TypeScript monorepo with Turbo, `@thearchitect/shared` package for types/constants
- **Deployment:** Docker multi-stage build on Hostinger VPS (76.13.150.49), deployed by hand via `scripts/deploy-vps.sh` (see Deployment)

## Project Structure

```
packages/
  shared/     — Types, constants, shared interfaces (builds first)
  server/     — Express API, models, routes, middleware, WebSocket
  client/     — React SPA with 3D architecture visualization
  compliance-crawler/ — Regulation crawler (EUR-Lex, gesetze-im-internet), runs on Server B
services/
  embedding-sidecar/  — Python embedding service
```

## Key Commands

```bash
npm run dev          # Start all packages in dev mode (Turbo)
npm run build        # Build all packages
npm run lint         # Lint all packages
npm run gate         # Release gates: mechanical suites only (~5 s) — the reliable signal
npm run nav:check    # Navigation graph against its baseline (~0.5 s)
npm run test         # Full suite: ~240 suites, ~60 need a DB, some pre-existing flakes (THE-435)
npm run e2e          # Playwright end-to-end
```

Typecheck a package: `npx tsc --noEmit -p packages/<shared|server|client>`.

## Build Order (critical)

Shared must build before server/client. In Docker, we build sequentially:
```
shared -> server -> client
```
Do NOT use `npx turbo run build` in Docker without ensuring shared/dist exists first.

## Definition of Done & Verification

A change is done when the protected verifier is green — never on the agent's own claim, never on a subset of checks.

- **The effective gate is the Docker build:** the `Dockerfile` runs `npm run gate`; no green gate, no image, no deploy. GitHub Actions (`.github/workflows/gate.yml`) does not run today (account blocked) — do not rely on it.
- **Gate suites** are listed explicitly in `packages/server/jest.gate.config.ts`. A suite belongs there only if it is mechanical (no model, network, DB) and cannot flake. Docs: `docs/evals/reqtrace-release-gates.md`.
- **Architecture fitness** (`architectureFitness` gate suite) enforces three rules of this file as a ratchet against `architectureFitness.baseline.json`: every endpoint authenticated unless listed as public, no client/shared imports from server, audit entries on writes in auth/settings/admin routers.
- **Hooks** (`.claude/settings.json`, scripts in `.claude/hooks/`):
  - `SessionStart` — cloud sessions only: `npm install` + build shared.
  - `Stop` — if `packages/` changed: tsc for touched packages, `npm run gate`, `npm run nav:check`. Red blocks finishing; after 3 blocked attempts it escalates instead of looping (Pre-Flight loop budget). Opt-out for exploratory local work: `"env": { "CLAUDE_STOP_GATE": "off" }` in `.claude/settings.local.json` — a human decision.
  - `PreToolUse` — edits to verifiers (gate suites, gate config, baselines, golden sets, hooks) require explicit human approval.
- **Never weaken a verifier to get green** (loosen a gate, extend a baseline, edit a golden set). If the verifier itself is wrong, say so and let the human decide.
- **Process:** `docs/skills/pre-flight/SKILL.md` is mandatory before planning or building a UC/REQ/bugfix. Build loop from approval to done: `docs/strategy/2026-08-09-bau-loop.svg`.

## Architecture Conventions

- **Routes:** `/api/<domain>` (e.g., `/api/settings`, `/api/projects`, `/api/admin`)
- **Auth:** JWT access + refresh tokens, MFA via TOTP, OAuth (Google/GitHub/Microsoft)
- **Middleware:** `authenticate` for protected routes, `createAuditEntry` for audit logging
- **Models:** Mongoose schemas in `server/src/models/`
- **State:** Zustand stores in `client/src/stores/`, one per domain
- **API client:** Axios instance in `client/src/services/api.ts` with token refresh interceptor
- **Styling:** Tailwind utility classes, dark theme (`bg-[#0f172a]`, `border-[#334155]`, accent `#7c3aed`)
- **UI components:** `client/src/components/<domain>/` (settings, security, governance, etc.)

## Important Patterns

- User preferences (theme, language, timezone, notifications, accessibility) stored in `User.preferences` (MongoDB)
- API keys: SHA-256 hashed, `ta_` prefix, raw key shown only once on creation
- Billing: role-based plan mapping (chief_architect=enterprise, viewer=free)
- Sessions: stored in Redis with key pattern `session:{userId}:{sessionId}`
- Password changes require current password verification
- OAuth unlinking prevents removing last auth method
- All security-sensitive actions create audit entries with IP and user-agent

## Environment Variables

See `.env.example` for all required variables. Key ones:
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — token signing
- `MONGODB_URI` — MongoDB connection string
- `NEO4J_URI` / `NEO4J_PASSWORD` — Neo4j graph database
- `REDIS_HOST` / `REDIS_PASSWORD` — Redis for sessions
- `HOSTINGER_API_KEY` — Hostinger API (no longer used for deploys)

## Deployment

- **Production URL:** https://thearchitect.site (Caddy reverse proxy, Let's Encrypt — see `Caddyfile`)
- **VPS:** Hostinger KVM 2 (76.13.150.49), Ubuntu 24.04 with Docker, VM ID 1344643
- **Deploy (the only way):** `scripts/deploy-vps.sh <commit>` on the VPS, e.g. from the Mac: `ssh root@76.13.150.49 'bash -s' -- <commit> < scripts/deploy-vps.sh`. It guards against the known pitfalls (wrong compose file, .env overwrite, degraded health).
- **Docker Compose:** `/docker/thearchitect/docker-compose.prod.yml` on the VPS — the only correct compose file
- **GitHub Actions:** blocked (account flagged). `.github/workflows/deploy.yml` only builds and pushes an image, it does not deploy (auto-deploy is THE-479).

## Skills

- **In Git (source of truth for project skills):** `docs/skills/` — `pre-flight`, `the-architect-core`, `the-architect-modeler`, `togaf-vision-architect`, `arxiv-radar`, plus scheduled heartbeats (`backlog-heartbeat` is paused).
- **Local only (not in Git):** `.claude/skills/` symlinks into `.agents/skills/` on the maintainer's machine. After the skill audit (`docs/skill-audit-2026-07-06.md`) about 74 are active; the rest stay archived in `.agents/skills/`.
- **Cloud sessions** have neither `.claude/skills/` nor `.agents/skills/`. Read the skill file directly when a process calls for it — above all `docs/skills/pre-flight/SKILL.md`.

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- Functional React components with hooks
- No class components
- Prefer named exports for components, default exports for pages/routes
- Error messages in English, UI labels in English (i18n planned)
- Dark theme by default, colors from the established palette
