# Spike: Judge-Compare — taugt ein lokales Modell als Law-Judge?

> Leitfrage: Kann ein selbst betriebenes Modell (z. B. das deutsche Rechts-Finetune
> `DomainLLM/gemma-3-12b-it-german-law-finetuned`) den Cloud-Judge (Claude Haiku)
> in der Gesetzes-Discovery (UC-LAW-002) ersetzen, ohne dass die Qualität messbar
> leidet? Motivation: Datenhoheit (Architekturprofile verlassen nicht die eigene
> Infrastruktur) und laufende Kosten.
>
> Status: Spike, noch kein Linear-Ticket. Substrat: `discovery.v1` (`frozen: false`).

## Was gebaut wurde

| Datei | Zweck |
|---|---|
| `judgeBackends.ts` | Backend-Specs (`anthropic:` / `local:`), OpenAI-kompatibler Shim, Call-/Token-Zählung |
| `runJudgeCompareEval.ts` | Runner: Aufgaben, Metriken, Paarvergleich, Go/No-Go-Gate, Datei-Cache, Report |
| `__tests__/judgeBackends.test.ts`, `__tests__/runJudgeCompareEval.test.ts` | Unit-Tests + E2E des Prod-Judges über den Shim |

**Kein Prod-Code geändert.** `judgeCandidate` (lawJudge.service.ts) nimmt bereits
einen injizierbaren Client und hat einen Text-JSON-Fallback. Der Shim übersetzt
`messages.create` in `/v1/chat/completions` (vLLM, Ollama, llama.cpp-server,
LM Studio). Prompt, Zod-Validierung, Feedback-Retry und Sanitizing laufen damit
exakt wie in Prod. Gemessen wird also der echte Judge-Pfad, nicht ein Nachbau.

## Was gemessen wird

- **Aufgabe = (Case, Gesetzesfamilie)**, Label = Familie ∈ `goldFamilies`.
- `--candidates all` (Default): jeder Case × jede der 11 Korpus-Familien = 132
  Aufgaben. Misst den Judge **isoliert** — keine Gold-Familie fällt vorher am
  Retrieval-Gate raus.
- `--candidates gated`: nur was in Prod den Judge erreicht (Threshold 0.3, max 5).
  Gold-Familien, die nie ankommen, werden separat als Retrieval-Verlust gezählt.
- Je Backend: Precision, Recall, F2, Specificity, Cohen's κ gegen Gold, ECE,
  Fehlerquote (Schema-Bruch nach Retry, Timeout), Latenz p50/p95, API-Calls
  inkl. Retries, Tokens.
- Gegen die Referenz (erstes `--backend`): Übereinstimmung, κ, ΔPrecision,
  ΔRecall, **ΔF2 mit gepaartem Bootstrap-CI** (Resampling über Cases),
  exakter McNemar-Test auf die diskordanten Paare, Liste der Abweichungen mit
  Begründung des Kandidaten.

## Go/No-Go-Kriterien (vor dem ersten echten Lauf festgelegt)

| Kriterium | Schwelle | Warum |
|---|---|---|
| Fehlerquote | ≤ 5 % | Ein Judge, der oft kein valides JSON liefert, meldet in Prod still kein Gesetz. |
| Precision-Verlust ggü. Referenz | ≤ 5 pp | Der Prompt priorisiert Precision (Judge ist der *präzise* zweite Durchgang). |
| ΔF2, untere 95 %-CI-Grenze | ≥ −10 pp | Nicht-Unterlegenheit statt „gleich gut" — bei n = 12 ist mehr nicht beweisbar. |

Ergebnis: **GO** (alle erfüllt), **NO-GO** (harte Verletzung oder ganzes CI unter
der Marge) oder **INCONCLUSIVE** (CI überdeckt die Marge → mehr Fälle nötig).
Werte stehen in `DEFAULT_GATE`. Wer sie ändert, ändert sie **vor** dem Lauf und
dokumentiert es hier, sonst ist das Gate wertlos.

## Durchführung

### 1. Referenzlauf (Claude Haiku)

```bash
cd packages/server   # ANTHROPIC_API_KEY in .env
npm run eval:judge-compare
```

132 Calls, Ergebnis landet im Cache (`src/evals/cache/judge-compare/haiku/`).

### 2. Lokales Modell bereitstellen

Auf einem Rechner mit GPU, **nicht** auf dem Hostinger-VPS (KVM 2: keine GPU,
zu wenig RAM). Beispiel vLLM:

```bash
pip install vllm
vllm serve DomainLLM/gemma-3-12b-it-german-law-finetuned --max-model-len 8192 --port 8000
```

Richtwerte (nicht verifiziert): 12 B Parameter in BF16 ≈ 24 GB nur für die
Gewichte, plus KV-Cache → praktisch eine 40/48-GB-GPU, oder quantisiert
(8-/4-bit) auf 24 GB. Eine GGUF-Variante für Ollama/llama.cpp ist auf der
Modellseite nicht gelistet, müsste also selbst konvertiert werden.

> Datenschutz: Die Golden-Set-Profile sind fiktiv. Für den Eval ist eine
> gemietete Cloud-GPU daher unkritisch. Für echte Kundenprofile gilt das nicht.

### 3. Vergleich

```bash
npm run eval:judge-compare -- \
  --backend haiku=anthropic:claude-haiku-4-5-20251001 \
  --backend gemma-law=local:DomainLLM/gemma-3-12b-it-german-law-finetuned@http://<gpu-host>:8000
```

Weitere Optionen: `--candidates gated`, `--json-mode none` (falls der Server
`response_format` nicht kann), `--timeout-ms 300000` (CPU-Inferenz),
`--limit-cases 2` (schneller Probelauf). Optionaler Bearer-Token für den lokalen
Endpoint: `LOCAL_LLM_API_KEY`. Weitere Backends einfach mit zusätzlichen
`--backend` anhängen; jeder wird gegen den ersten verglichen.

### 4. Reproduzieren ohne Netz/GPU

```bash
npm run eval:judge-compare -- --offline --backend haiku=... --backend gemma-law=...
```

Liest nur den Cache. Der Cache-Key enthält Profil, Familie, Modell, URL,
Prompt-Hash und Kandidat — ändert sich eines davon, wird neu gemessen. Fehler
werden nicht gecacht. Wer den Lauf im Team nachvollziehbar machen will,
committet `src/evals/cache/judge-compare/<backend>/`.

## Grenzen (ehrlich)

- **n = 12 Cases, `frozen: false`.** Das Gate ist ein Richtungssignal, keine
  Baseline. Die CIs werden breit sein; INCONCLUSIVE ist ein realistisches Ergebnis.
- **DSGVO-lastig:** 11 von 25 Gold-Positiven sind DSGVO. Im Smoke-Run erreichte
  ein Fake-Modell, das *nur* DSGVO meldet, bereits 44 % Recall bei 100 %
  Precision. Deshalb immer die Per-Familie-Tabelle lesen, nicht nur F2.
- **Nur EU-Familien im Fixture-Korpus** (DSGVO, NIS2, DORA, AI Act, Data Act, CRA,
  MDR, PSD2, ePrivacy, UNECE R155, LkSG). Der mögliche Vorteil eines *deutschen*
  Rechts-Finetunes (BDSG, TDDDG, BSIG/NIS2UmsuCG, KRITIS-DachG, KWG/BAIT …) ist
  damit noch **nicht messbar**. Das ist der wichtigste nächste Schritt (siehe unten).
- **Prompt ist englisch** (Prod-Prompt, bewusst unverändert). Ein auf Deutsch
  trainiertes Modell könnte damit benachteiligt sein. Eine deutsche Prompt-Variante
  wäre ein eigener Versuch mit eigenem Prompt-Hash.
- **Modellherkunft:** Die Modellkarte von `DomainLLM/gemma-3-12b-it-german-law-finetuned`
  ist leer (keine Trainingsdaten, Lizenz, Benchmarks). Auch ein GO im Eval ersetzt
  nicht die Lizenz- und Herkunftsprüfung vor einem produktiven Einsatz.
- Beobachtung aus dem Smoke-Run (nicht weiter untersucht): Im `gated`-Modus
  erreichten 14 von 25 Gold-Familien den Judge gar nicht. Der größere Hebel für
  die Discovery-Qualität liegt womöglich im Retrieval, nicht im Judge-Modell.

## Nächste Schritte (Vorschlag)

1. Referenzlauf Haiku + ein lokaler Kandidat → erstes Gate-Ergebnis.
2. Fixture-Korpus und Golden-Set um deutsche Familien erweitern; Labels von
   Jurist:innen, Übereinstimmung mit dem vorhandenen `golden:kappa`-Tooling messen.
3. Erst bei GO auf dem erweiterten Set: `lawJudge` auf die bestehende
   `LLM_BACKEND`-Abstraktion (`services/wfcomp/llm.ts`) umstellen — als eigenes Ticket.

## Bewusste Nicht-Ziele

- Keine Änderung am Prod-Judge, am Prompt oder an `LLM_BACKEND`.
- Kein Fine-Tuning, kein Modell-Hosting in TheArchitect.
