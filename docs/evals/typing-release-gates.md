# Typing-Eval — Freigabe-Schwellen (THE-430 AC-5)

**Gilt für:** die ONTO-Suggest-Features, die auf der Typing-Eval aufsetzen —
THE-432 (Term Typing beim Ingest), THE-433 (Relation Extraction), THE-434
(Stage-1-Retrieval). **Kern-Regel:** *Kein Suggest-Feature geht `default-on`,
ohne ein frozen Golden-Set + einen Baseline-Report, der diese Schwellen trifft.*

Quelle der Disziplin: OntoLearner (arXiv:2607.01977) §5 — Modelle liegen
**konfident falsch**, F1 allein sieht das nicht. Darum: pro Achse gemessen,
nach C_score-Band stratifiziert, mit Kalibrierungs-Ausweis.

## Vorbedingungen (hart)

1. **Golden frozen**: `frozen: true`, Kappa ≥ 0.6 nach Adjudikation (RUBRIC §7).
   Ein nicht-frozen Golden erzeugt keinen verbindlichen Baseline-Report.
2. **Leakage deklariert**: wurde LLM-vorgelabelt (typing:prelabel), labelt
   dieselbe Modell-Klasse, die getestet wird — im Report vermerkt. Ein Feature,
   das auf leakage-behaftetem Golden knapp über der Schwelle liegt, ist NICHT
   freigabereif; dann ein zweiter, unabhängig gelabelter Golden-Split.
3. **Sprach- + Band-Deckung**: mindestens DE + EN vertreten; Bänder, in denen
   das Feature laufen soll, mit ≥ 5 Cases besetzt (sonst kein Urteil je Band).

## Freigabe-Schwellen je Achse (Vorschlag → default-on)

| Achse | Accuracy | macro-F1 | Zusatz |
| --- | --- | --- | --- |
| normKind | ≥ 0.90 | ≥ 0.85 | norm-level, hohe Deckung erwartbar |
| bindingness | ≥ 0.85 | ≥ 0.80 | — |
| obligationKind | ≥ 0.80 | ≥ 0.75 | deontisches Tripel; `__na__` als eigene Klasse gewertet |
| partyRole | ≥ 0.75 | ≥ 0.70 | Rollenraum-Version im Report ausweisen (E6 1.6.0 vs. 1.7.0 sind nicht vergleichbar) |
| provisionKind | ≥ 0.75 | ≥ 0.70 | fünfte Achse (E6 1.5.0+); die Gate-2-Freigabe hängt zusätzlich an der Klassen-Regel unten |

### Klassen-Regel n ≥ 3 (gilt für ALLE Achsen, verallgemeinert 2026-07-25)

> **macro-F1 wird über Klassen mit n ≥ 3 gerechnet.** Klassen mit 1–2 Fällen werden im Report
> ausgewiesen, aber nicht eingerechnet.

Begründung: macro-F1 mittelt über Klassen, nicht über Fälle. Ein einziger verfehlter Fall in einer
n=1-Klasse zieht deren F1 auf 0,00 und den Achsenwert um bis zu 0,18 — das misst Stichprobengröße,
nicht Fähigkeit. Ursprünglich nur für `partyRole` formuliert (Gate 1: `deployer`,
`essential_important_entity` je n=1); bei THE-515 zum zweiten Mal aufgetreten (`provisionKind`
`definition` n=1 → scheinbarer Einbruch 0,873 → 0,688, über n ≥ 3 tatsächlich **0,826**). Zwei
unabhängige Vorfälle = Struktur-Merkmal kleiner Prüfsätze, keine Achsen-Eigenheit.

**Umgekehrt gilt:** Ein Rückgang, bei dem *alle* Klassen n ≥ 3 haben, ist echt und wird nicht
weggerechnet (THE-515: `obligationKind` 0,689 → 0,579).

Schwellen sind **Slice-1-Startwerte** (kein Paper-Import — die Law-Domäne war im
OntoLearner-Benchmark nicht getestet). Nach dem ersten echten Baseline werden sie
mit den beobachteten Bootstrap-CIs kalibriert, nicht vorab pauschal gesetzt.

## Gate 2 — klassen-spezifische Freigabe der Discovery-Priorisierung (O-2, fixiert 2026-07-22)

Der Gate-2-Konsument (scope-applicability-Priorisierung im Discovery-Retrieval, THE-423-belegter
Hebel) hängt an **einer** Klasse, nicht am Achsen-Durchschnitt. Deshalb:

> **Gate 2 gilt als bestanden, wenn `scope-applicability` am frozen Golden F1 ≥ 0,80 hält.**
> Der Achsen-Durchschnitt (Tabelle oben) steuert die breite Default-Freigabe der Typing-Vorschläge,
> nicht dieses Feature.

Messstand: Baseline tp-1 (2026-07-22): F1 0,86 · nach Prompt-Sync tp-2: **F1 0,92, Recall 1,00** ✅.

## In-Sample-Regel (stehend) — für tp-2 AUFGELÖST durch Golden v2 (2026-07-24)

Werden Rubrik-Regeln aus adjudizierten Golden-Fällen gewonnen (B3a-Präzedenzen) und der Prompt
nachgezogen, sind Re-Eval-Zahlen **auf demselben Golden** als *in-sample* zu kennzeichnen — sie sind
keine unabhängige Bestätigung. Die unabhängige Bestätigung liefert der nächste Golden-Ausbau
(neue Fälle, die die Regeln nie „gesehen" haben).

**Für tp-2 erbracht** (`typing.gv2.json`, 70 Fälle, 47 % aus v1-fremden Gesetzen — Nachweis
`docs/superpowers/2026-07-24-the-430-golden-v2-evidence.md`):

| Achse | in-sample (v1) | out-of-sample (v2) |
|---|---|---|
| provisionKind | 87,5 %/0,883 | **85,7 %/0,873** ✅ generalisiert |
| scope-applicability (Gate-2-Klasse) | F1 0,92 | **F1 0,90** ✅ über 0,80 |
| obligationKind | 88,8 %/0,869 | **80,0 %/0,689** ✅ über 0,6 |
| partyRole | 95,0 %/0,845 | **72,9 %/0,668** ⚠️ Rollenraum-Lücke → 1.7.0 |
| normKind / bindingness | 100 % / 97,5 % | **98,6 % / 100 %** |

Die Discovery-relevante Klasse hält out-of-sample; `partyRole` fällt erwartungsgemäß durch fehlende
Rollen für neue Gesetze (Data-Act-Dateninhaber, ePrivacy-ECS-Anbieter → 1.7.0). Vorbehalt ehrlich
beantwortet, nicht mehr offen.

## Messstand E6 1.7.0 / tp-3 (THE-515, 2026-07-25)

Frozen `typing.gv3.json` (70 Fälle, out-of-sample, 33 adjudiziert) — Nachweis
`docs/superpowers/2026-07-25-the-515-evidence.md`:

| Achse | gv2 (1.6.0 / tp-2) | **gv3 (1.7.0 / tp-3)** | Urteil |
|---|---|---|---|
| **partyRole** | 72,9 %/0,668 | **71,4 %/0,785** | ✅ Schwelle 0,70 erstmals gehalten |
| normKind / bindingness | 98,6 % / 100 % | **100 % / 100 %** | ✅ |
| provisionKind | 85,7 %/0,873 | 75,7 %/0,741 (n ≥ 3: **0,83**) | ✅ nach Klassen-Regel |
| obligationKind | 80,0 %/0,689 | 75,7 %/0,598 | ⚠️ echter Rückgang, s. u. |
| **scope-applicability** (Gate-2-Klasse) | F1 0,90 | **F1 0,93** | ✅ über 0,80 |

**Zwei stehende Beobachtungspunkte:**

1. `conformity_assessment_body` (neu in 1.7.0) hat Genauigkeit 0,38 und drückt
   `supervisory_authority` auf Trefferquote 0,36 — die einzige gemessene Verwechslung durch die
   Rollenraum-Erweiterung. Abgrenzungsregel ist Kandidat für tp-4/B3a.
2. `obligationKind`/`prohibition` F1 0,00 bei n=3 auf gv2 — kein Kleinklassen-Artefakt, aber bei n=3
   volatil. Vor einer Maßnahme ein zweiter Messlauf.

## C_score-Band-Kopplung (THE-431)

Auto-Akzeptanz-Schwelle steigt mit Norm-Komplexität — dort konzentrieren sich
Halluzinationen (Paper §5). Über `confidenceThresholdForBand` (complexityScore.ts):

| Band | Auto-Akzeptanz | Review |
| --- | --- | --- |
| trivial / low | Default-Schwelle | Stichprobe |
| moderate | Default-Schwelle | Breakdown beobachten |
| high | + strengere Confidence | erhöht |
| very-high | nur Top-Konfidenz | Pflicht-Review |

Default-Overrides sind LEER → heutiges Verhalten unverändert, bis ein Band-Wert
gesetzt wird (keine Regression, THE-431 AC-4).

## Kalibrierung (Gate, nicht nur Anzeige)

Trägt die Vorhersage Confidence: **ECE ≤ 0.10** je Achse für default-on. Höheres
ECE = konfident-falsch → Feature bleibt Vorschlag-mit-Review, auch bei guter
Accuracy. Ohne Confidence: kein ECE-Gate, aber auch keine Auto-Akzeptanz nach
Confidence-Schwelle möglich (nur Accuracy-basierte Freigabe).

## Ablauf

```
typing:build → typing:prelabel → typing:worksheet → (Kappa) → frozen
             → typing:eval --golden <frozen.json>
             → Report gegen diese Tabelle prüfen → THE-432 default-on JA/NEIN
```
