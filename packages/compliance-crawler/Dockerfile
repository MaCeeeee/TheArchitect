# ─── Stage 1: Build (monorepo workspaces) ──────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy root manifests for workspace resolution
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/compliance-crawler/package.json ./packages/compliance-crawler/

# Install only the deps for shared + compliance-crawler workspaces
RUN npm ci --workspace=@thearchitect/shared --workspace=@thearchitect/compliance-crawler --include-workspace-root=false

# Build shared first, then crawler
COPY packages/shared ./packages/shared
RUN npm run build --workspace=@thearchitect/shared

COPY packages/compliance-crawler ./packages/compliance-crawler
RUN npm run build --workspace=@thearchitect/compliance-crawler

# ─── Stage 2: Runtime ──────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100

# Copy only what's needed for runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/compliance-crawler/dist ./packages/compliance-crawler/dist
COPY --from=builder /app/packages/compliance-crawler/package.json ./packages/compliance-crawler/

USER node
EXPOSE 3100
WORKDIR /app/packages/compliance-crawler

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js"]
