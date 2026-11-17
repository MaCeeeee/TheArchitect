#!/usr/bin/env bash
# THE-597 Slice 3 — die 5 vorregistrierten Live-Läufe (docs/evals/the597-slice3-vorregistrierung.md).
# Holt nur FEHLENDE Läufe nach; ein vorhandener Lauf wird nie überschrieben (keine stille Auswahl).
# Run: cd packages/server && bash scripts/the597-slice3-runs.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=../../docs/evals/the597-slice3
mkdir -p "$OUT"
run() { # $1 = gv3|gv2, $2 = Laufnummer
  local g=$1 i=$2 dst="$OUT/$1-run$2"
  if [ -f "$dst.json" ]; then echo "[slice3] $g-run$i liegt vor — übersprungen"; return; fi
  rm -f "src/evals/reports/typing-$g-sc5.json" "src/evals/reports/typing-$g-sc5.md"
  npm run typing:eval -- --golden "src/evals/golden/typing.$g.json" --samples 5
  cp "src/evals/reports/typing-$g-sc5.md" "$dst.md"
  cp "src/evals/reports/typing-$g-sc5.json" "$dst.json"   # json zuletzt: es markiert den Lauf als fertig
  echo "[slice3] $g-run$i fertig"
}
for i in 3 4 5; do run gv3 "$i"; done
for i in 1 2; do run gv2 "$i"; done
