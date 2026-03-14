# CLAUDE.md — TheArchitect

## Project Overview

**TheArchitect** is an Enterprise Architecture Management Platform with 3D visualization, TOGAF 10 compliance, governance workflows, AI copilot, and a template marketplace.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Three.js/React Three Fiber (3D), Zustand (state), Tailwind CSS, Vite
- **Backend:** Express.js + TypeScript, Passport.js (auth), Socket.IO (realtime)
- **Databases:** MongoDB (documents), Neo4j (graph/dependencies), Redis (sessions/cache), MinIO (file storage)
- **Shared:** TypeScript monorepo with Turbo, `@thearchitect/shared` package for types/constants
- **Deployment:** Docker multi-stage build on Hostinger VPS (76.13.150.49), deployed via Hostinger Docker API

## Project Structure

```
packages/
  shared/     — Types, constants, shared interfaces (builds first)
  server/     — Express API, models, routes, middleware, WebSocket
  client/     — React SPA with 3D architecture visualization
```

## Key Commands

```bash
npm run dev          # Start all packages in dev mode (Turbo)
npm run build        # Build all packages
npm run lint         # Lint all packages
npm run test         # Run tests
```

## Build Order (critical)

Shared must build before server/client. In Docker, we build sequentially:
```
shared -> server -> client
```
Do NOT use `npx turbo run build` in Docker without ensuring shared/dist exists first.

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
- `HOSTINGER_API_KEY` — VPS deployment API

## Deployment

- **Production URL:** http://76.13.150.49
- **VPS:** Hostinger KVM 2, Ubuntu 24.04 with Docker, VM ID 1344643
- **Deploy:** `rsync` source to VPS, then `docker compose up -d --build`
- **GitHub Actions:** Configured but blocked (account flagged), workflow at `.github/workflows/deploy.yml`
- **Docker Compose:** at `/docker/thearchitect/docker-compose.yml` on VPS

## Installed Skills (200+)

Skills are in `.agents/skills/` and include:
- **Document generation:** pdf, pptx, docx, xlsx (for TOGAF reports)
- **UI polish:** audit, critique, polish, animate, optimize, harden (Impeccable)
- **React patterns:** vercel-react-best-practices, web-design-guidelines, composition patterns
- **Architecture:** architecture-patterns, api-design-principles, cqrs-implementation
- **Backend:** nodejs-backend-patterns, auth-implementation-patterns, database-migration
- **Security:** security-audit-automation, attack-tree-construction, binary-analysis-patterns
- **Testing:** webapp-testing, verification-before-completion, debugging-strategies
- **DevOps:** deployment-automation, monitoring-observability, cost-optimization
- **Workflow:** brainstorming, writing-plans, executing-plans, systematic-debugging

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- Functional React components with hooks
- No class components
- Prefer named exports for components, default exports for pages/routes
- Error messages in English, UI labels in English (i18n planned)
- Dark theme by default, colors from the established palette
