#!/bin/bash
# Stop-Gate — kein „fertig" ohne gruenen Pruefer.
#
# Terminal-RSI (arXiv 2610.22192) zaehlt strikten Erfolg nur, wenn der
# vollstaendige, geschuetzte Pruefer gruen ist — nie auf Selbstauskunft des
# Agenten. Dort meldeten 748 Fehlschlaege „fertig" innerhalb von zehn Zuegen.
# Dieser Hook ist das Gegenstueck: Will der Agent die Runde beenden und hat er
# Code unter packages/ geaendert, laufen Typpruefung, Tore und Navigations-
# graph. Rot blockiert das Beenden und gibt dem Agenten die Fehlermeldung.
#
# Loop-Budget wie im Pre-Flight (Default 3): Nach drei blockierten Versuchen
# am selben Stand gibt der Hook frei und meldet die Eskalation sichtbar —
# kein stiller vierter Versuch, keine Endlosschleife.
#
# Cache: Ein gruener Lauf wird per Tree-Hash des Arbeitsstands gemerkt; ein
# unveraenderter Stand wird nicht erneut geprueft.
#
# Bewusst abschalten (z. B. fuer exploratives Arbeiten lokal): in
# .claude/settings.local.json  "env": { "CLAUDE_STOP_GATE": "off" }  setzen.
# Die Datei ist durch protect-verifiers.mjs geschuetzt — abschalten ist eine
# Entscheidung des Menschen, nicht des Agenten.
set -uo pipefail

[ "${CLAUDE_STOP_GATE:-on}" = "off" ] && exit 0

LOOP_BUDGET=3

INPUT="$(cat)"
json_field() {
  printf '%s' "$INPUT" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const v = JSON.parse(s)[process.argv[1]]; process.stdout.write(v === undefined ? "" : String(v)); }
      catch { process.stdout.write(""); }
    });' "$1"
}
SESSION_ID="$(json_field session_id)"

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
GIT_DIR="$(git rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
STATE_DIR="$GIT_DIR/claude-stop-gate"
mkdir -p "$STATE_DIR"

# ── Was hat sich geaendert? Commits seit der Abzweigung + Arbeitsstand. ──
BASE="$(git merge-base HEAD origin/master 2>/dev/null || git rev-parse HEAD)"
CHANGED="$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u )"
PKGS="$(printf '%s\n' "$CHANGED" | sed -nE 's#^packages/(shared|server|client)/.*#\1#p' | sort -u)"
[ -z "$PKGS" ] && exit 0

if [ ! -d node_modules ]; then
  printf '{"systemMessage":"Stop-Gate übersprungen: node_modules fehlt (npm install). Änderungen unter packages/ sind ungeprüft."}\n'
  exit 0
fi

# ── Fingerprint des kompletten Arbeitsstands (inkl. untracked, ohne ignored). ──
TMP_INDEX="$(mktemp)"
cp "$GIT_DIR/index" "$TMP_INDEX" 2>/dev/null || true
TREE="$(GIT_INDEX_FILE="$TMP_INDEX" git add -A >/dev/null 2>&1 && GIT_INDEX_FILE="$TMP_INDEX" git write-tree 2>/dev/null)"
rm -f "$TMP_INDEX"
[ -n "$TREE" ] && [ -f "$STATE_DIR/green-$TREE" ] && exit 0

# ── Pruefer fahren. ──
FAILED=""
FAIL_OUT=""
run() {
  local label="$1"; shift
  local log; log="$(mktemp)"
  if ! "$@" >"$log" 2>&1; then
    FAILED="$FAILED $label"
    # Nur die Ausgabe roter Pruefer zurueckgeben, ohne Stacktrace-Rauschen.
    FAIL_OUT="$FAIL_OUT
### $label
$(grep -v '^[[:space:]]*at ' "$log" | tail -n 40)"
  fi
  rm -f "$log"
}

if printf '%s\n' "$PKGS" | grep -qx shared; then
  run "shared:build" npm run build --workspace=@thearchitect/shared
fi
for p in server client; do
  if printf '%s\n' "$PKGS" | grep -qx "$p" || printf '%s\n' "$PKGS" | grep -qx shared; then
    run "$p:tsc" npx --no-install tsc --noEmit -p "packages/$p"
  fi
done
run "gate" npm run gate
run "nav:check" npm run nav:check

if [ -z "$FAILED" ]; then
  [ -n "$TREE" ] && touch "$STATE_DIR/green-$TREE"
  rm -f "$STATE_DIR/blocks-$SESSION_ID"
  exit 0
fi

# ── Rot: blockieren — innerhalb des Loop-Budgets. ──
COUNT_FILE="$STATE_DIR/blocks-$SESSION_ID"
COUNT=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$COUNT" >"$COUNT_FILE"

if [ "$COUNT" -gt "$LOOP_BUDGET" ]; then
  rm -f "$COUNT_FILE"
  MSG="Stop-Gate: Loop-Budget ($LOOP_BUDGET) erschöpft, Prüfer weiterhin rot:$FAILED. Eskalation an den Menschen — die Änderung ist NICHT fertig."
  node -e 'process.stdout.write(JSON.stringify({ systemMessage: process.argv[1] }))' "$MSG"
  exit 0
fi

REASON="Stop-Gate rot ($COUNT/$LOOP_BUDGET):$FAILED.
Die Änderung ist nicht fertig, solange ein Prüfer rot ist. Ursache beheben — Tore,
Baselines und Golden Sets NICHT aufweichen (dafür braucht es eine menschliche Freigabe).
Wenn du nach $LOOP_BUDGET Versuchen nicht weiterkommst: stoppen und Befund vorlegen
(was probiert, was gelernt, welche Hypothesen bleiben).

--- Ausgabe der roten Prüfer (gekürzt) ---$FAIL_OUT"
node -e 'process.stdout.write(JSON.stringify({ decision: "block", reason: process.argv[1] }))' "$REASON"
exit 0
