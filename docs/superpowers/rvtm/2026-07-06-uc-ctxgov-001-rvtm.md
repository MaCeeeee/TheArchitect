# RVTM — UC-CTXGOV-001 Verifiable Context Governance (governed AI-Retrieval über dem Norm-Korpus)

**Spec / Linear Feature:** [THE-420 — UC-CTXGOV-001](https://linear.app/thearchitect/issue/THE-420)
**Created:** 2026-07-06 · **Status:** Backlog — Pre-Flight abgeschlossen (Paper-Analyse + Linear-Abgleich + Codebase-Scan), Implementierung nicht gestartet
**Quelle:** arXiv-Radar-Fund 2026-07-06 → Paper **ContextNest: Verifiable Context Governance for Autonomous AI Agents** ([arXiv:2607.02116](https://arxiv.org/abs/2607.02116), Referenz-Impl. Apache-2.0: PromptOwl/context-nest)
**Memory:** `progress_uc_ctxgov_001`, `feedback_requirement_scoring`, `feedback_complexity_assessment`, `feedback_asilomar_ai_principles`, `strategy_trust_spine`
**Verwandt:** [THE-306](https://linear.app/thearchitect/issue/THE-306) (VERLOCK, Write-Side-Pin — Done), [THE-368](https://linear.app/thearchitect/issue/THE-368) (Korpus-Read-Path), [THE-378](https://linear.app/thearchitect/issue/THE-378)/[THE-384](https://linear.app/thearchitect/issue/THE-384) (UC-EVAL, LLM-Trace), [THE-390](https://linear.app/thearchitect/issue/THE-390)/[THE-412](https://linear.app/thearchitect/issue/THE-412) (Canon/ADR-0004), [THE-339](https://linear.app/thearchitect/issue/THE-339) (MCP-Server), [THE-308](https://linear.app/thearchitect/issue/THE-308) (REGDIFF), [THE-361](https://linear.app/thearchitect/issue/THE-361)/[THE-362](https://linear.app/thearchitect/issue/THE-362) (AUTOCRAWL/Scheduler), [THE-365](https://linear.app/thearchitect/issue/THE-365) (Crawl-Qualität)

> Scoring-Modell wie bestehende RVTMs: 7 Kriterien je 0–5, **Score = Σ/35·100**. (`Status` aus dem 8-Kriterien-Memory ist Einordnung, nicht Teil der Zahl.)

## Driver (warum)

The Architect erzeugt AI-Aussagen mit Compliance-Gewicht (AI-Match-Mappings, generierte Requirements, Gap-/Oracle-Analysen), kann aber vier Auditor-Kernfragen nicht beantworten: **Welche Gesetzes-Version hat diesen Output informiert? War sie aktuell/freigegeben? Kommt bei gleicher Frage dasselbe heraus? Ist der Korpus seither beweisbar unverändert?** Das Paper formalisiert genau das als „Context Governance" (6 Properties: Provenance, Version Identity, Integrity, Deterministic Selection, Traceability, Temporal Consistency) — als Schicht **unter** RAG, nicht als RAG-Ersatz. Empirie: Stale-Version-Attack 97 % vs. 93–90 % Answer-Quality bei ~⅓ Token-Kosten (E1); dense+HNSW-Retrieval (= unser Qdrant-Stack) nicht-deterministisch auf 80 % der Queries, mean Jaccard 0,611 (E2). Für die Trust-Spine („Notar-Prinzip") ist das die fehlende Wissens-Ebene: VERLOCK pinnt beim Schreiben, CTXGOV governt das Lesen.

## Kern-Befunde aus dem Pre-Flight (Codebase-Scan 2026-07-06)

1. **Der halbe UC existiert schon:** Qdrant-Payload trägt `regulationKey`+`versionHash` (`compliance-crawler/src/embeddings/qdrant.ts:67-78`) — es filtert nur niemand darauf. Korpus append-only-fähig (unique `{regulationKey, version}`), Drift-Detection + Telemetrie-Muster (THE-419) vorhanden.
2. **Kein AI-Konsument ist governed:** `QueryInput` (`dataServer.service.ts:39-49`) ohne Version-/Eligibility-Filter; 4 RAG-Konsumenten + AI-Match + REQGEN ungefiltert; kein Kontext-Trace (REQGEN ohne Audit-Eintrag, Oracle-`_audit` nur in-memory).
3. **Qdrant hält nur die aktuelle Version** (Punkt-ID = hash(regulationKey), Overwrite bei Recrawl) → Point-in-Time IMMER über Mongo-Korpus; Vektor-Index bleibt ableitbar (ADR-0002). **Watch-Point des UC.**
4. **Crawler-Output ist sofort live** — kein draft/published-Gate; THE-365 (EUR-Lex-Tabellen-Müll im Korpus) ist der eingetretene Beweisfall.

## Scoring (alle 7 REQs)

| REQ | Linear | BizValue | BizRisk | Feasibility | Success | Compliance | Relations | Urgency | **Score** |
|--|--|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **001.1** Eligibility-Gate + Version-Pin im Retrieval (Read-Side-VERLOCK) | THE-422 | 4 | 4 | 5 | 5 | 5 | 5 | 3 | **88,6** |
| **001.2** ContextTrace — Kontext-Audit-Trace pro AI-Output | THE-423 | 4 | 4 | 4 | 4 | 5 | 5 | 3 | **82,9** |
| **001.3** SHA-256-Hash-Chain auf Korpus-Versionshistorie | THE-424 | 3 | 3 | 4 | 4 | 5 | 4 | 2 | **71,4** |
| **001.4** Korpus-Checkpoints + Point-in-Time (as-of) | THE-425 | 4 | 3 | 3 | 4 | 5 | 4 | 2 | **71,4** |
| **001.6** Deterministischer Selektor-Pfad + Determinismus-Suite | THE-427 | 4 | 3 | 4 | 4 | 4 | 4 | 2 | **71,4** |
| **001.5** Staged Ingest — draft→published mit Human-Publish | THE-426 | 3 | 4 | 3 | 4 | 5 | 3 | 2 | **68,6** |
| **001.7** MCP-Kontext-Governance (an THE-339) | THE-428 | 3 | 3 | 4 | 4 | 4 | 5 | 1 | **68,6** |

**UC-Aggregat (Parent THE-420): 82,9** (4·4·4·4·5·5·3). Begründungen je REQ in der jeweiligen Issue-Description (Source of Truth für Status = Linear).

## WSJF-Reihung vs. Ausführungsreihenfolge

Seltener Glücksfall: **Score-Reihung ≈ Baureihenfolge** — der wertvollste Slice (.1, 88,6) ist zugleich der billigste (Qdrant-Payload-Filter existiert schon).

- **001.1 zuerst:** sofortiger Genauigkeitsgewinn (Stale-Drop), etabliert das `governedRetrieval`-Deep-Module, durch das alles Weitere läuft.
- **001.2 direkt danach:** ab dann sammelt jedes AI-Feature Evidenz-Historie; Join-Partner THE-384 ist gerade In Progress — Koordination lohnt.
- **001.3 → 001.4 → 001.5 als Kette** (harte Blocker in Linear: THE-425 ← THE-424, THE-426 ← THE-425): Chain vor Checkpoint (Cross-Chain-Binding), Publish-Gate triggert Checkpoints.
- **001.6 parallel ab .1-Merge** (braucht nur das Modul; AC-5-Checkpoint-Pin interim via versionHash-Set).
- **001.7 gekoppelt an THE-339** (blockedBy gesetzt); der Design-Constraint gilt ab sofort, gebaut wird mit dem MCP-Server.

**Empfohlene Sequenz:** 001.1 → 001.2 → 001.3 → 001.4 → 001.5; 001.6 parallel; 001.7 mit THE-339.

## Traceability Matrix

| REQ | Requirement (Kurzform) | Verification | Status |
|--|--|--|--|
| **001.1** (THE-422) | `governedRetrieval`-Modul: eligibleOnly-Default, Version-Pin (gepinnter fullText aus Mongo-Korpus, nie Qdrant), Stale-Drop + `staleDropped`-Telemetrie; alle 6+ AI-Konsumenten kanalisiert | AC-1..5: Unit-Tests stale-drop/pin/regression; grep-Beweis „kein Konsument am Gate vorbei" | Backlog · **next** |
| **001.2** (THE-423) | Append-only `ContextTrace` {feature, consumed[{regulationKey, versionHash, retrievalMethod, checkpointNo}], model, promptVersion, llmTraceRef}; Outputs tragen contextTraceId; Reverse-Lookup | AC-1..6: Trace pro AI-Call vorhanden; Reverse-Lookup-Query liefert Outputs zu {key, hash}; Oracle-_audit persistiert | Backlog |
| **001.3** (THE-424) | Append-only-Versionierung verifiziert (AC-1!), `chainHash` (JCS/RFC-8785, Genesis-Sentinel) in shared, Migration, `corpus/verify`-Endpoint, CrawlLog mit Versions-Deltas | AC-1..6: Fixture-Manipulation → Verify benennt Bruchpunkt; 2× Migration idempotent | Backlog |
| **001.4** (THE-425) | Append-only `CorpusCheckpoint` (cpHash-Kette, Cross-Chain-Binding), Hook in Scheduler/Publish, as-of-Query mit fullText-Rekonstruktion aus Mongo | AC-1..6: §8.4-Rebuild-Test (Rebuild ≡ Original); as-of-Roundtrip | Backlog · blockedBy 001.3 |
| **001.5** (THE-426) | Crawler schreibt `staged`; nur `published` AI-eligible/embedded; Publish-API+Queue-UI (Notar-Muster THE-328), `publishedBy ≠ 'crawler'` am API-Layer, Auto-Publish nur als auditierte Policy; Bestand→published-Migration | AC-1..7: THE-365-Regressionsfall bleibt staged; Separation-of-Duties-Test; Publish triggert Checkpoint+Re-Embed | Backlog · blockedBy 001.4 |
| **001.6** (THE-427) | `getProvisions`-Selektor-Pfad, REQGEN/WFCOMP ausschließlich darüber; Pfad-Klassifikation direct/selector/dense dokumentiert; Determinismus-Suite (20×, Jaccard 1.0) in CI; Eval-Läufe pinnen Checkpoint | AC-1..5: `context-determinism.test.ts` grün; Eval-Harness-Hook | Backlog |
| **001.7** (THE-428) | MCP-Results mit Korpus-Bezug tragen {regulationKey, versionHash, checkpointNo, contextTraceId}; MCP-Konsum erzeugt ContextTrace; read-only `corpus_verify`-Tool | AC-1..4: Constraint an THE-339 verankert; Tool-Tests mit Server | Backlog · **blockedBy THE-339** |

Implizit für jeden REQ: Build grün, keine Regression in bestehenden Compliance-Tests (50/50-Baseline aus THE-419 beachten).

## Komplexität (Ousterhout)

- **Change Amplification: mittel** — 6+ AI-Call-Sites müssen durchs Gate/Trace. Mitigation: EIN Deep-Module `governedRetrieval` (+ `recordContextTrace`-Helper); Konsumenten-Diff = Aufruf-Umstellung, keine eigene Logik.
- **Cognitive Load: mittel** — drei neue Konzepte (Eligibility, Chain, Checkpoint), aber 1:1 aus einer publizierten Spec ableitbar (Paper §§4/7/8/9 als externe Doku); Determinismus-Kontrakt wird am Modul dokumentiert.
- **Unknown Unknowns: niedrig–mittel** — die zwei erkannten Fallen sind als explizite Verifikations-ACs gezogen: (a) Crawler-Versions-Semantik append vs. overwrite (001.3 AC-1 zuerst!), (b) Qdrant-Single-Point-Semantik (Pin/as-of nie gegen Qdrant).
- **Abhängigkeiten: mittel** — ADR-0004-Migration (workId/corpusRef) steht bevor; Leitplanke: CTXGOV kontrahiert ausschließlich auf `{regulationKey, versionHash}`, das per ADR-0004 E3 kontraktidentisch bleibt → keine Doppel-Migration. THE-384-Schema früh abstimmen (llmTraceRef).
- **Unklarheiten: niedrig** — Pfad-Klassifikation direct/selector/dense macht bisher implizite Retrieval-Garantien explizit.

**Verdikt:** kontrolliert additiv; kollabiert heute verstreute Ad-hoc-Retrieval-Pfade in ein explizites Modul. **Haupt-Watch-Point:** Qdrant nie historisieren — Point-in-Time lebt ausschließlich im Mongo-Korpus (ADR-0002: Vektor-Index = ableitbares Derivat).

## Adaptions-Prinzip (was wir bewusst NICHT bauen)

Kein Markdown-Vault, kein `contextnest://`-URI-Schema, keine Selector-Grammatik, keine Föderation, kein eigenes Stewardship-Rollenmodell (Reuse RBAC + Notar/Certification-Muster THE-328), keine Qdrant-Historisierung. Wir übernehmen die **6 Properties als Anforderungen** an den bestehenden Korpus-Stack — Identität bleibt ADR-0004-Spine (heute regulationKey/versionHash, morgen corpusRef).

## Offene Punkte / nächste Schritte

1. **THE-422 (001.1) als nächsten Build-Slice einplanen** — höchster Score im CTXGOV-Set; Achtung: globale Bau-Reihenfolge THE-419 (PR #34 mergen) → THE-390 P1 → THE-412 bleibt davon unberührt; 001.1 ist unabhängig davon baubar (nur versionHash-Kontrakt).
2. **THE-384-Koordination:** ContextTrace-Schema (llmTraceRef/traceId) mit dem laufenden REQ-EVAL-001.6-Build abstimmen, bevor 001.2 startet — sonst zwei Trace-Welten.
3. **Re-Score-Trigger** (`feedback_backlog_rescore_trigger`): (a) wenn THE-339 (MCP) startet → 001.7 Urgency neu; (b) wenn 001.4 fertig → 001.5/001.6 Feasibility/Relations neu; (c) wenn ein Kunden-Audit terminiert wird → gesamte Familie Urgency rauf.
4. **Backlog-Einordnung:** THE-422 (88,6) überholt UC-WFCOMP-001 (82,9) als Score-Spitzenreiter — bewusst, weil es die Genauigkeit ALLER Compliance-AI-Features härtet; menschliche Bestätigung der Reihung steht aus (Asilomar: Score schlägt vor, Mensch entscheidet).
5. **Paper-Limitationen fair einordnen** (in Diskussionen nicht überverkaufen): E1 nur gegen BM25 (dense Baseline ausstehend), synthetischer 30-Query-Adversarial-Suite, Single-LLM-Judge — die Determinismus-Zahlen (E2) sind dagegen strukturell robust.
