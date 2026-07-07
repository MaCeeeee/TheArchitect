# Cap-Experiment — hebt ein höherer Mapping-Cap den Recall?

> Baseline-Befund (EVAL_BASELINE.md): Recall klebt bei ~50 %, aber nicht wegen
> der Modelle — `MAX_MAPPINGS_PER_REGULATION = 5` deckelt jeden Fall, während
> viele Requirements 9–10 Elemente brauchen. Cap-Hit 100 %. Dieses Experiment
> testet, ob das Anheben des Caps den Recall freisetzt.
>
> Linear: THE-401 (Cap-Wechselwirkung) · Substrat: `mapping.req-self-v1` (frozen)

## Was geändert wurde

Cap **und** Prompt-Obergrenze sind jetzt per Env-Var steuerbar (vorher: hart 5
an zwei Stellen — Service-Slice UND Prompt „At MOST 5"; beide mussten mit, sonst
begrenzt das schwächere):

- `COMPLIANCE_MAX_MAPPINGS` — Top-N-Cap **und** Prompt-Limit (Default 5)
- `COMPLIANCE_CONFIDENCE_THRESHOLD` — Mindest-Confidence (Default 0.5)

Der Cap steckt jetzt im Eval-Cache-Key (Prompt-Hash + Inputs-Hash), d. h. ein
Lauf mit anderem Cap misst **live neu** statt die alten gedeckelten 5 aus dem
Cache zu liefern.

## Durchführung (auf deinem Rechner)

```bash
cd ~/thearchitect-eval && git pull && cd packages/server
# ANTHROPIC_API_KEY muss in .env stehen

# Referenz (Cap 5, wie Baseline) — kommt aus dem Cache, kostet nichts:
npm run eval:mapping -- --golden src/evals/golden/mapping.req-self-v1.json --models haiku,sonnet,opus

# Cap 10:
COMPLIANCE_MAX_MAPPINGS=10 npm run eval:mapping -- --golden src/evals/golden/mapping.req-self-v1.json --models haiku,sonnet,opus

# Cap 15 (deckt auch die größten Gold-Fälle mit 10 ab, mit Luft):
COMPLIANCE_MAX_MAPPINGS=15 npm run eval:mapping -- --golden src/evals/golden/mapping.req-self-v1.json --models haiku,sonnet,opus
```

Jeder Lauf schreibt eine eigene Vergleichstabelle (Report zeigt oben den
effektiven Cap). Poste die drei — dann sehen wir die Recall-Kurve über den Cap.

## Interpretation (zwei mögliche Ausgänge, beide wertvoll)

- **Recall/F2 springen mit dem Cap** → der ~50 %-Deckel war ein Config-Artefakt.
  Story: „Baseline gemessen → Flaschenhals gefunden → behoben." Danach ist der
  neue, höhere Wert die Baseline (EVAL_BASELINE.md fortschreiben).
- **Recall bleibt trotz höherem Cap** → das Modell ist von sich aus konservativ
  (findet nur ~5 plausible), nicht der Cap. Dann liegt der Hebel im Prompt / in
  Self-Consistency / in der Kaskade (THE-401), nicht im Cap. Ebenfalls ein
  klares Ergebnis.

## Achtung Precision / Empty-Set

Ein höherer Cap kann die **Precision drücken** (mehr FP) und die
**Empty-Set-Accuracy weiter verschlechtern** (auf den Gap-Requirements wirft das
Modell dann evtl. noch mehr rein). Deshalb bleibt F2 die Leitmetrik und die
Empty-Set-Spalte im Blick: Der Cap ist kein Freifahrtschein, sondern ein
Trade-off — genau das, was die Kaskade später sauber löst (Generator weit, Judge
schneidet zurück).
