# RVTM — THE-514 HyDE→Prod (REQ-LAW-002.7)

**Plan:** docs/superpowers/plans/2026-07-19-the-514-hyde-prod.md
**Linear:** THE-514 · Parent THE-459 (UC-LAW-002) · Score 80,0
**Datum:** 2026-07-19 · **Commit-Basis:** 671b119

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

| REQ | Anforderung | Plan-Task | Verifikationsmethode | Status |
|---|---|---|---|---|
| **AC-1** | Geteilter `hydeRewrite`-Helper (`HYDE_INSTRUCTION` wortgleich, Haiku, 1 User-Turn, 400 tok), eine Prompt-Quelle | Task 1, Task 2 | Unit: Trim + empty-throw; grep-Beleg `HYDE_INSTRUCTION` nur in `hyde.service.ts` | ⬜ |
| **AC-2** | Flag-gegateter Einschub `LAW_DISCOVERY_HYDE` (dark) in `discoverCandidates`, Replace-Semantik | Task 3 | Unit: Flag an → `governedCorpusSearch` mit HyDE-Text; Flag aus → `profile.text` | ⬜ |
| **AC-3** | Graceful Fallback: keyless/kein Provider/`hydeRewrite`-Fehler → Baseline-Text, Discovery bricht nie | Task 3 | Unit: keyless → Baseline; `hydeRewrite` wirft → Baseline (kein Throw nach außen) | ⬜ |
| **AC-4** | Modell = `defaultJudgeModel()` (Haiku), eigener `HYDE_MAX_TOKENS=400` (nicht 2048) | Task 1 | Unit: Default-Modell + max_tokens im Client-Call | ⬜ |
| **AC-5** | Eval-Precompute prompt-/verhaltensgleich nach Refactor (Golden-Vektoren reproduzierbar) | Task 2 | TSC + (falls vorhanden) Build-Script-Test; Prompt-String-Diff = 0 | ⬜ |
| **AC-6** | Prod-Recall gemessen (HyDE an vs. aus) VOR Default-on | Task 4 | Dokumentierte AC: Discovery-Eval/Prod-Vergleich, Runbook | ⬜ |
| **AC-7** | Env dokumentiert (`LAW_DISCOVERY_HYDE`) | Task 4 | `.env.example`-Eintrag | ⬜ |
| **Non-Reg** | Baseline-Pfad byte-gleich ohne Flag; keine neuen roten Suiten; TSC grün | Task 4 | Full-Suite server + `build` shared/server; Final-Review | ⬜ |

## Ausgegrenzt (additiv später)
- HyDE default-on (bleibt dunkel bis AC-6 grün) · `provisionKind`/Korpus-Seite → THE-421 · HyDE-Caching · Hybrid baseline∪HyDE (Tuning).

## Provenance
- Pre-Flight-Scan @ 671b119 (HyDE script-privat, Einhängepunkt `discoverCandidates` L78-79, Embed-Reuse via `governedCorpusSearch`).
- Eval-Evidenz +56pp: docs/superpowers/2026-07-18-uc-law-002-discovery-eval-baseline.md (THE-465).
- Prod-Beweis Vokabular-Graben: THE-423 fed-vs-cited (CRA Enforcement statt Scope), 2026-07-19.
