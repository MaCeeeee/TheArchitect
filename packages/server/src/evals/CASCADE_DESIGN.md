# Modell-Kaskade: Klein erzeugt, Groß validiert — mit Correctness & Conciseness als getrennten Achsen

> Linear: REQ-EVAL-001.10 (neu) · baut auf THE-382 (Judge) auf · Epic THE-378 (UC-EVAL-001)
> Status: DESIGN — Umsetzung in Slices S1–S4 unten. S1 ist sofort baubar; E2/E3
> brauchen das eingefrorene Golden-Set (blockiert durch die Theme-②-Entscheidung, s. §7).

## 1. Idee in einem Satz

Das kleine Modell (Haiku 4.5) erzeugt die Mappings im Volumen; ein größeres
Modell (Sonnet 5) validiert **nur die riskanten Fälle** und benotet sie auf
**zwei getrennten Achsen** — *Correctness* (stimmt es?) und *Conciseness*
(matcht es sparsam statt zur Sicherheit alles?); der Mensch adjudiziert nur
noch, was der Validator flaggt.

Warum getrennte Achsen: Eine Gesamtnote versteckt den gefährlichen Fall.
„Falsch" und „richtig, aber aufgebläht" brauchen unterschiedliche Reaktionen —
das eine ist ein Audit-Risiko (Recall), das andere Alarm-Müdigkeit (Precision-
Hygiene). Verrührt man sie, optimiert man am Ende versehentlich Kürze gegen
Vollständigkeit (Goodhart, s. §6).

## 2. Architektur (4 Stufen)

```
Stufe 0  Deterministisch (kostenlos)
         Schema-Validierung, Halluzinations-Filter (existiert), Duplikat-Check
            │
Stufe 1  GENERATOR: Haiku 4.5 — Mapping + Confidence + Reasoning (heutiger Pfad)
            │
Stufe 2  ROUTING (billige Signale, kein LLM-Urteil):
         a) Confidence-Band: 0.5–0.8 → eskalieren
            (empirischer Hook: im ersten Live-Lauf hatte Band 0.7–0.8 0 % Precision,
             0.9–1.0 dagegen 100 % — genau dafür ist das Band-Routing da)
         b) Self-Consistency: 3 Läufe, Jaccard < 1.0 → eskalieren
         c) Order-Shuffle-Disagreement (Infra existiert: consistency.ts) → eskalieren
         d) Drift: regulationVersionMismatch → eskalieren
         e) Hard-Negative-Verdacht: 0 Mappings bei Pflicht-Quelle → eskalieren
            │                     │
        (unauffällig)        (auffällig, erwartet ~20–40 %)
            │                     │
       auto-accept        Stufe 3  VALIDATOR: Sonnet 5 (pointwise Judge)
       (status: auto,              pro vorgeschlagenem Paar UND Missed-Sweep
        judge: skipped)            über die NICHT vorgeschlagenen Kandidaten
                                       │
                          Stufe 4  ROUTING DES VERDIKTS:
                          - alles "required" bestätigt → auto-accept (judge: passed)
                          - "superfluous" only        → auto-accept + Conciseness-Log
                          - "incorrect"/"missed"/
                            "uncertain"               → Human-Queue (status bleibt auto,
                                                        UI-Flag; Judge löscht NIE selbst)
```

Invarianten:
- **Der Judge löscht/ändert nie selbst** — er flaggt. Auditierbarkeit: jede
  Zustandsänderung eines Mappings bleibt menschlich oder explizit `auto`.
- **Generator ≠ Judge** (nie dasselbe Modell sich selbst benoten lassen).
- Jeder Judge-Call wird als AiTrace (`operation: 'judge'`) persistiert.

## 3. Das Judge-Verdikt: ein Schema, zwei Achsen

Pro Fall bekommt der Validator: Regulierungstext + VOLLE Kandidatenliste +
die Haiku-Mappings inkl. Reasoning. Er liefert:

```json
{
  "pairVerdicts": [
    {
      "elementId": "bsh-proc-gdpr-incident",
      "verdict": "required | superfluous | incorrect | uncertain",
      "citedSentence": "<wörtliches Zitat aus dem Paragraphen>",
      "rationale": "<1 Satz>"
    }
  ],
  "missedElementIds": ["<Kandidaten, die nach Rubrik fehlen>"],
  "reasoningGrounded": { "<elementId>": true }
}
```

Die vier Verdikte sind der Kern — sie trennen die Achsen sauber:

| Verdikt | Achse | Bedeutung | Reaktion |
|---|---|---|---|
| `required` | Correctness ✓ | Rubrik verlangt das Paar | bestätigt |
| `incorrect` | **Correctness ✗** | Paar verletzt die Rubrik (falsches Regime, transitive Nähe) | Human-Queue |
| `missed` (via `missedElementIds`) | **Correctness ✗✗** | Pflicht-Element fehlt — der audit-kritische Fall | Human-Queue, höchste Prio |
| `superfluous` | **Conciseness ✗** | vertretbar, aber nach Rubrik nicht gefordert (z. B. bloßer Datenfluss) | auto-accept + Log, kein Block |
| `uncertain` | — | Judge unsicher | Human-Queue |

Pflicht-Elemente des Judge-Prompts (aus THE-382 übernommen): Satz-Zitat pro
Verdikt (gegen Rubber-Stamping), adversariales Framing („was wäre hieran
falsch?"), Kanarienvögel in jedem Lauf (Catch-Rate ≥ 90 % sonst Lauf ungültig),
Verdikt-Verteilung wird geloggt (Ablehnungsquote → 0 = Kollaps-Alarm).

## 4. Metriken — explizit

### Correctness (hartes Gate)
| Metrik | Formel | Gate (provisorisch, final nach Baseline) |
|---|---|---|
| Pair-Recall | TP / (TP+FN) gegen Gold | ≥ 0.90 auf frozen v1; Regression nur außerhalb Bootstrap-CI |
| F2 | (5·P·R)/(4·P+R) | Leitmetrik, Baseline-relativ |
| Empty-Set-Accuracy | korrekt-leere / gold-leere Fälle | ≥ 0.8 (heute: 0 %!) |
| Judge-vs-Mensch | Cohen's Kappa auf adjudizierter Überlappung | ≥ 0.7, sonst Judge nicht produktiv |
| Canary-Catch | gefangene / injizierte Fehler | ≥ 0.9 pro Lauf |

### Conciseness (weiches Gate / Monitor — nie Solo-Gate!)
| Metrik | Formel | Zielband (provisorisch) |
|---|---|---|
| Over-Match-Ratio (OMR) | Σ\|predicted\| / Σ max(1,\|gold\|) (eval) | 1.0–1.5 — hängt an der Theme-②-Definition! |
| Spurious-Rate | \|superfluous-Verdikte\| / \|predicted\| (runtime, Judge-basiert) | < 20 % |
| Mappings/Paragraph | Verteilung (aus AiTrace.predictionCount — heute schon messbar) | Monitor, Trend |
| Reasoning-Groundedness | Anteil Paare mit `reasoningGrounded: true` | ≥ 0.9 |

**Kopplungsregel (Anti-Goodhart, §6):** Eine Änderung, die Conciseness
verbessert, gilt nur als Verbesserung, wenn Pair-Recall **nicht-unterlegen**
ist (CI-Überlappung mit Baseline). Conciseness ist Tie-Breaker und
Alarm-Müdigkeits-Wächter — niemals Optimierungsziel allein.

### ⚠ Bekannte Wechselwirkung: der Top-5-Cap
`MAX_MAPPINGS_PER_REGULATION = 5` im Service kappt heute still auf 5 Mappings.
Fällt die Theme-②-Entscheidung **breit** aus (Datenhalter zählen), wird der Cap
zum **Recall-Bug** (BSH-Pool hat 12 Kandidaten, legitime Gold-Sets können > 5
sein) — und er maskiert zugleich die OMR-Messung. To-do in S1: Cap in der Eval
ausweisen; ggf. konfigurierbar machen, Entscheidung nach Theme ②.

## 5. Rollen der Modelle & Kosten

| Rolle | Modell | Preis (in/out je 1M Tok) | Aufgabe |
|---|---|---|---|
| Generator | Haiku 4.5 | $1 / $5 | 100 % der Fälle, heutiger Pfad |
| Validator | Sonnet 5 | $3 / $15 (Intro $2/$10 bis 31.08.26) | nur eskalierte Fälle (~20–40 %) |
| Kalibrator | Opus 4.8 | $5 / $25 | kleine Stichproben: Judge-of-Judge, Adjudikations-Hilfe, Kanarien-Design |

Grobe Rechnung pro Fall (BSH-Größe, ~1.5k in / 300 out): Haiku ≈ $0.003;
Judge-Call (Paar-Verdikte + Missed-Sweep, ~2k/400) ≈ $0.012 → bei 30 %
Eskalation ≈ **+$0.004 Ø/Fall** — die Kaskade kostet ~2× Haiku-alone, aber
~⅕ von Sonnet-everywhere. (Richtwerte; echte Zahlen liefert E3.)

**Wichtig zur ursprünglichen Idee „Klein labelt, Groß validiert":** fürs
**Golden-Set-Labeling** bleibt die Reihenfolge umgekehrt (Groß entwirft, Mensch
adjudiziert) — die Qualität des Maßstabs dominiert dort. Die Kaskade hier ist
für den **Produktionspfad**, wo Volumen und Kosten dominieren.

## 6. Risiken & Gegenmittel

| Risiko | Gegenmittel |
|---|---|
| Goodhart auf Conciseness (weniger matchen = Recall stirbt still) | Kopplungsregel §4; Conciseness nie als CI-Gate, nur Correctness |
| Self-Preference / Familien-Blindfleck (Haiku+Sonnet teilen Trainings-DNA) | menschlich adjudizierter Kern bleibt Anker; Kanarienvögel; optional später Cross-Family-Judge als Stichproben-Zweitmeinung |
| Judge-Kollaps (winkt alles durch) | Verdikt-Verteilung überwachen + Canary-Gate (THE-382) |
| Judge halluziniert „missed" Elemente | missedElementIds müssen aus der Kandidatenliste stammen (Post-Filter wie beim Generator) + Satz-Zitat-Pflicht |
| Kosten-Drift bei hoher Eskalationsquote | Eskalationsquote ist Trace-Metrik; Alarm > 50 % |

## 7. Experimente (die Meetup-Story)

| Exp | Frage | Setup | Output | Blockiert durch |
|---|---|---|---|---|
| **E1** | Ist Klein gut genug — und wo? | Golden-Set durch Haiku vs. Sonnet vs. Opus (Stichprobe) als **Generatoren** | Correctness (F2/Recall/Empty-Set) UND Conciseness (OMR, Count-Verteilung) **pro Modell** | frozen Gold (Theme ②) |
| **E2** | Taugt der Judge? | Sonnet-Judge über Haiku-Outputs auf Gold + Kanarien | Judge-vs-Gold-Kappa, Canary-Catch, Verdikt-Verteilung | frozen Gold |
| **E3** | Lohnt die Kaskade? | Haiku+Routing+Judge vs. Haiku-alone vs. Sonnet-alone | Kosten-Qualitäts-Frontier: $/Fall vs. F2, OMR als Annotation | E1+E2 |

Meetup-Chart (31.07.): eine Grafik, drei Punkte (Haiku / Kaskade / Sonnet) auf
der Kosten-F2-Ebene — „wir wissen, was uns welches Qualitätsniveau kostet".

## 8. Umsetzungs-Slices

- **S1 — Eval-seitig, sofort baubar (kein Prod-Touch):** Conciseness-Metriken
  in `metrics.ts` (OMR, Spurious-Platzhalter, Count-Verteilung) + Report-Spalten;
  `eval:mapping --models haiku,sonnet` Multi-Modell-Lauf (Cache-Key enthält
  Modell bereits ✓); Cap-Ausweis im Report.
- **S2 — Judge-Service (THE-382):** Prompt mit 4-Verdikt-Schema + Missed-Sweep
  + Zitat-Pflicht + Kanarien; Validierung gegen adjudiziertes Gold (Kappa ≥ 0.7).
- **S3 — Routing-Signale:** Self-Consistency-Runner (N=3), Band-Regel,
  Shuffle-Check, Drift-Flag als `escalation.service` mit konfigurierbaren Schwellen.
- **S4 — Produktions-Verdrahtung:** Feature-Flag, Human-Queue-Flag am
  ComplianceMapping, AiTrace-Erweiterung (`operation: 'judge'`, Verdikt-Felder),
  Dashboard: Eskalationsquote, Spurious-Rate, Verdikt-Verteilung.

Reihenfolge: S1 jetzt → (Theme ② + Freeze) → E1 → S2+E2 → S3 → E3 → S4.
