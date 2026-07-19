# RVTM — THE-423 ContextTrace (REQ-CTXGOV-001.2)

**Plan:** docs/superpowers/plans/2026-07-19-the-423-contexttrace.md
**Linear:** THE-423 · Parent THE-420 (UC-CTXGOV-001) · Score 82,9
**Datum:** 2026-07-19 · **Commit-Basis:** 2245d73

Status-Legende: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

**Umsetzungs-Stand 2026-07-19: ALLE Tasks gebaut + getestet (16/16).** Commits `24b4743`→`391b201` auf Branch `mganzmanninfo/the-423-contexttrace`. Alle AC-Zeilen unten = ✅ (Unit/Component-Tests grün, keine neuen Regressionen ggü. der dokumentierten Flaky-Baseline, TSC/Build shared+server+client sauber). Offene, bewusst additive Follow-ups: Node-Stempel für 3 von 4 Neo4j-Generatoren (activity/process/dataobject — bräuchten Client-Round-Trip; connection ist gestempelt) → separates Ticket. Aktivierung via `CONTEXT_TRACING_ENABLED=true` (+ Prod-compose-Mapping) ist ein Deploy-Schritt, kein Code.

| REQ | Anforderung (aus AC) | Plan-Task(s) | Verifikationsmethode | Status |
|---|---|---|---|---|
| **AC-1** | Append-only `ContextTrace`-Model mit `{requestId, feature(10 Werte), projectId, userId?, consumed[{regulationKey, versionHash, sectionRef?, retrievalMethod, score?, checkpointNo?}], model?, promptVersion?, llmTraceRef?, createdAt}` | Task 1 (Typen), Task 2 (Model) | Unit: Schema akzeptiert Minimal- + Voll-Doc; `timestamps.updatedAt=false`; Grep-Guard „kein update/delete auf ContextTrace" | ⬜ |
| **AC-1a** | `citedByJudge` auf `consumed[]` (Discovery-Diagnose „vorgelegt vs. zitiert") | Task 1, Task 5 | Unit: nach Judge ist `citedByJudge` genau für `verdict.keyParagraphs` true | ⬜ |
| **AC-1b** | Oracle-`audit`-Payload ungekappt (Source-of-Truth, anders als AiTrace-4000er-Cap) | Task 1, Task 2, Task 10 | Unit: `audit.rawResponse` mit 9000 Zeichen bleibt vollständig | ⬜ |
| **AC-2** | EIN `recordContextTrace`-Helper im governedRetrieval-Modul; Call-Sites reichen nur die zurückgegebene ID durch | Task 3 (Recorder), Task 4 (3 getracte Wrapper) | Unit: Wrapper bauen `consumed[]` aus dem gehaltenen Set; Konsumenten enthalten keine eigene Trace-Bau-Logik (Review-Check) | ⬜ |
| **AC-2a** | Best-effort/env-gated, wirft nie (spiegelt `recordAiTrace`) | Task 3 | Unit: deaktiviert → kein Write, gibt requestId zurück; DB-Fehler → kein Throw | ⬜ |
| **AC-3** | Optionales `contextTraceId` (additiv) auf `ComplianceMapping` + generierten `ComplianceRequirement`s | Task 6 (mapping), Task 7 (reqgen) | Unit: gemappte/generierte Docs tragen `contextTraceId`; Alt-Docs ohne Feld gültig | ⬜ |
| **AC-3a** | Erweiterung des additiven Stempelns auf `LawDiscoveryFinding` + `OracleAssessment` + Neo4j-`ArchitectureElement` (vollständige Konsumenten-Deckung) | Task 5, Task 9, Task 10 | Unit/Integration: je Konsument trägt der Output die `contextTraceId` | ⬜ |
| **AC-4** | Oracle-`_audit` (heute in-memory verworfen) erstmals persistiert, über denselben Mechanismus | Task 10 | Integration: nach Assessment existiert `ContextTrace(feature:'oracle', audit:{...})`, `OracleAssessment.contextTraceId` verweist darauf | ⬜ |
| **AC-5** | Reverse-Lookup „alle Outputs, die von regulationKey X @ versionHash Y informiert wurden" | Task 2 (Multikey-Index), Task 12 (Service+Endpoint) | Unit: `findOutputsByRegulation` joint Traces→gestempelte Outputs (Mongo: mappings/requirements/findings **+ Neo4j: ArchitectureElement-Knoten**), gruppiert nach feature; Oracle bewusst ausgeschlossen (consumed:[], nur per traceId erreichbar); Index vorhanden | ⬜ |
| **AC-6** | `llmTraceRef` verbindet ContextTrace ↔ AiTrace ↔ Entscheidung (Join mit THE-384) | Task 5, Task 6 | Unit: `ContextTrace.llmTraceRef == recordAiTrace-requestId` desselben Laufs (mapping, discovery); DD-5-Grenze: leer wo kein AiTrace | ⬜ |
| **AC-2/Uniformität** | Alle Korpus-Konsumenten über die governedRetrieval-Naht (gap heute ungoverned) | Task 8 | Regression: Gap-Ausgabe identisch über governed vs. roh (aktueller Korpus); Trace geschrieben | ⬜ |
| **AC-6/Client** | Rückwärts-Belegbarkeit im Produkt sichtbar (Evidence Bundle einlösbar) | Task 13, Task 14, Task 15 | Component: Discovery-Expander „vorgelegt vs. zitiert"; Oracle-Audit-View; api.ts-Methoden | ⬜ |
| **Non-Reg** | Rein additiv, keine bestehenden Suiten rot, TSC ×3 grün | Task 16 | Full-Suite server+client, `build` shared/server/client, Final-Review | ⬜ |

## Explizit ausgegrenzt (nicht in dieser RVTM, additiv später)
- `recordAiTrace` für reqgen/oracle/rag/Generatoren nachrüsten → **THE-384**.
- `provisionKind`/`sectionRef`-Typisierung befüllen → **THE-421** (Trace zeigt das Feld, berechnet es nicht).
- REGDIFF-Re-Assess-Logik auf Basis von AC-5 → **THE-308**.
- `checkpointNo`-Befüllung → wenn Eval-Checkpoints existieren.

## Provenance-Kette (Belege dieser Umsetzung)
- Codebase-Scan @ 2245d73 (governedRetrieval-Surface, 10 Konsumenten, recordAiTrace-Aufrufer, gap-ungoverned, oracle-`_audit`).
- Prod-Evidenz 2026-07-19 (Hand-ContextTrace BSH: CRA nur `art-16`, nicht Scope-Art-2) → Kommentare an THE-423 + THE-421.
