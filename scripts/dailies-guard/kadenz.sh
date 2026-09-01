#!/bin/bash
# Dailies-Kadenz (THE-719 AC-3): Eintraege der letzten 7 Tage — Ziel >= 4/Woche.
set -euo pipefail
VAULT="${DAILIES_VAULT:-$HOME/Documents/Obsidian Vault/10 Daily Notes}"
COUNT=0
DAYS=""
for i in 0 1 2 3 4 5 6; do
  D=$(date -v-"${i}"d +%F)
  if [ -f "$VAULT/$D.md" ]; then COUNT=$((COUNT+1)); DAYS="$DAYS $D"; fi
done
echo "Dailies letzte 7 Tage: $COUNT (Ziel >= 4)"
[ -n "$DAYS" ] && echo "Vorhanden:$DAYS"
