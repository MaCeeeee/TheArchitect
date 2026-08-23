# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/
# Nur fuer das Tor `emptyMeasurement` (THE-653): es prueft, dass jede E2E-Spec
# mit Null-Zusicherung einen positiven Nenner traegt — dafuer muss es die
# Specs SEHEN. Ohne diese Zeile faende es null Dateien, und ein leerer Scan
# ist nach seiner eigenen Regel kein Bestehen, sondern ein Abbruch. Die Specs
# werden nicht gebaut und landen nicht im Production-Image.
COPY e2e/ e2e/

# Fuer das Navigationsgraph-Tor (THE-696): das Skript liest `packages/client/src`
# (oben schon da) und vergleicht gegen zwei mitgelieferte Daten — die Baseline und
# den Mission-Graph. Fehlt der Mission-Graph, ueberspringt das Skript den Mission-
# Teil stillschweigend: dann waeren genau die Kennzahlen unbewacht, wegen derer das
# Tor existiert. Bewusst einzelne Dateien statt `scripts/` und `docs/` — der Rest
# gehoert nicht in den Build-Kontext. Landet nicht im Production-Image.
COPY scripts/nav-graph.mjs scripts/
COPY docs/strategy/nav-graph-baseline.json docs/strategy/mission-graph.json docs/strategy/

# Build shared (force to ignore any stale tsbuildinfo), copy to node_modules, then server + client
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run --workspace=packages/shared build \
    && rm -rf node_modules/@thearchitect/shared \
    && mkdir -p node_modules/@thearchitect/shared \
    && cp packages/shared/package.json node_modules/@thearchitect/shared/ \
    && cp -r packages/shared/dist node_modules/@thearchitect/shared/ \
    && cp -r packages/shared/src node_modules/@thearchitect/shared/ \
    && cd packages/server && npx tsc --noCheck \
    && cd /app/packages/client && npx vite build

# ── DIE FREIGABE-TORE ────────────────────────────────────────────────────────
#
# Der einzige Ort, an dem ein Tor unumgehbar ist: ohne gruenen Lauf entsteht
# kein Image, und ohne Image gibt es kein Deploy. GitHub Actions faellt als
# Ort aus (Konto gesperrt, letzte Laeufe 2026-05-22, beide rot) — ein Workflow
# dort waere ein Waechter, der nicht wacht.
#
# Bewusst NUR die mechanischen Tor-Suiten (jest.gate.config.ts): kein Modell,
# kein Netz, keine Datenbank. Gemessen ~14 s hier im Container (ts-jest kompiliert
# kalt); lokal mit warmem Cache unter 1 s. Der volle Lauf hat 60 DB-Suiten und
# vorbestehende Worker-Flakes (THE-435) — ein Tor, dessen Rot man routinemaessig
# wegdrueckt, ist keins.
#
# Eigene Schicht, damit der Fehlschlag im Build-Log fuer sich steht.
# Was die Tore pruefen: docs/evals/reqtrace-release-gates.md
RUN cd /app/packages/server && npm run gate

# ── TOR: NAVIGATIONSGRAPH (THE-696, Waechter-Zeile aus THE-663) ──────────────
#
# Zuletzt, weil es das billigste Tor ist (~0,2 s, kein Compile, kein Netz) und
# ein Fehlschlag hier eine Aussage ueber die BEDIENUNG macht, nicht ueber Code:
# eine Flaeche ohne Weiterweg ist entstanden, ein Inhalt springt aus der Welt,
# oder ein Schritt der Nutzer-Aufgabenkette hat seinen Ort verloren.
#
# Bewacht werden nur QUALITAETS-Kennzahlen (ungerader Grad, Sackgassen,
# Weltwechsel, Schnitt-Treue, Mission-Abgleich). Groesse — Knoten, Kanten,
# zyklomatische Komplexitaet — waechst mit jedem Feature und wird nur angezeigt.
# Ein Tor, das jede neue Flaeche bestraft, wird weggedrueckt und ist dann keins.
#
# Rot und die Aenderung war gewollt? `npm run nav:graph -- --write-baseline`,
# Baseline committen, Begruendung in die Commit-Nachricht. Das Skript sagt es
# im Fehlerfall selbst.
RUN node scripts/nav-graph.mjs --baseline docs/strategy/nav-graph-baseline.json

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
