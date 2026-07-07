# Test-Guide: Unified Norm — manueller Abnahme-Test (THE-390, nach P4/P5)

**Wann:** am Ende von THE-390 (nach Client-Umbau P4), vor/mit dem Prod-Deploy (P5).
**Wo:** lokal (Dev, Mac) zuerst; danach identisch auf thearchitect.site.
**DoD (aus THE-390):** Eine gecrawlte Regulation läuft end-to-end durch die volle Pipeline; ein hochgeladener Standard bekommt umgekehrt Requirements + Gap-Analyse.

## Vorbereitung

- [ ] Backend + Client laufen (`npm run dev`); Korpus erreichbar (`CORPUS_MONGODB_URI` gesetzt, Server B via Tailnet) — sonst App-DB-Fallback-Seed
- [ ] Testprojekt mit ~10 Architektur-Elementen (z. B. BSH-Demo-Kopie); User mit Architect-Rolle
- [ ] Browser-Konsole + Server-Log offen (Fallback-Telemetrie `[regulationResolver]` beobachten)

## Strecke A — Regulation durch die Pipeline (der Kern-Durchstich)

1. [ ] **Norm-Liste:** Norm-Manager öffnen → Upload-Standards **und** Korpus-Gesetze (z. B. DSGVO, NIS2) erscheinen in EINER Liste, Quelle erkennbar (upload/corpus), Section-Zahl plausibel
2. [ ] **Add to pipeline:** Korpus-Norm (z. B. `corpus:dsgvo`) zur Pipeline hinzufügen → Pipeline-Karte erscheint, Stage `uploaded`, Stats 0
3. [ ] **Map:** AI-Match/Mapping über die Norm laufen lassen → Mappings entstehen (`auto`), Stats: partial > 0, Stage springt auf `mapped`
4. [ ] **Bestätigen:** 1–2 Mappings menschlich bestätigen → compliant zählt hoch (Asilomar: auto ≠ grün)
5. [ ] **Requirements (P3):** „Generate requirements" auf der Korpus-Norm → Requirements mit Quell-Paragraph, Priorität, Begründung
6. [ ] **Gap-Analyse (P3):** Gap-View zeigt offene Requirements pro Norm/Element — LIVE berechnet (THE-389: kein Cache)
7. [ ] **Remediate:** aus einem Gap einen Remediation-Vorschlag erzeugen → Kontext zitiert den richtigen Paragraphen-Text
8. [ ] **Portfolio:** Overview zeigt die Korpus-Norm mit Name/Typ (`legislation`), Coverage %, Maturity — und **überlebt Reloads** (kein Orphan-Delete)

## Strecke B — Standard bekommt die Regulation-Fähigkeiten (P3)

1. [ ] PDF-Standard hochladen (ISO-Beispiel) → erscheint als Norm (upload)
2. [ ] Requirements-Generierung auf dem Standard → Requirements pro Section
3. [ ] Gap-Analyse zeigt den Standard neben den Gesetzen

## Strecke C — Nichts Altes bricht (Regression)

1. [ ] Bestehender BSH-Demo-Flow: Standard → Map → Policies → Roadmap unverändert bedienbar
2. [ ] ICM-Flows: Heat-Map, Reverse-Lookup (PropertyPanel Compliance-Tab), Live-Mapping („Paste & See") funktionieren
3. [ ] WFCOMP Assess-Workflow unverändert (Art.-30-Verdikt, `needs_attestation` nie auto-grün)
4. [ ] VERLOCK: Drift-Flag erscheint weiter bei Korpus-Versionswechsel (Re-Crawl simulieren oder Fixture)

## Strecke D — Migration/Prod (P4/P5, auf Server A)

1. [ ] Migrations-Skript dry-run: erwartete Zähler (60 Mappings, 19 legacy Regs — Stand 2026-07-05); `--apply`; Re-Run = 0 Änderungen (idempotent)
2. [ ] Integritäts-Check: 0 Mappings ohne Norm-Referenz, 0 verwaiste; BSH-Demo-Mappings (53+) vollständig
3. [ ] Fallback-Telemetrie beobachten (`corpusUnconfigured`/`corpusMiss`): nach Cutover-Beobachtungszeitraum 0 → dann `CORPUS_STRICT_READS=true` setzen und Strecke A/C wiederholen
4. [ ] Rollback-Probe dokumentiert (Restore-Pfad benannt, bevor `--apply` läuft)

## Abbruchkriterien (sofort stoppen + Befund notieren)

- Stats/Coverage weichen zwischen Upload-Welt vor/nach Umbau ab (Regression in `computeNormMappingStats`)
- Ein Korpus-Pipeline-State verschwindet nach Portfolio-Reload (Orphan-Cleanup-Regression)
- Ein `auto`-Mapping wird irgendwo als „compliant/grün" ohne menschliche Bestätigung gezeigt (Asilomar #16)

Referenzen: THE-390 (DoD, Phasen) · ADR-0004 · PR #36 (P1) · PR #37 (P2) · `docs/superpowers/plans/2026-07-05-the390-p1-model-facade.md`
