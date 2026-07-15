#!/usr/bin/env bash
#
# deploy-vps.sh — The ONE safe way to deploy TheArchitect to the Hostinger VPS.
#
# Runs ON the VPS, inside /docker/thearchitect. It turns the 6-command golden
# path (learned the hard way in the 2026-07-14 deploy incident) into a single,
# guarded, idempotent command so no hand-slip can pick the wrong compose file,
# clobber prod-local infra, or claim success on a degraded app.
#
#   Usage (on VPS):    ./deploy-vps.sh <git-commit-ish>
#   Usage (from Mac):  ssh root@76.13.150.49 'bash -s' -- <git-commit-ish> < scripts/deploy-vps.sh
#
# Why each guard exists is documented in the deploy-to-hostinger skill and in
# the memory note deployment_correct_process_2026_07_14.
#
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
COMMIT="${1:?Usage: deploy-vps.sh <git-commit-ish>}"
DEPLOY_DIR="/docker/thearchitect"
COMPOSE="docker-compose.prod.yml"            # the ONLY correct compose file
HEALTH_URL="https://thearchitect.site/api/health"
CORPUS_URL="https://thearchitect.site/api/regulations/corpus/health"

# Source paths that are safe to overwrite from git. Infra files
# (docker-compose.prod.yml, Caddyfile, .env) are deliberately NOT listed —
# they are prod-local and divergent from the repo.
SOURCE_PATHS=(packages package.json package-lock.json Dockerfile turbo.json tsconfig.base.json)

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$DEPLOY_DIR" 2>/dev/null || die "cannot cd into $DEPLOY_DIR — run this on the VPS"

# ── 0. Defuse the landmine ───────────────────────────────────────────────────
# A bare `docker compose up` picks docker-compose.yml — the toxic June file
# (binds Mongo to the tailnet IP, collides with mongo-tailnet-bridge). Rename it
# so it can never be the default target again. Idempotent: skipped after first run.
if [[ -f docker-compose.yml ]]; then
  log "Defusing landmine: docker-compose.yml → docker-compose.yml.DANGER-do-not-use"
  mv docker-compose.yml docker-compose.yml.DANGER-do-not-use
fi
[[ -f "$COMPOSE" ]] || die "$COMPOSE is missing — this is the only correct compose file"

# ── 1. Back up prod-local infra ──────────────────────────────────────────────
# These files are intentionally different from the repo version. Snapshot them
# BEFORE the checkout so step 4 can prove the checkout didn't touch them.
log "Backing up infra files (.SAFE snapshots)"
cp -f "$COMPOSE" "$COMPOSE.SAFE"
cp -f Caddyfile Caddyfile.SAFE

# ── 2. Rollback point ────────────────────────────────────────────────────────
# Tag whatever is live right now so rollback is a one-liner.
if docker image inspect thearchitect-app:latest >/dev/null 2>&1; then
  log "Tagging current live image as :rollback"
  docker tag thearchitect-app:latest thearchitect-app:rollback
else
  warn "No thearchitect-app:latest image found — skipping rollback tag (first deploy?)"
fi

# ── 3. Path-selective source checkout ────────────────────────────────────────
# The deploy dir is a DIRTY, DIVERGENT git tree. NEVER `git reset --hard` or
# `git checkout <commit>` (whole tree) — that would reset the prod-local infra
# files. Only the source paths get updated from the target commit.
log "Fetching origin + checking out source at $COMMIT (source paths only)"
git fetch origin
git checkout "$COMMIT" -- "${SOURCE_PATHS[@]}"

# ── 4. Infra-untouched guard ─────────────────────────────────────────────────
# Prod infra must be byte-identical to the pre-checkout backup. If not, the
# checkout reached a file it shouldn't have — abort before building.
log "Verifying infra files were NOT modified by the checkout"
diff -q "$COMPOSE" "$COMPOSE.SAFE" >/dev/null \
  || die "$COMPOSE changed during checkout! Restore: cp $COMPOSE.SAFE $COMPOSE — then investigate."
diff -q Caddyfile Caddyfile.SAFE >/dev/null \
  || die "Caddyfile changed during checkout! Restore: cp Caddyfile.SAFE Caddyfile — then investigate."

# ── 5. Build + recreate ONLY the app ─────────────────────────────────────────
# DBs stay up → no Neo4j boot-race, no stale-network EAI_AGAIN. -f is hardcoded
# so the toxic compose file can never be selected.
log "Building + recreating app only (DBs stay up)"
docker compose -f "$COMPOSE" up -d --build app

# ── 6. Smoke test with real exit codes ───────────────────────────────────────
log "Smoke testing $HEALTH_URL (up to ~60s for the app to settle)"
health=""
ok=0
for i in $(seq 1 12); do
  sleep 5
  health="$(curl -fsS --max-time 8 "$HEALTH_URL" 2>/dev/null || true)"
  if grep -q '"status":"ok"' <<<"$health"; then ok=1; break; fi
  printf '  … attempt %s/12 (not ok yet)\n' "$i"
done
[[ "$ok" == 1 ]] || die "Health never returned status:ok. App may be degraded.
  Inspect:  docker compose -f $COMPOSE logs --tail=80 app
  Rollback: docker tag thearchitect-app:rollback thearchitect-app:latest && docker compose -f $COMPOSE up -d --force-recreate app"

log "Health OK"
echo "$health"

# Corpus health is informative, not fatal (see law_onboarding done-definition).
corpus="$(curl -fsS --max-time 8 "$CORPUS_URL" 2>/dev/null || true)"
if grep -q '"ok":true' <<<"$corpus"; then
  echo "corpus: $corpus"
else
  warn "corpus health not ok (non-fatal): ${corpus:-<no response>}"
fi

log "✔ Deploy OK — commit $COMMIT is live."
echo "  Rollback (if needed later):"
echo "    docker tag thearchitect-app:rollback thearchitect-app:latest && docker compose -f $COMPOSE up -d --force-recreate app"
