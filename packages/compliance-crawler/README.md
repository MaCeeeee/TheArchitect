# @thearchitect/compliance-crawler

Industrial Compliance Mapping (ICM) Crawler — Server B Stack.

## What it does

1. Fetches regulation paragraphs from public sources (EUR-Lex, gesetze-im-internet.de)
2. Parses them into structured `Regulation` documents
3. Writes them to **Server A's MongoDB** via Tailscale (private network)
4. Calls the embedding sidecar (Server B local) to vectorize each paragraph
5. Upserts vectors into the project-scoped Qdrant collection

## Linear

* Parent Feature: [THE-272 UC-ICM-001](https://linear.app/thearchitect/issue/THE-272)
* This package implements: [THE-276 REQ-ICM-001.2](https://linear.app/thearchitect/issue/THE-276) + [THE-277 REQ-ICM-001.3](https://linear.app/thearchitect/issue/THE-277)

## Endpoints

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/health` | – | Health check + DB connection status |
| POST | `/crawl` | `{ projectId, sources: ['nis2'\|'lksg'\|...] }` | Run crawl + embed for given sources |
| POST | `/embed-all` | `{ projectId }` | Re-embed all regulations in a project (backfill) |

## Local Development

```bash
# Install (from monorepo root)
npm install

# Build shared first
npm run build --workspace=@thearchitect/shared

# Run in dev mode
cd packages/compliance-crawler
cp .env.example .env  # fill MONGODB_URI etc.
npm run dev
```

## Tests

```bash
cd packages/compliance-crawler
npx jest
```

## Deployment (Coolify on Server B)

1. Coolify Project: `thearchitect compliance` (already created)
2. Add Resource → Dockerfile (point to `packages/compliance-crawler/Dockerfile`)
3. Build context: monorepo root
4. Set environment variables (see `.env.example`)
5. Internal port: 3100, expose internally only (no public domain — only Tailnet access from Server A)

## Sources Implemented

| Source | Status | Paragraphs | Module |
|---|---|---|---|
| EUR-Lex NIS2 (CELEX:32022L2555) | 🚧 D2 | Art. 20–24 | `src/sources/eur-lex.ts` |
| gesetze-im-internet LkSG | 📅 D3 | §§ 3–9 | `src/sources/gesetze-im-internet.ts` |
| gesetze-im-internet DSGVO/BDSG | 📅 D3 | Art. 32 + Begleitung | `src/sources/gesetze-im-internet.ts` |
