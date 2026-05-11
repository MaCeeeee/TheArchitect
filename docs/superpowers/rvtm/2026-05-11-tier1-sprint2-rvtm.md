# RVTM: Tier-1 Sprint 2 — WSJF Scoring (post Sprint-1 + Similarity-PoC)

**Source:** [docs/superpowers/specs/2026-05-06-bsh-feedback-capture.md](../specs/2026-05-06-bsh-feedback-capture.md) + [notebooks/predictive-poc/findings.md](../../../notebooks/predictive-poc/findings.md)
**Linear Parents:** UC-PLATEAU-001 ([THE-217](https://linear.app/thearchitect/issue/THE-217)), UC-DATA-001 ([THE-228](https://linear.app/thearchitect/issue/THE-228)), **UC-SIM-001 NEU** ([THE-238](https://linear.app/thearchitect/issue/THE-238))
**Owner:** Matze Ganzmann | **Quelle:** BP_Javis.xlsx Scoring-Schema
**Generated:** 2026-05-11 (post PoC, post Sprint-1-Implementation)

**Was sich seit dem Sprint-1-RVTM (2026-05-07) geändert hat:**
- ✅ Sprint-1: 6 REQs implementiert + 51 Tests grün — alle "Done" markiert
- 🆕 Predictive-Architecture-PoC durchgelaufen (5/5 PASS) → 5 neue REQ-SIM-001..005 unter neuer UC-SIM-001
- 🆕 Sprint 2 wird breiter: 12 REQs in 3 Tracks statt 7

**Scoring:** 0–5 Punkte je Kriterium, 7 Kriterien × 12,5% Gewicht; Status = derived. Formel: `Σ(7 × 0–5) / 35 × 100`.

---

## Sprint-1 Bilanz (alle Done)

| ID | REQ | Score | Linear | Status |
|---|---|---|---|---|
| Sprint-1-1 | REQ-PLATEAU-001 (Schema) | 77.1 | THE-218 | ✅ Done (commit 89aba3c) |
| Sprint-1-2 | REQ-DATA-001 (LLM-Service) | 82.9 | THE-229 | ✅ Done (d31d077) |
| Sprint-1-3 | REQ-DATA-002 (Schema-Validation) | 71.4 | THE-230 | ✅ Done (in d31d077) |
| Sprint-1-4 | REQ-PLATEAU-002 (PATCH-Endpoint) | 80.0 | THE-219 | ✅ Done (9f86cdd) |
| Sprint-1-5 | REQ-DATA-004 (UI + Modal) | 74.3 | THE-232 | ✅ Done (6d13a51) |
| Sprint-1-6 | REQ-PLATEAU-003 (Checkbox UI) | 80.0 | THE-220 | ✅ Done (23db890) |
| Bonus | 51 Failure-Chain-Tests | — | (in 89aba3c..f02ddc7) | ✅ Done |

---

## Top-10 Sprint-2-Recommendation (Dependency-Order)

Da REQ-SIM-005 (DSGVO Hard-Stop) BLOCKS REQ-SIM-003 (User-API), und SIM-001 (Service-Foundation) blockt alles SIM-andere, sind Dependencies dominanter als pure Score-Reihenfolge.

| # | Linear | REQ | Score | Track | Reason |
|:---:|--------|-----|:-----:|:---:|------|
| 1 | THE-239 | REQ-SIM-001 — elementSimilarity.service.ts | **80.0** | A | Foundation für ALLE anderen SIM-REQs |
| 2 | THE-243 | REQ-SIM-005 — Tenant-Isolation (DSGVO) | **88.6** | A | Hard-Stop, MUSS vor User-API stehen |
| 3 | THE-241 | REQ-SIM-003 — POST /elements/similar API | **82.9** | A | Macht Service User-facing |
| 4 | THE-240 | REQ-SIM-002 — Async re-embed Hook | **71.4** | A | Index aktuell halten |
| 5 | THE-236 | REQ-DATA-008 — Sensitivity-Tagging Color-Coding 3D | **82.9** | B | Demo-Wow + DSGVO-Vorbereitung, blockiert REQ-DATA-009 |
| 6 | THE-242 | REQ-SIM-004 — Generator-D V2 Reuse-Upgrade | **77.1** | B | Löst die Variante-B-Frage von 2026-05-07 |
| 7 | THE-231 | REQ-DATA-003 — Auto-access-Connection (jetzt mit V2 Reuse) | **77.1** | B | Verfeinert vom V1-Stand |
| 8 | THE-237 | REQ-DATA-009 — DSGVO-Hook PII → Auto-Mapping | **71.4** | B | Compliance-Story für BSH |
| 9 | THE-221 | REQ-PLATEAU-004 — Plateau-Progress-Bar (full version) | **71.4** | C | Visual upgrade (mini-progress ist schon V1 in Sprint 1) |
| 10 | THE-227 | REQ-PLATEAU-010 — RBAC ROADMAP_UPDATE | **71.4** | C | Production-Hardening |

**Sprint-2-Outcome (geplant):**
- ✅ **Track A** (Similarity-Foundation) — Service+API+Hook+Isolation einsatzbereit
- ✅ **Track B** (UC-DATA-001 V2) — Generator-D mit echtem Reuse-Mode + Sensitivity-Color + DSGVO
- ✅ **Track C** (UC-PLATEAU-001 Production-Polish) — Full-Progress-Bar + RBAC

→ Beide UCs nach Sprint 2 **Production-ready**, Foundation für Tier-3 (UC-RED-001 + UC-HARM-001) steht.

---

## REQ-SIM-001..005 Scoring-Details

| Linear | REQ | BizValue | BizRisk | ImplChall | Success | Compliance | Relations | Urgency | Score |
|--------|-----|:--------:|:-------:|:---------:|:-------:|:----------:|:---------:|:-------:|------:|
| THE-239 | REQ-SIM-001 (Service) | 5 | 4 | 3 | 4 | 3 | 5 | 4 | **80.0** |
| THE-240 | REQ-SIM-002 (Re-embed-Hook) | 4 | 3 | 4 | 5 | 2 | 4 | 3 | **71.4** |
| THE-241 | REQ-SIM-003 (Similar-API) | 5 | 3 | 5 | 5 | 3 | 4 | 4 | **82.9** |
| THE-242 | REQ-SIM-004 (Generator-D-V2) | 5 | 4 | 4 | 5 | 2 | 3 | 4 | **77.1** |
| THE-243 | REQ-SIM-005 (Tenant-Isolation) | 3 | 5 | 3 | 5 | 5 | 5 | 5 | **88.6** |

**REQ-SIM-005 ist Score-Spitze** (88.6) wegen 5/5 auf BizRisk + Compliance + Relations + Urgency. Das ist die DSGVO-Hard-Stop-REQ.

---

## Track-Aufteilung Sprint 2

```
Track A — Similarity-Foundation (~4 Tage)
  REQ-SIM-001 (Service)
    ├→ REQ-SIM-005 (Tenant-Isolation, MUSS vor 003)
    │    ├→ REQ-SIM-003 (User-API)
    │    │    └→ REQ-SIM-004 (Generator-D-V2 nutzt API)
    │    └→ REQ-SIM-002 (Re-embed kann parallel)

Track B — UC-DATA-001 Erweiterung (~3 Tage)
  REQ-DATA-008 (Sensitivity-Color 3D) [unabhängig]
  REQ-DATA-009 (DSGVO-Hook) → braucht 008
  REQ-DATA-003 (Auto-access) [unabhängig]
  REQ-SIM-004 (Generator-D-V2) → braucht Track A

Track C — UC-PLATEAU-001 Production-Polish (~1 Tag)
  REQ-PLATEAU-004 (Plateau-Progress-Bar) [unabhängig]
  REQ-PLATEAU-010 (RBAC) [unabhängig]
```

**Total ~8 Tage** = Sprint 2 wird **2 Wochen** statt der ursprünglich geplanten 1 Woche. Begründung im PoC-Findings: Similarity-Service multipliziert Wert für UC-DATA-V2 / UC-RED-001 / UC-HARM-001.

---

## Empfohlene Implementations-Reihenfolge (kombiniert)

**Woche 1:** Foundation + Polish parallel
1. REQ-SIM-001 (Service-Skelett)
2. REQ-SIM-005 (Tenant-Isolation)
3. REQ-PLATEAU-004 + REQ-PLATEAU-010 (Track C — kleine Polish-Tasks parallel zu A)

**Woche 2:** API + UC-DATA-001 V2
4. REQ-SIM-003 (User-API) + REQ-SIM-002 (Hook)
5. REQ-DATA-008 (Sensitivity-Color) + REQ-DATA-003 (Auto-access)
6. REQ-SIM-004 (Generator-D-V2 Reuse) + REQ-DATA-009 (DSGVO-Hook)

**Sprint-3 verschoben (war ursprünglich Sprint 2):** REQ-PLATEAU-005/006/007/008/009 + REQ-DATA-005/006/007 (Polish-Features, ~6 REQs)

---

## Verbleibendes Tier-1-Backlog für Sprint 3

| ID | REQ | Score |
|---|---|:-----:|
| THE-226 | REQ-PLATEAU-009 (Audit-Trail-Filter im Viewer) | 68.6 |
| THE-225 | REQ-PLATEAU-008 (Element-Status-Sync mit Confirm) | 65.7 |
| THE-235 | REQ-DATA-007 (CRUD-Matrix-Export) | 62.9 |
| THE-222 | REQ-PLATEAU-005 (Header-Progress + Jump-to-Next) | 60.0 |
| THE-233 | REQ-DATA-005 (Bulk-Mode for whole project) | 60.0 |
| THE-223 | REQ-PLATEAU-006 (3D-Check-Badge) | 54.3 |
| THE-224 | REQ-PLATEAU-007 (Filter-Toggle) | 54.3 |
| THE-234 | REQ-DATA-006 (Data-Lineage-View) | 54.3 |

→ 8 REQs für Sprint 3 (~1-2 Wochen). Tier-1 ist nach Sprint 3 vollständig.

---

## Risiken Sprint 2

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Voyage-API-Cost vs lokales Inference (Decision-Punkt in REQ-SIM-001) | hoch | mittel | Spike am Anfang Woche 1 — entscheidet Restweg |
| Tenant-Isolation-Bug → DSGVO-Vorfall | niedrig (REQ-SIM-005) | sehr hoch | 5 explizite Tests in REQ-SIM-005 + Code-Review |
| Re-Embed-Hook erzeugt zu viele Calls (Cost / Rate-Limit) | mittel | mittel | Skip bei nur-Position-Update + Batch-Window |
| Generator-D V2 UI bricht V1-Modal | niedrig | mittel | Feature-Flag (REQ-SIM-004 AC-5) |
| Sprint 2 schafft die 12 REQs nicht in 2 Wochen | mittel | mittel | Track C ist Schmuck, kann notfalls in Sprint 3 |

---

## Was als nächstes ansteht

1. **User-Confirmation** der Sprint-2-Reihenfolge — 12 REQs ist viel
2. **Spike Decision Voyage-API vs lokales Inference** (1-2h, am Anfang Woche 1)
3. **Implementation-Plan für REQ-SIM-001** (kleinster, foundationsstärkster Task) → entweder direkt subagent-driven-development oder erst writing-plans-Skill
4. Sprint 2 starten

**Aktueller Stand 2026-05-11 11:47:** Sprint 1 deployed-ready (8 Commits), PoC durch (commit 899b5f0), Sprint-2-Backlog mit 12 REQs aufgesetzt, Linear-Issues THE-238..243 angelegt, RVTM aktualisiert.
