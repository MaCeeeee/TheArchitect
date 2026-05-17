---
aliases:
  - MOC
  - Map of Content
  - Features Index
tags:
  - moc
  - index
type: map-of-content
owner: Matze Ganzmann
---

# 🗺️ TheArchitect — Map of Content

> [!info] Start here
> Diese Note ist der zentrale Index aller Feature-Specs, Strategy-Docs und Demo-Projekte in diesem Vault.

## 🎯 Strategische Vision

- [[Predictive Architecture Strategy]] — die LLM-für-EAM Hypothese, drei strategische Optionen, Gate-Modell

## 🚀 Production-Live Features

| Use Case | Sprint | Status | Pitch-Wert |
|---|---|---|---|
| [[UC-SIM-001 Similarity Foundation]] | Sprint 2 | ✅ Live seit 2026-05-12 | Foundation — alle Tier-3-UCs bauen drauf |
| [[UC-RED-001 Redundancy Detector]] | Sprint 3 | ✅ Live seit 2026-05-16 | "LeanIX/BiZZdesign/Mega haben das nicht" |
| **UC-DATA-001 V2** Generator-D Reuse | Sprint 2 | ✅ Live | Keine Duplikate mehr durch AI-Generator |

## 📅 Geplant

| Use Case | Sprint | Status | Notes |
|---|---|---|---|
| [[UC-HARM-001 Cross-Project Harmonisierung]] | Sprint 4 | 📅 Geplant | Spike vorab nötig — Cross-Workspace ohne DSGVO-Bruch |

## 🧪 Demo-Projekte

- [[BSH-ESG-Compliance-Transformation]] — Hauptpitch-Demo für BSH Home Appliances Group

## 📊 Querschnitts-Themen

### Compliance & Audit
- DSGVO Art. 30 — Verarbeitungsverzeichnis (Audit-Log in UC-RED-001)
- REQ-SIM-005 — Tenant-Isolation als Hard-Stop
- CSRD, LkSG, CSDDD — getrieben durch BSH-Demo

### Architektur-Prinzipien
- **Tenant-Isolation per Workspace** — Qdrant-Collection pro projectId
- **Score-Tier-Mapping** — SAME (≥0.85) / SIMILAR (0.65-0.85) / UNIQUE (<0.65)
- **Audit-Trail per Action** — `createAuditEntry` für jede destruktive Operation

## 📝 Daily-Notes

- [[daily-2026-05-16]] — Sprint 3 Tag 1+2: UC-RED-001 komplett

## 🔗 Externe Resources

- Linear-Projekt: https://linear.app/thearchitect
- GitHub: https://github.com/MaCeeeee/TheArchitect
- Production: https://thearchitect.site

## 🏷️ Tag-Index

| Tag | Zweck |
|---|---|
| `#feature` | Konkrete Use Case oder Requirement |
| `#strategy` | Strategische Vision / Direction |
| `#sprint-2`, `#sprint-3`, `#sprint-4` | Pro Sprint filtern |
| `#production-live` | Was bereits auf thearchitect.site läuft |
| `#planned` | Was geplant aber noch nicht angefangen |
| `#predictive-architecture` | Alles zur Embedding-/Similarity-Familie |
| `#compliance`, `#dsgvo` | Compliance-relevante Features |
| `#demo-project` | Konkrete Customer-Demos |

---

> [!tip] Dataview-Query-Idee
> ```dataview
> TABLE status, sprint, use_case FROM #feature WHERE status = "production-live" SORT sprint DESC
> ```
