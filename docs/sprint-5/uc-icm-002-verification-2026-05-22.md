# UC-ICM-002 Live-Verification — 2026-05-22

**Linear:** [THE-280](https://linear.app/thearchitect/issue/THE-280) AC-5
**Model:** `claude-haiku-4-5-20251001`
**Script:** [`packages/server/scripts/verify-uc-icm-002-llm.ts`](../../packages/server/scripts/verify-uc-icm-002-llm.ts)

## Result: 5/5 BSH-Demo-Szenarien passed

| # | Szenario | High-Confidence-Element | Score | Latency |
|---|---|---|---|---|
| 1 | NIS2 Art. 21 — Cybersecurity in Supply Chain | `cap-lieferantenmanagement` | **0.95** | 3972ms |
| 2 | LkSG § 6 — Präventionsmaßnahmen Supplier-Risiko | `cap-lieferantenmanagement` | **0.95** | 2727ms |
| 3 | DSGVO Art. 32 — Sicherheit der Verarbeitung | `cap-datenverarbeitung-b2c` | **0.95** | 3675ms |
| 4 | DSGVO Art. 9 — Besondere Kategorien (Gesundheit) | `app-hr-plattform` | **0.95** | 2772ms |
| 5 | LkSG § 3 — Sorgfaltspflichten Lieferkette | `cap-lieferantenmanagement` | **0.95** | 2987ms |

**Aggregated:** 5/5, total 16.13s, avg **3227ms/call**, **0 Halluzinationen**.

## Confidence-Calibration (sekundäre Matches)

LLM kalibriert weich + plausibel:

- Szenario 1: `app-sap-erp` 0.72, `cap-datenverarbeitung-b2c` 0.58 (unter Threshold, korrekt gedroppt)
- Szenario 3 (DSGVO 32): cascade `cap-datenverarbeitung-b2c` 0.95 → `data-personalakte` 0.93 → `app-hr-plattform` 0.92 → `app-sap-erp` 0.75 — perfekt nach Daten-Sensitivität gewichtet
- Szenario 4 (DSGVO 9): `app-hr-plattform` 0.95 > `data-personalakte` 0.92 > `cap-datenverarbeitung-b2c` 0.65 — HR-Plattform priorisiert weil Gesundheitsdaten explizit dort liegen

## Reasoning-Qualität (Live-Auszüge)

Reasoning matched **Sprache der Regulation** (de→de) und zitiert konkrete Paragraphen-Phrasen:

> **NIS2 Art. 21 → Lieferantenmanagement:**
> „Art. 21 fordert explizit Sicherheit der Lieferkette und sicherheitsbezogene Aspekte der Beziehungen …"

> **LkSG § 6 → Lieferantenmanagement:**
> „§ 6 LKSG verpflichtet Unternehmen, angemessene Präventionsmaßnahmen gegenüber Zulieferern zu veranke[rn] …"

> **DSGVO Art. 9 → HR-Plattform:**
> „Die HR-Plattform verarbeitet explizit Gesundheitsdaten und Sozialversicherungsdaten, die unter DSGVO …"

## Hard Rules verifiziert

- ✅ Keine erfundenen `elementId`s (5 Calls, alle IDs ∈ Candidate-List)
- ✅ Max 5 Mappings pro Call (Top-N cap)
- ✅ Confidence-Threshold ≥ 0.5 (Service filtert < 0.5 raus)
- ✅ Reasoning ≤ 500 chars (Zod schneidet, keinmal angeschlagen)
- ✅ Reasoning-Sprache matched Regulation-Sprache (alle 5 auf Deutsch)

## Performance-Projektion (Input für D4)

Average **3227ms/call** sequential:

| Setup | Sequential Zeit | Target 90s? |
|---|---|---|
| 50 Regs × 5 Els | ~161s | ❌ über Target |
| 50 Regs × 10 Els | ~322s | ❌ deutlich über Target |
| 50 Regs × 5 Els @ `p-limit 5` | ~32s | ✅ |
| 50 Regs × 10 Els @ `p-limit 5` | ~64s | ✅ |

**Aktion für D4:** `p-limit` einbauen, Concurrency-Tuning auf 5 (Anthropic rate-limit Berechnung in D4).

## Cost-Projektion

- 5 Calls × Haiku 4.5 (~$0.001 ea.) = ~$0.005
- BSH-Demo (16 Regs × 10 Els pro Run) ≈ $0.02 pro Full-Run
- Pitch-Day-Reserve: 50 Runs ≈ $1

Negligible.

## Akzeptanz-Status für THE-280

- ✅ AC-1 Routes auth-protected (Unit-Test)
- 🟡 AC-2 Performance — sequential **failed** target; mit Concurrency-Plan für D4 OK
- ✅ AC-3 Audit-Entry für `auto` + `confirm` (Unit-Test verifiziert)
- ✅ AC-4 Rate-Limit Preview 30/min (Code-Path verifiziert, Live-Test in D5)
- ✅ AC-5 5 BSH-Demo-Szenarien ≥ 0.7 Confidence — **alle 5 @ 0.95**

## Reproduktion

```bash
cd packages/server
npx tsx scripts/verify-uc-icm-002-llm.ts
# Requires: ANTHROPIC_API_KEY in env or /Users/mac_macee/javis/packages/server/.env
```
