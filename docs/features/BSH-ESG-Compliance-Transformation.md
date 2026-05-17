---
aliases:
  - BSH-ESG-Compliance-Transformation
  - BSH-Demo
  - BSH ESG Demo
tags:
  - demo-project
  - bsh
  - customer
  - esg
  - compliance
type: demo-project
customer: BSH Home Appliances Group
project_url: https://thearchitect.site/project/69e313db8e1a7d2fac087933
created_for: BSH-Pitch 2026
owner: Matze Ganzmann
related:
  - UC-RED-001 Redundancy Detector (tested against this project)
  - UC-DATA-001 V2 Generator-Reuse (tested against this project)
  - UC-SIM-001 Similarity Foundation
---

# BSH-ESG-Compliance-Transformation

> [!info] Demo-Projekt für BSH-Pitch
> Konkretes Architektur-Modell von BSH (Bosch + Siemens + Gaggenau + Neff + ...) für deren ESG/CSRD-Compliance-Roadmap.
> URL: https://thearchitect.site/project/69e313db8e1a7d2fac087933

## Profil

| Attribut | Wert |
|---|---|
| **Customer** | BSH Home Appliances Group |
| **Marken** | Bosch · Siemens · Gaggenau · Neff · Constructa · Thermador |
| **Scope** | 40 Manufacturing Sites, ~8.000 Tier-1-Supplier, 6 Brands |
| **Compliance-Treiber** | CSRD (Q1 2026), LkSG, CSDDD (2027), EU Taxonomy, SBTi |
| **Architektur-Elements** | ~60 nach letztem Scan |

## Demo-Story-Punkte (live verifiziert)

### Sprint 2 Erfolge (Track A+B+C)

- ✅ **AI-Generator V2** legt keine Duplikate mehr an (98% reuse-rate bei zweitem Run)
- ✅ **Sensitivity-Heatmap als X-Ray** zeigt 4 PII-Brennpunkte sofort
- ✅ **Pending-Confirm-Modal** für SIMILAR-Matches mit 67% Score
- ✅ **Plateau-Progress-Bar** animiert beim Toggle der Implementation-Checkbox

### Sprint 3 Erfolge ([[UC-RED-001 Redundancy Detector]])

- ✅ **20 semantische Redundanz-Kandidaten** in 14 von 61 Data-Objects gefunden — in 3 Sekunden
- ✅ **Top-Match: Supplier-Master ↔ Supplier-Contact-Information** mit **85% SAME**
- ✅ **Cluster-Erkenntnis**: ESG-Data-Collection-Request taucht 3× in Top-10 → echter Wildwuchs-Beleg
- ✅ **Cross-Type-Mode**: scannt alle 60 Elements, findet 7 strenge Matches (höherer 0.7-Threshold)
- ✅ **Erste echte Production-Merge-Aktion**: 1 Pair gemerged, Element + 3 Pair-Beziehungen sauber entfernt

## Was das Demo zeigt

| Use Case | Live-Beweis im BSH-Demo |
|---|---|
| Embedding-Quality bei deutschen + englischen Compliance-Begriffen | "GHG-Daten" findet "Emissions-Record" mit 62% |
| Echte Redundanz-Erkennung | Supplier-Master vs Supplier-Contact-Information 85% |
| DSGVO-konformer Audit-Trail | Jeder Merge auditiert mit User-ID + Timestamp |
| TOGAF-Phasen-Workflow | Phase A-H im Top-Toolbar sichtbar |
| AI-Generator mit Reuse | Generator-D legt 8 Objects an, Re-Run reused alle 8 |

## Audit-Trail-Status (REQ-RED-005)

API-Endpoint:
```
GET /api/projects/69e313db8e1a7d2fac087933/stats/redundancies
```

Liefert kumulativ:
- `totalResolved` — wie viele Merges
- `lastResolvedAt` — wann zuletzt
- `lastResolvedBy` — von wem

## Pitch-Wert

> [!quote] BSH-Pitch-Punch
> *"Wir haben in 2 Tagen eine semantische Redundanz-Erkennung gebaut, die LeanIX, BiZZdesign und Mega nicht haben. Im BSH-ESG-Demo findet sie in 3 Sekunden 20 Konsolidierungs-Kandidaten — darunter Supplier-Master ↔ Supplier-Contact-Information mit 85% Match. Vorher: 2-Stunden-Excel-Job. Jetzt: 30 Sekunden im Tool."*

## Konsumiert

- [[UC-RED-001 Redundancy Detector]] (Test-Subject)
- [[UC-SIM-001 Similarity Foundation]] (Test-Subject)
- UC-DATA-001 V2 Generator-D (Test-Subject)
