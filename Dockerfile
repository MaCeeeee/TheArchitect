# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

RUN npx turbo run build

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/server/package.json packages/server/

RUN npm ci --omit=dev --workspace=packages/server --workspace=packages/shared

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/client/dist packages/client/dist

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
