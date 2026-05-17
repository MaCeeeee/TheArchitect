---
aliases:
  - UC-HARM-001 Cross-Project Harmonisierung
  - UC-HARM-001
  - Cross-Project Harmonisierung
  - Harmonisierung
tags:
  - feature
  - thearchitect
  - sprint-4
  - planned
  - predictive-architecture
  - tier-3
status: planned
sprint: 4
use_case: UC-HARM-001
linear_parent: TBD
deployed_to: noch nicht deployed
owner: Matze Ganzmann
related:
  - UC-SIM-001 (Foundation — nutzbar)
  - UC-RED-001 (Pattern-Vorbild — done)
---

# UC-HARM-001 Cross-Project Harmonisierung

> [!info] Status — Geplant für Sprint 4
> Architektur-Spike als erster Schritt: wie Cross-Workspace-Querying ohne Bruch der Tenant-Isolation aus REQ-SIM-005.

## Was es werden soll

UC-RED-001 findet Redundanzen **innerhalb eines Projekts**. UC-HARM-001 erweitert das **über Projekt-Grenzen hinweg**:

> [!example] BSH-Multi-Project-Szenario
> *"BSH-Projekt-A (Bosch Hausgeräte) hat ein `Customer-Master`. BSH-Projekt-B (Siemens Hausgeräte) hat ein `Customer DB`. Beide modellieren dasselbe Konzept. UC-HARM-001 erkennt das automatisch und schlägt Harmonisierung der Naming-Convention vor."*

## Konkrete Features

| Feature | Beschreibung |
|---|---|
| Cross-Project-Similarity-Search | Multi-Workspace-Query trotz Tenant-Isolation |
| **Reference-Pattern-Library** | "Diese 5 BSH-Projekte haben alle ein 'ESG-Reporting-Process' — als Template verfügbar" |
| Naming-Convention-Audit | "73% deiner Stakeholder folgen Pattern X, 27% folgen Pattern Y" |
| Cross-Project-Merge-Workflow | Analog REQ-RED-004 aber über Workspace-Grenzen |

## Architektur-Spike vorab nötig

> [!warning] Spike vor Implementation
> UC-HARM-001 berührt **REQ-SIM-005 Hard-Stop** — die physikalisch erzwungene Workspace-Isolation in Qdrant-Collections. Wir können das nicht einfach umgehen ohne DSGVO-Problem.

Mögliche Architektur-Optionen:

| Option | Wie | Trade-off |
|---|---|---|
| **A — Opt-in pro Projekt** | User wählt explizit Projekte aus die ins Cross-Pool dürfen | DSGVO-clean, aber friction |
| **B — Read-only Cross-Workspace mit Audit** | Lese-Calls aus allen Workspaces, keine Writes | Schnell aber audit-heavy |
| **C — Anonymisierter Pool** | Nur Names + Types, keine Sensitivity-Daten cross | Eingeschränkter Wert |

Spike soll Option wählen + **Architecture Decision Record** schreiben.

## Dependencies

- ✅ [[UC-SIM-001 Similarity Foundation]] — bereits live
- ✅ [[UC-RED-001 Redundancy Detector]] — Pattern erprobt
- ⬜ Cross-Workspace-Architektur-Spike + ADR

## Strategische Bedeutung

Aus [[Predictive Architecture Strategy]]:

> "UC-HARM-001 ist Cross-Project semantic-matching. Reference-Pattern-Library als Mongo-Collection. Coverage-Analysis-Feature im Compliance-Dashboard. Pre-Requirement: Gate-2 (Production-Embedding) = UC-SIM-001 ✓"

UC-HARM-001 ist der **Multi-Tenant-Multiplier**: je mehr Projekte ein Kunde hat, desto wertvoller wird das Feature.

## Tracking

Geplant Sprint 4, Tag 1 = Spike, Tag 2-5 = Implementation.

Linear-Issue noch anzulegen (vermutlich THE-251+).
