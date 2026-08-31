#!/bin/bash
# Dailies-Guard (THE-719): prueft am Vault, ob das heutige Daily existiert,
# und meldet NUR bei Fehlen — Zustellung als macOS-Notification auf dem Geraet,
# an dem gearbeitet wird (nicht n8n-Cloud: die sieht das lokale Dateisystem nicht).
#
# Testbar: DAILY_DATE=JJJJ-MM-TT ueberspringt den Wochentags-Check und prueft dieses Datum.
set -euo pipefail

VAULT="${DAILIES_VAULT:-$HOME/Documents/Obsidian Vault/10 Daily Notes}"
STATE_DIR="$HOME/.local/state/dailies-guard"
mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/guard.log"

if [ -n "${DAILY_DATE:-}" ]; then
  TODAY="$DAILY_DATE"
else
  # Nur werktags melden — am Wochenende ist ein fehlendes Daily kein Befund.
  WD=$(date +%u)
  if [ "$WD" -gt 5 ]; then
    echo "$(date '+%F %T') skip weekend" >> "$LOG"
    exit 0
  fi
  TODAY=$(date +%F)
fi

FILE="$VAULT/$TODAY.md"

if [ -f "$FILE" ]; then
  echo "$(date '+%F %T') ok $TODAY" >> "$LOG"
  echo "ok: Daily $TODAY existiert"
  exit 0
fi

echo "$(date '+%F %T') MISSING $TODAY" >> "$LOG"
echo "missing: Daily $TODAY fehlt — Notification wird zugestellt"
osascript -e "display notification \"Kein Daily für $TODAY. Rubriken: Feature & Fähigkeit · Learnings heute.\" with title \"Daily fehlt\" sound name \"Ping\"" || true
exit 0
