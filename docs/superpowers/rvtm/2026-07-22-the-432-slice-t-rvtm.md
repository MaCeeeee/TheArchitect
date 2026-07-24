# RVTM — Slice T Typing-Batch (THE-432)

**Plan:** docs/superpowers/plans/2026-07-22-the-432-slice-t-typing-batch.md
**Spec:** docs/superpowers/specs/2026-07-19-onto-reqharm-path-design.md §4
**Datum:** 2026-07-22 · **Basis:** Branch `mganzmanninfo/the-421-onto-full` ab `082759f` (Golden frozen)

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

| REQ | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **AC-1** | Jeder Vorschlags-Record trägt volle Provenance (regulationKey/versionHash am Doc + modelId, promptVersion, ontologyVersion, typedAt, status) | Task 4 | Unit: `assembleTypingSuggestion` vollständig; Stichprobe im Lauf (Task 7) | ⬜ |
| **AC-2** | OOV-Drop + Telemetrie (Fantasie-Label → verworfen, gezählt) | Task 4 | Unit: OOV → `droppedAxes` + Achse offen; Summary-Zähler | ⬜ |
| **AC-3** | Golden-Baseline ≥ dokumentierter Schwelle VOR default-on | Task 3, 6 | Baseline-Report vs. `typing-release-gates.md`; Gate-2 klassen-spezifisch (scope-applicability F1 ≥ 0,80) | ⬜ |
| **AC-4** | Menschliche Entscheidung mutiert nie den Vorschlag; append-only-Disziplin | Task 4 | Unit: `confirmed`/`rejected` wird NIE überschrieben, auch nicht mit `--force` | ⬜ |
| **AC-5** | Instruct-Modell-Guardrail dokumentiert am Service | Task 4 | Review: `TYPING_BATCH_MODEL`-Kommentar (OntoLearner §5) | ⬜ |
| **MV-1** | Messvalidität: Batch-Prompt Byte-identisch zum Eval-Prompt | Task 1 | Struktur: EIN shared-Modul; Bestands-Suiten unverändert grün | ⬜ |
| **MV-2** | Prompt der Rubrik nachgezogen (B3a), versioniert | Task 2 | Unit: Präzedenz-Phrasen im Prompt; `TYPING_PROMPT_VERSION` gebumpt | ⬜ |
| **MV-3** | Fehlgeschlagene Messung ≠ Label (3× leer → kein Write, Fehlliste, Exit 1) | Task 4 | Unit: Retry-Helfer; Summary | ⬜ |
| **MV-4** | Idempotenz/Resume: identisches (prompt, ontology, model) → skip; Versionswechsel → Re-Lauf | Task 4 | Unit: `shouldSkipDoc` | ⬜ |
| **ADD-1** | Rein additiv: Schema-Erweiterung bricht keine Bestands-Suite | Task 5 | Beide Paket-Suiten grün ohne Anpassung | ⬜ |

## Menschliche Tore

| Tor | Wo | Entscheid |
|---|---|---|
| 🧑 1 | Task 7 | Batch-Lauf auf Server B (Coolify-Redeploy, Env, Ausführung) |
| 🧑 2 | Task 7 | Gate-2-Entscheid auf Basis des Nachweis-Dokuments |

## Offene Punkte

- **O-4 Merge-Reihenfolge:** Batch-Lauf setzt gemergten PR #89 voraus (Coolify deployt master).
- **O-5 Wiederkehrender Batch:** Neu gecrawlte §§ nachtypisieren (Scheduler) — bewusst NICHT in diesem Slice; Ticket-Notiz bei THE-432.
