#!/bin/bash
# SessionStart — macht eine Cloud-Session pruefbereit, bevor der Agent loslegt.
#
# Ohne diesen Hook startet eine Cloud-Session ohne node_modules und ohne
# shared/dist: Gate, tsc und Tests laufen dann gar nicht oder melden
# Ladefehler, die wie inhaltliche Fehlschlaege aussehen (siehe gate.yml).
# Der Stop-Hook (stop-gate.sh) braucht genau diesen Zustand.
#
# Nur in Cloud-Sessions — lokal ist die Umgebung Sache des Entwicklers.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install statt npm ci: der Container-Zustand wird nach dem Hook gecacht,
# install nutzt ein vorhandenes node_modules weiter.
npm install --no-audit --no-fund

# shared MUSS vor server/client gebaut sein (CLAUDE.md, Build Order).
npm run build --workspace=@thearchitect/shared
