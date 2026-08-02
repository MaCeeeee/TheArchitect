# RVTM — THE-557: Gates-Tripel + Notar-Akt (Slice 1 von UC-ATTEST-001)

**Plan:** `docs/superpowers/plans/2026-08-03-the557-gates-tripel.md`
**Ticket:** THE-557 · Parent THE-552 (**Score 85,7**, Pre-Flight komplett 2026-08-03)
**Rahmen:** ADR-0003 (COVER/ENFORCE/ATTEST) · Entscheidungen: `done` bleibt, Tripel additiv · Evidenz erst Slice 2 (THE-558)
**Komplexitäts-Verdikt:** Unknown Unknowns **mittel** (Muster existieren: UC-CERT-001, THE-356/357, THE-445, THE-306) · Haupt-Watch-Point: die meisten Anforderungen stehen ehrlich auf „gedeckt, nicht nachgewiesen" — Erwartungsmanagement in der Fläche

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert · ❌ gerissen

## Akzeptanzkriterien aus THE-557

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **AC-1** | `gates` additiv mit drei Toren; je Tor `state/setBy/setAt`; Default-Verhalten: Abwesenheit = 3× `unknown`, **kein** default-`{}` | 1, 2 | Unit: `emptyGates`; Modell ohne `gates` validiert wie vorher, `doc.gates === undefined` | ⬜ |
| **AC-2** | `covered` automatisch mit `setBy: 'system'` + Ableitungsgrund; `enforced`/`attested` **nur Mensch**, Notar-Muster, auditiert | 1, 3 | Unit: `deriveCovered` (yes/no je Verknüpfung, Grund benannt); Route auditiert via `createAuditEntry` | ⬜ |
| **AC-3** | Kein LLM-Pfad auf `enforced`/`attested` | 1, 3 | strukturell: `applyHumanGate` verlangt Session-`userId`; kein maschineller Aufrufer (grep im Abschluss) | ⬜ |
| **AC-4** | Nie Boolean, nie Prozent aggregiert | alle | kein Aggregat-Feld/-Endpoint; Kommentar am shared-Typ | ⬜ |
| **AC-5** | UI: Tripel-Badge **neben** dem Status; Setzen mit Begründungspflicht | 4, 5 | Component-Tests: Dialog vor `onSet`, `covered` unklickbar | ⬜ |

## Positiv-Kontrolle

| ID | Bedingung | Plan-Task | Status |
|---|---|---|---|
| **P-1** | Requirement mit verknüpften Elementen → `covered: yes (system)`; `enforced`/`attested` bleiben `unknown`, bis ein Mensch handelt | 1, 3 | ⬜ |

## Negativ-Kontrollen

| ID | Bedingung | Plan-Task | Status |
|---|---|---|---|
| **N-1** | Bestands-`done` zeigt `gates` 3× `unknown` — **das Häkchen erbt keine Tiefe** | 2 (Modell), 4 (Badge) | ⬜ |
| **N-2** | `setBy` im Body wird ignoriert — Zod-Schema kennt das Feld nicht, Identität aus der Session | 3 | ⬜ |
| **N-3** | Leere Begründung → 400/Throw | 1 (Service), 3 (Zod `min(1)`), 4 (Dialog) | ⬜ |
| **N-4** | `covered` per Notar-Route setzen → 400 — das Maschinen-Tor ist keine Menschen-Entscheidung | 1, 3 | ⬜ |

## Benannte Grenzen (gelten ab Merge, stehen im Ticket)

- `attested` ist in Slice 1 **ohne Evidenz-Bindung** setzbar — Zwischenstand, wird von THE-558 verschärft (`attested` verlangt dann frische, nicht-stale Evidenz).
- Das Tripel macht Aussagen **ehrlicher**, nicht besser: „covered, not attested" ist der erwartete Normalzustand und steht als Text in der Fläche.
- Geurteilt wird Umsetzbarkeit/Nachweisbarkeit, nicht Rechtmäßigkeit.

## Risiko

Berührt `ComplianceRequirement` (Produktionsmodell mit BSH-Demo-Daten). **Additiv, kein default-`{}`, kein Feld umgedeutet, keine Migration.** Rollback = Feld ignorieren. Muster: `legalProfile` (THE-548), dort ohne Zwischenfall.
