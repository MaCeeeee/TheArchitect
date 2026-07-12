# RVTM — THE-422 Eligibility-Gate + Version-Pin im Retrieval-Pfad (governedRetrieval)

**Spec / Linear:** [THE-422 — REQ-CTXGOV-001.1](https://linear.app/thearchitect/issue/THE-422) (Parent [THE-420](https://linear.app/thearchitect/issue/THE-420) / UC-CTXGOV-001)
**Plan:** `docs/superpowers/plans/2026-07-12-the-422-governed-retrieval.md`
**Created:** 2026-07-12 · **Status:** Backlog — Pre-Flight + Plan abgeschlossen, Implementierung nicht gestartet
**Verifiziert gegen:** HEAD `56fa11b` (nach THE-440 Korpus-Cutover `cca1969`)
**Blocks:** [THE-461](https://linear.app/thearchitect/issue/THE-461) (UC-LAW-002 korpusweite Discovery) · **Related:** [THE-306](https://linear.app/thearchitect/issue/THE-306) (VERLOCK Write-Side, Done), [THE-419](https://linear.app/thearchitect/issue/THE-419) (STRICT_READS-Muster, Done), [THE-423](https://linear.app/thearchitect/issue/THE-423) (ContextTrace — Handoff-Seam)
**Memory:** `progress_uc_ctxgov_001`, `feedback_preflight_check`, `feedback_complexity_assessment`, `feedback_backlog_rescore_trigger`

## Pre-Flight-Verifikation (2026-07-12) — alle 6 Spec-Behauptungen halten

| # | Behauptung (Spec 2026-07-06) | Verifikation heute | Delta |
|--|--|--|--|
| 1 | Qdrant-Payload trägt `regulationKey`+`versionHash` | ✅ `compliance-crawler/src/embeddings/qdrant.ts:66-78`; Point-ID = hash(regulationKey) → nur latest-per-key | Zeilen 67→66 verschoben |
| 2 | `QueryInput` ohne Version-Filter | ✅ `dataServer.service.ts:39-49`, `filters` ohne Version-Dimension | unverändert |
| 3 | Korpus-Read-Client mit Versions-Historie | ✅ `corpusClient.service.ts:51` unique `{regulationKey, version}`; keine Read-Methode nimmt heute Version-Param | — |
| 4 | 6 ungated AI-Konsumenten | ✅ 4 via `queryDocuments` (activity:268/connection:387/process:149/dataObject:277); **AI-Match liest Legacy `Regulation` direkt `compliance.routes.ts:127`** (umgeht Resolver!); REQGEN-Fetch in `requirements.routes.ts:143` | Legacy-Bypass = Scope-Vergrößerung |
| 5 | `CORPUS_STRICT_READS` + `corpusMiss`-Telemetrie existiert | ✅ `regulationResolver.service.ts:52/116/140` (THE-419) — umschließt aber nur `getRegulationsForProject`/`countRegulations`, NICHT die Retrieval-Pfade | Muster wiederverwendbar, Verdrahtung = Arbeit |
| 6 | `rag.routes.ts` HTTP-Surface | ✅ existiert, `/rag/query` :77-89 ohne Version-Param | — |
| — | Bestehende Teil-Implementierung? | **❌ keine** — 0 Treffer für `governedRetrieval`/`eligibleOnly`/`staleDropped`/pin-im-Retrieval → greenfield | — |

## Komplexitäts-Verdikt (Ousterhout, re-verifiziert)

Change Amplification **mittel** (Legacy-Bypass hebt es leicht: AI-Match braucht Resolver-Routing, nicht nur einen Filter — Mitigation: ein Deep Module) · Cognitive Load **mittel** · Unknown Unknowns **niedrig** (die zwei Risiken — Qdrant-single-version, Legacy-Direktlesung — sind als explizite Fakten/ACs gezogen; das *letzte* offene Unknown ist als **Chunk-0-Spike** isoliert) · Abhängigkeiten **mittel** (ADR-0004-Migration steht bevor, Kontrakt hält auf `versionHash`) · Obscurity **niedrig**. **Netto: kontrolliert additiv.**

## Traceability-Matrix (AC → Plan-Task → Verifikation → Evidence)

| AC | Anforderung | Plan-Task | Verifikationsmethode | Evidence (bei Ausführung) | Status |
|--|--|--|--|--|--|
| **AC-1** | Inputs akzeptieren `pin` + `eligibleOnly` (Default true) | Chunk 1 (Struktur-Pfad), Chunk 2 (Vektor-Pfad) | Unit: Typ-Signatur + Default-Verhalten | `governedRetrieval.service.test.ts` | ⬜ |
| **AC-2** | Stale-Chunk verworfen + `staleDropped`-Counter | Chunk 0 (Spike-Gate) → Chunk 2 | Unit: stale gedroppt, current behalten, Counter=1 | Test „governedQuery drops stale…" | ⬜ |
| **AC-3** | Pin liefert exakte Mongo-Version, nie Qdrant | Chunk 1 (`getRegulationByKeyAndHash`), Chunk 2 (Text-Override) | Unit: Pin serviert `fullText` der gepinnten Version; vanished pin → staleDropped | Tests „pin serves…" | ⬜ |
| **AC-4** | Alle 6 Konsumenten nur über das Modul | Chunk 3 (4 Generatoren + `/rag/query`), Chunk 4 (AI-Match + REQGEN) | Grep: `queryDocuments(` nur in `governedRetrieval.service.ts`; Legacy `Regulation.find()` aus Retrieval-Pfad raus | `grep -rn`, Wiring-Tests | ⬜ |
| **AC-5** | Regression grün; Pin/Stale-Tests grün | alle Chunks; Chunk 4 Step 6/7 | `npm test -w @thearchitect/server` + `npm run build` clean | CI/lokal-Log | ⬜ |

## Watch-Points / Risiken

- **R1 (Chunk-0-Spike, materiell):** Gibt der Data-Server (n8n rag-query) `versionHash` im `chunk.metadata` zurück? Payload wird gespeichert, Response-Projektion unverifiziert. Spike prüft zusätzlich **Homogenität** (tragen *alle* oder nur frische Punkte den Hash?). **Wenn nein →** Vektor-Pfad-Stale-Drop (AC-2 für die 4 Generatoren) braucht eine n8n-Workflow-Änderung als separate Prerequisite-REQ; Struktur-Pfad (AC-3/AC-4 Legacy) läuft unabhängig weiter. Vor Chunk 2 klären, Ergebnis in THE-422 dokumentieren.
- **R2:** `eligibleOnly` == „current version" (kein `status`-Feld im Korpus-Schema). draft/published = THE-426. In THE-422 **kein** `status`-Feld hinzufügen.
- **R3:** Legacy-Fallback in `compliance.routes.ts` bei Korpus-Miss muss durch die Telemetrie laufen (nicht still) — sonst ist der Bypass unsichtbar.
- **R4 (Plan-Review-Fund, blockierend gefixt):** `getCurrentVersionHashes` (`corpusClient.service.ts:138-147`) hatte einen last-wins-Bug (Zeile 144 immer true) über *unsortierte* Ergebnisse → „current" nondeterministisch, hätte AC-2 invertiert. Fix = max-version-wins (wie `listCorpusBySource`), als eigener Commit + Test **vor** dem Gate. Das Gate hängt an dieser Funktion.
- **R5 (Plan-Review-Fund, gefixt):** Legacy-Qdrant-Punkte ohne `versionHash` im Payload dürfen NICHT still gedroppt werden (sonst verschwindet Alt-Kontext → AC-5-Regression). Policy: present+mismatch = drop (stale); present-absent = **keep + `unverifiable`-Counter**. Counter quantifiziert den Re-Ingest-Bedarf.
- **R6 (Plan-Review-Fund, gefixt):** AI-Match-Input sind Legacy-`Regulation`-Docs (ohne `regulationKey`/`versionHash`), NICHT `ComplianceMapping` (= Output, leer beim Erstlauf). Brücke = `buildRegulationKey(source, paragraphNumber)` je Doc; Korpus-Miss → Legacy-Passthrough (gemessen). requirements.routes gatet **nur** `norm.source==='corpus'`, Upload-Norms passieren ungehindert.

## Handoff-Seams (nächste REQs)

- **THE-423 (ContextTrace):** Das Modul berechnet ohnehin das aufgelöste `{regulationKey, versionHash}`-Set → zurückgeben/emittieren, damit THE-423 das Evidence Bundle persistiert. Hier NICHT persistieren.
- **THE-426 (Staged Ingest):** Sobald `status:'published'` am Korpus-Schema landet, `eligibleOnly` an *einer* Stelle (dieses Modul) von „current" auf „current AND published" verschärfen.
