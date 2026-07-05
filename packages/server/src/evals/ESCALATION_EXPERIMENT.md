# Eskalations-Experiment (THE-401 S3) — selektive Kaskade

> Full-Judge-Baseline (EVAL_BASELINE.md, recall-schonend): F2 68,5 %, aber der
> Judge prüfte JEDEN Vorschlag und riss dabei Recall (TP-Damage 23 %). S3 fragt:
> Reicht es, nur die **wackeligen** Vorschläge zu prüfen — und schützt das die
> stabilen TPs vor dem Judge, bei weniger Judge-Calls?

## Idee

Generator ×N mit permutierter Kandidaten-Reihenfolge → pro Element ein
Self-Consistency-Signal (in wie vielen Läufen kam es vor) + mittlere Confidence.
Der Shuffle deckt zugleich Positions-Bias ab: ein Element, das je nach Reihenfolge
mal auftaucht und mal nicht, ist unzuverlässig. Routing (LLM-frei):

- **keep** — in ALLEN Läufen, hohe Confidence → übernehmen, **nicht** judgen (schützt TPs)
- **escalate** — order-instabil oder mittlere Confidence → an den Judge (dessen Präzision ist hier wertvoll)
- **drop** — nur ein einziger Lauf & schwache Confidence → verwerfen

Schwellen in `escalation.service.ts::DEFAULT_THRESHOLDS`, per Code justierbar.

## Durchführung

```bash
cd ~/thearchitect-eval && git pull && cd packages/server
COMPLIANCE_MAX_MAPPINGS=12 npm run eval:escalation
```

Läuft: Generator (Haiku) 3× je Case (run 0 = Original-Reihenfolge, 1–2 geshuffelt)
→ Routing → Judge (Sonnet) nur auf die eskalierten → recall-schonende Policy.
Kosten: 3× Generator (billig) + Judge nur auf einen Teil der Fälle/Vorschläge.

Der Report zeigt **Generator vs. selektive Kaskade** plus **Routing & Kosten**
(Cases mit Judge-Call, eskalierte Vorschläge, keep/drop). Vergleich zur
Full-Judge-Zahl (F2 68,5 %) steht in EVAL_BASELINE.md.

## Interpretation

- **F2 ≈ Full-Judge bei deutlich weniger Judge-Calls** → Eskalation ist der
  Kosten-Hebel: gleiche Qualität, günstiger. Story: „nicht alles teuer prüfen,
  nur das Riskante."
- **F2 > Full-Judge** → die geschützten stabilen TPs recovern Recall, den der
  Full-Judge zerstört hatte. Dann ist Eskalation auch ein Qualitäts-Hebel.
- **F2 < Full-Judge** → die Keep-Schwelle lässt zu viel FP durch; `keepConfidence`
  hoch / `keepConsistency` streng nachziehen und erneut (aus dem Cache) messen.

Wie beim Cap-Experiment sind die Generator-Läufe gecacht — Schwellen-Justierung
= Re-Run ohne neue Generator-Calls (nur neu eskalierte Fälle rufen den Judge).
