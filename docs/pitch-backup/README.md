# Pitch Backup Assets — 23.04.2026

Lokale Fallback-Assets für den Pitch. **Werden nicht committet** (Binaries zu groß, `.gitignore` deckt `*.mp4`/`*.png` in diesem Ordner ab). Nur dieser Index ist versioniert, damit im Pitch-Moment klar ist, welches Asset welche Situation abdeckt.

## Aufnahme-Regeln

- **Auflösung**: 1920×1080 (FullHD, Beamer-Standard)
- **Browser**: Frischer Chrome, Sprache DE, Zoom 100%, keine Extensions
- **Recording**: macOS Screen Recording (Cmd+Shift+5) oder Loom, MP4
- **Screenshots**: macOS Cmd+Shift+4, PNG, volle Retina-Auflösung
- **Daten**: Gegen lokale Demo-Instanz mit geladenem `demo-seed.ts` (Cloud Migration Wave 1)

## Asset-Matrix

| # | Asset | Länge / Format | Einsatz-Akt | Trigger (wann einblenden) | Storyline beim Einblenden |
|---|-------|----------------|-------------|---------------------------|----------------------------|
| 1 | `blueprint-ai-generation.mp4` | ~90s / MP4 | Akt 3 | Live-Call >90s, kein Streaming sichtbar | *"Damit wir keine Zeit verlieren, hier ein Durchlauf vom Vortag — identisches Prompt, identisches Ergebnis."* |
| 2 | `copilot-review.mp4` | ~45s / MP4 | Akt 3 | Copilot-Response hängt oder Error-Toast | *"Der Copilot läuft gegen unsere OpenAI-Quota — hier die Antwort aus der Morgen-Session, 1:1 reproduzierbar."* |
| 3 | `oracle-verdict.png` | 1920×1080 / PNG | Akt 5 | `oracle/assess` hängt oder `503` | *"Das Oracle-Verdict zum Production-Cutover-Pattern — hier ein Screenshot, live läuft die Assess-API gerade gegen den Neo4j-Cluster."* |
| 4 | `pdf-report-preview.png` | 1920×1080 / PNG (2 Seiten) | Akt 6 | PDF-Export >10s | *"Der PDF-Export erzeugt eine 14-Seiten-Executive-Summary — Seite 1 und 2 sehen Sie hier, Generation läuft im Hintergrund."* |
| 5 | `monte-carlo-distribution.png` | 1920×1080 / PNG | Akt 5 | Chart-Animation hakt oder Worker-Timeout | *"Hier die Kostenverteilung aus 100 Monte-Carlo-Iterationen — P50 bei €2,4M, P90 bei €3,1M."* |
| 6 | `compliance-matrix-full.png` | 1920×1080 / PNG | Akt 4 | Matrix rendert >3s oder zeigt leere Zellen | *"Die Compliance-Matrix post-Remediation — 94% Coverage auf ISO 27001 + DORA, 6 offene Gaps mit Owner."* |

## Reihenfolge der Aufnahme

Empfohlene Aufnahme-Reihenfolge im Zeitslot (5.2, 1.5h):

1. **Statische PNGs zuerst** (je 2-3 min): Oracle, PDF, Monte Carlo, Compliance — einfach, weil nur richtiger App-State + Screenshot.
2. **Kurzes Copilot-MP4** (5-10 min inkl. Re-Takes): Copilot öffnen, Query eintippen, Antwort abwarten, aufnehmen.
3. **Langes Blueprint-MP4 zuletzt** (20-30 min): Questionnaire-Flow → AI-Generation → Import. Mehrere Durchläufe einplanen.

## Abspiel-Setup am Pitch-Tag

- Alle Assets in diesem Ordner auf lokalem MacBook
- **QuickTime Player offen**, MP4s bereits geladen (Play per Leertaste, Esc schließt)
- **Preview.app** für PNGs, Vollbild-Modus aktiv
- Cmd+Tab-Reihenfolge: Chrome (Demo) → QuickTime → Preview
- Bei Einsatz: Stage-Direction im Script steht in eckigen Klammern, z.B. `[Falls Blueprint-Call >90s: Cmd+Tab auf QuickTime, blueprint-ai-generation.mp4 per Leertaste]`

## Fallback-Kette pro Akt

Wenn das Live-Feature *und* das Backup-Asset versagen:

| Akt | Live versagt → Backup versagt → Letzte Linie |
|-----|-----------------------------------------------|
| 3 (Blueprint) | Live-Call → `blueprint-ai-generation.mp4` → Questionnaire-Screenshot als Slide + Verbalisierung |
| 3 (Copilot) | Live-Query → `copilot-review.mp4` → *"Der Copilot ist heute offline — Text-Antwort aus dem Log"* + Dokument-Verweis |
| 5 (Oracle) | Live-Assess → `oracle-verdict.png` → Roadmap-Screenshot ohne Oracle-Tab, Narrativ bleibt |
| 5 (Monte Carlo) | Live-Worker → `monte-carlo-distribution.png` → *"Distribution läuft 4 Sekunden, Sie sehen das Ergebnis im PDF"* |
| 6 (PDF) | Live-Export → `pdf-report-preview.png` → *"Der Report liegt als Briefing-Deck bei mir vor — Sie bekommen ihn im Nachgang"* |

## Checkliste vor Pitch

- [ ] Alle 6 Assets existieren und spielen ab
- [ ] QuickTime Player öffnet MP4 per Doppelklick ohne Format-Warnung
- [ ] Preview.app zeigt PNGs in Retina-Schärfe
- [ ] Cmd+Tab-Reihenfolge vor Pitch einmal durchgespielt (muss ohne Nachdenken klappen)
- [ ] Asset-Einsatz-Trigger im Script markiert (Stage-Direction-Kommentar)
- [ ] Backup-MacBook / USB-Stick mit Assets gespiegelt

## Nicht committet

```
*.mp4
*.png
*.mov
*.heic
```

Der übergeordnete `.gitignore` oder ein lokaler `pitch-backup/.gitignore` schließt diese Dateitypen aus. Bei Bedarf siehe [pitch-sprint-tag5-progress.md](../pitch-sprint-tag5-progress.md) für die Gitignore-Einträge.
