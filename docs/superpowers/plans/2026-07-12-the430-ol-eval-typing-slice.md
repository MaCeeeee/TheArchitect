# Plan — THE-430 Slice 1 (Typing-Eval) + THE-431 (C_score) als Prereq

**Datum:** 2026-07-12
**Parent:** [THE-421](https://linear.app/thearchitect/issue/THE-421) UC-ONTO-001
**Diese REQs:** [THE-431](https://linear.app/thearchitect/issue/THE-431) (C_score), [THE-430](https://linear.app/thearchitect/issue/THE-430) (OL-Eval-Suite, **Slice 1 = Typing**)
**Pre-Flight:** 2026-07-12 (dieser Session) — Codebase-Scan + Komplexitätsbewertung durchgeführt.

## Scope-Entscheidungen (User bestätigt 2026-07-12)

1. **Slicing:** Typing zuerst. Relations-Eval = späterer Slice 2 (höchste UU, DE-Rechtstext-RE unbelegt).
2. **C_score:** THE-431 wird **vorgezogen** (liefert die Stratifizierungs-Achse für AC-2/AC-3).
3. **Labeling:** LLM-vorlabeln (self-golden-Muster) → Mensch adjudiziert → frozen. Leakage wird im Report dokumentiert.

## Zu schützende Bestandsteile (additiv, nicht brechen)

| Datei | REQ | Regel |
|---|---|---|
| `packages/server/src/evals/goldenSet.ts` | THE-379 | Mapping-Schema unangetastet; Typing-Golden bekommt **eigenes** Schema (`typingGolden.ts`) |
| `packages/server/src/evals/metrics.ts` | THE-380 | Nur **neue** exportierte Funktionen anhängen (ECE, FP/FN-Bias, leakage-split); bestehende Signaturen fix |
| `packages/server/src/scripts/build-self-golden.ts` | THE-379 | Kopiervorlage, nicht editieren — neues `build-typing-golden.ts` |
| `packages/shared/src/ontology/norm-ontology.v1.ts` | THE-429 | Additiv: `obligationKinds`-Zeile + semver-Bump + CHANGELOG |

## Phasen (harte Gates)

### Phase 0 — THE-431 C_score (kein LLM, rein deterministisch)
- `packages/server/src/norms/complexityScore.ts`: C_score über Norm-Baum (`{regulationKey|workId, versionHash}`).
- Metrik-Familien (Graph/Coverage/Hierarchie/Breite/Dataset) → `log(1+x)` → gewichtete Aggregation (0.30/0.25/0.10/0.20/0.15) → Sigmoid (a=0.4, b=6.0) → [0,1] + 5 Interpretations-Bänder (benannte Konfig-Konstanten).
- Datengrundlage: @eId-Hierarchie aus dem Korpus (ADR-0004 E2) — **erst verifizieren, welche Query/Model den Norm-Baum liefert** (Unknown → Repo-Scan vor Code).
- **AC:** deterministisch+idempotent (Property-Test), Bänder dokumentiert, kein LLM/Python.
- **Gate:** `npm test` grün + ein realer Korpus-Norm bekommt einen plausiblen Band.

### Phase 1 — Metrik-Lücken in `metrics.ts` (rein, additiv)
- `expectedCalibrationError(outcomes, bins)` — echtes ECE (heute nur `precisionByConfidenceBand`).
- `fpFnBias(outcomes)` — Ausweis, ob das Modell FP- oder FN-lastig kippt.
- `leakageAwareSplit(cases, key)` — strukturelle Überlappungen train/test vermeiden (Paper §3.2), deterministisch (mulberry32-Reuse).
- **AC:** Unit-Tests je Funktion; bestehende Metrik-Tests bleiben grün.

### Phase 2 — Typing-Golden (Schema + Draft + Worksheet + Adjudikation)
- E6-Ergänzung: `obligationKinds: [obligation, prohibition, permission]` in `norm-ontology.v1.ts` (+ CHANGELOG, semver → 1.3.0).
- `packages/server/src/evals/typingGolden.ts`: Zod-Schema (case = Provision-Text + Labels aus geschlossenen E6-Räumen + `frozen`, Sprache, jurisdiction, annotator/kappa-Felder).
- `packages/server/src/scripts/build-typing-golden.ts`: Draft-Builder (Labels leer) aus Korpus-Provisions (Muster `build-self-golden.ts`).
- Worksheet-HTML zum Labeln (Muster `golden:worksheet`); LLM-Vorschlag optional als Vorbefüllung, Mensch adjudiziert.
- **AC-1:** Golden-Set `frozen: true` erst nach Kappa ≥ 0,6 + Adjudikation.

### Phase 3 — Typing-Runner + Report + Freigabe-Doc
- `packages/server/src/evals/runTypingEval.ts`: Instruct-LLM klassifiziert gegen geschlossenen E6-Typraum, Cache-Muster (`predictionCache.ts`).
- Report-Breakdowns: **Sprache (DE/EN)**, **Source**, **C_score-Band** (aus Phase 0). Kalibrierung + FP/FN-Bias (aus Phase 1).
- **AC-4:** Trace referenziert Golden-Set-/Eval-Version (THE-384 ✅ Done, joinbar).
- **AC-5:** Freigabe-Schwelle für THE-432 dokumentiert (kein Suggest default-on ohne Baseline).
- **Gate:** CI-fähiger Lauf mit Kosten-Ausweis; Report zeigt alle Breakdowns.

## Komplexität (Ousterhout) — aus Pre-Flight
Change-Amp niedrig · Cognitive-Load mittel (ECE/Bias/leakage neu) · **UU mittel** (Haupt-Watch: manuelle Label-Qualität DE-Recht, Kappa-Gate) · Deps mittel (Phase 0 entsperrt AC-2/3) · Obscurity niedrig.

## Offene Verifikations-Punkte VOR Code
1. Welche Query/Model liefert den @eId-Norm-Baum für C_score? (Phase-0-Blocker)
2. Reicht `obligation/prohibition/permission` als Obligation-Raum, oder feiner? (E6-Kontrakt)
3. Korpus-Provisions-Endpoint: liefert er Volltext je Provision für den Typing-Draft?

## RVTM
Ergänzt `docs/superpowers/rvtm/2026-07-06-uc-onto-001-rvtm.md` um THE-431-Zeilen + THE-430-Slice-1-ACs mit Verifikations-Evidenz.
