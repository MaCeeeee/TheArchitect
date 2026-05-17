---
aliases:
  - Predictive Architecture Strategy
  - Predictive Architecture
  - Strategy Doc
tags:
  - strategy
  - thearchitect
  - predictive-architecture
  - vision
status: living-doc
type: strategy
created: 2026-05-06
owner: Matze Ganzmann
source_doc: docs/strategy/2026-05-06-predictive-architecture.md
---

# Predictive Architecture Strategy

> [!note] Diese Note ist ein **Index/Stub** auf das eigentliche Strategy-Doc.
> Volltext: [`docs/strategy/2026-05-06-predictive-architecture.md`](../strategy/2026-05-06-predictive-architecture.md)

## Kern-Hypothese

Das **LLM-Prinzip** (semantische Embedding-Vektoren) lässt sich auf Enterprise-Architektur-Modelle übertragen und macht eine ganze Klasse neuer Features möglich, die kein existierendes EAM-Tool bietet.

## Drei strategische Optionen

| Option | Was | Aufwand | Status |
|---|---|---|---|
| 🟢 **A — Embedding-Foundation** | Element-Description → Vektor → Similarity-Search | mittel | ✅ Sprint-2 live ([[UC-SIM-001 Similarity Foundation]]) |
| 🟡 **B — Pattern-Mining** | Statistik über Korpus + Anomalie-Detection | hoch | 📅 Gate 3 (≥500 Projekte) |
| 🔴 **C — GNN-basiert** | Graph Neural Networks für strukturelle Patterns | sehr hoch | 📅 frühestens 2027 |

## Multiplier auf bestehende UCs

| UC | Multiplier-Effekt | Status |
|---|---|---|
| **UC-RED-001** Redundanz | Description-Embedding ist genau das was UC-RED braucht | ✅ Live ([[UC-RED-001 Redundancy Detector]]) |
| **UC-HARM-001** Harmonisierung | Cross-Project semantic-matching | 📅 Sprint 4 ([[UC-HARM-001 Cross-Project Harmonisierung]]) |
| **UC-DATA-001 V2** Generator-Reuse | Similarity-Check vor Element-Create | ✅ Live (Sprint 2 Track B) |
| **Auto-Heal-Connections** | Vorschläge basierend auf "ähnlichen verbundenen Patterns" | 📅 Sprint 4-5 |
| **Activity-Generator (D)** | Few-shot-Prompts mit semantisch ähnlichen Beispielen | 📅 noch nicht |

## Gate-Modell

```
Gate 1 ✅ Quick-PoC im Notebook (2-3h)              2026-05-10
Gate 2 ✅ Production-Embedding (UC-SIM-001)          2026-05-12
Gate 3 📅 Pattern-Mining wenn Korpus >500 Projekte    ~Q1 2027
Gate 4 🚫 GNN wenn Korpus >10.000 Projekte            ~Q3 2027 oder später
```

## Reihenfolge-Empfehlung (aus Doc, 2026-05-06)

1. ✅ Tier-1-Sprint vorbereiten
2. ✅ Quick-PoC Option A
3. ✅ Nach Tier-1 (Sprint 3+): Embedding-Production
4. 📅 Sprint 4-5: UC-RED-001 oder UC-HARM-001 mit Embedding-Backbone
5. 🚫 2027: Re-evaluate, brauchen wir GNN?

**Aktueller Stand:** Schritte 1-3 done, Schritt 4 in progress (UC-RED-001 ✅ Sprint 3, UC-HARM-001 📅 Sprint 4).

## DSGVO / Tenant-Isolation

> [!warning] Architektur-Constraint
> Embeddings sind **Workspace-isoliert** (REQ-SIM-005 Hard-Stop):
> jeder Projekt-Workspace hat eine eigene Qdrant-Collection.
> Cross-Project-Features (UC-HARM-001) brauchen einen **expliziten Architektur-Spike** der Datenschutz nicht bricht.

## Verlinkungen

- [[UC-SIM-001 Similarity Foundation]]
- [[UC-RED-001 Redundancy Detector]]
- [[UC-HARM-001 Cross-Project Harmonisierung]]
- [[BSH-ESG-Compliance-Transformation]]
