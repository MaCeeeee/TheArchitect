# EVAL_BASELINE — Compliance-Mapping (THE-381)

> Dieses Dokument hält die **eine Zahl** fest, gegen die jede Prompt-/Modell-
> Änderung verglichen wird. Es wird NUR aktualisiert, wenn bewusst eine neue
> Baseline gesetzt wird (z. B. nach Golden-Set-Freeze oder Modellwechsel) —
> nicht bei jedem Lauf.

## Status: ✅ BASELINE GESETZT (Requirement-Ebene, 2026-07-05)

- [x] Golden-Set gelabelt — **Requirement-Ebene** (ISO 29148), 12 System-
      Requirements über 9 DSGVO-Artikel + Hard Negatives (THE-379)
- [x] Doppel-Labeling: **Cohen's Kappa 0,709** (Mensch vs. Prädikat-Regel),
      0,805 (Matthias vs. finale adjudizierte Gold-Fassung) — RUBRIC.md §7
- [x] Golden-Set `frozen: true` (`requirements.self.v1.json` → `mapping.req-self-v1`)
- [x] `eval:mapping --models haiku,sonnet,opus` live gelaufen (mit + ohne Facts)

## Baseline (E1, eingefroren `req-self-v1`)

Substrat: DSGVO → 12 architektursprachliche Requirements → Element-Mapping
(Stufe B), menschlich adjudiziertes Gold. **Referenzdecke:** deterministischer
Facts-Regel-Mapper F2 **99,7 %** (die Aufgabe ist mit strukturierter Logik
nahezu lösbar; die LLM-Lücke ist das Thema).

**MIT Facts** (Kandidaten-Beschreibung trägt `holds …`, `ops …`)

| Modell | Precision | Recall | F2 | Empty-Set | OMR | Cap-Hit |
|---|---|---|---|---|---|---|
| Haiku 4.5 | 58,3 % | 50,7 % | 52,1 % | 0 % | 0,83 | 100 % |
| Sonnet 5 | 56,7 % | 49,3 % | 50,6 % | 0 % | 0,83 | 100 % |
| **Opus 4.8** | 61,7 % | 53,6 % | **55,1 %** | 0 % | 0,83 | 100 % |

**OHNE Facts** (identisches Gold, Facts aus der Beschreibung entfernt)

| Modell | Precision | Recall | F2 | Empty-Set |
|---|---|---|---|---|
| Haiku 4.5 | 51,7 % | 44,9 % | 46,1 % | 0 % |
| Sonnet 5 | 51,7 % | 44,9 % | 46,1 % | 0 % |
| Opus 4.8 | 52,5 % | 44,9 % | 46,3 % | 0 % |

## Befunde

1. **Facts heben F2 messbar:** +6,0 (Haiku) / +4,5 (Sonnet) / +8,8 (Opus) —
   validiert den Ontologie-Ansatz (THE-411) empirisch.
2. **Ontologie > Modellklasse:** Haiku **mit** Facts (52,1) > Opus **ohne**
   (46,3). Modellsprung ~3 F2-Punkte, Facts ~6–9. „Welches Modell reicht?" →
   das billigste, wenn der Kontext strukturiert ist.
3. **Recall-Decke ~50 % ist ein CAP-Artefakt:** `MAX_MAPPINGS_PER_REGULATION=5`,
   aber Requirements brauchen 9–10 Elemente → max. Recall ≈ 55 %. Cap-Hit 100 %.
   Nächstes Experiment: Cap anheben, Recall neu messen.
4. **Empty-Set 0 %:** kein Modell gibt je „nichts" zurück (3 Gap-Requirements) →
   stärkstes Argument für die Kaskade mit Veto (THE-401).

## Regeln

1. **F2 und Recall sind die Leitmetriken** (übersehenes Gesetz = audit-kritisch).
2. Eine Änderung gilt erst als Verbesserung/Regression, wenn sie **außerhalb
   des Bootstrap-CI** der Baseline liegt (statistische Ehrlichkeit).
   CI (Opus, mit Facts): Recall 41,5–66,7 %, F2 41,7–66,3 %.
3. Jede neue Baseline = neue Zeile in der Historie unten, alte bleibt stehen.

## Historie

| Datum | Set | Modell | Recall | F2 | Anlass |
|---|---|---|---|---|---|
| 2026-07-05 | req-self-v1 (mit Facts) | Opus 4.8 | 53,6 % | 55,1 % | Erste eingefrorene Baseline (Requirement-Ebene) |
| 2026-07-05 | req-self-v1 (mit Facts) | Haiku 4.5 | 50,7 % | 52,1 % | Kosten-Referenz (Haiku+Facts > Opus-ohne) |
| 2026-07-05 | req-self-v1 (ohne Facts) | Opus 4.8 | 44,9 % | 46,3 % | Facts-Kontrast (Ontologie-Effekt) |
