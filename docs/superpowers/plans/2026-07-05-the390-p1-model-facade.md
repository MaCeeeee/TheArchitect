# THE-390 P1 — Model + Facade (Umsetzungsplan)

**Stand:** 2026-07-05 · **Voraussetzung erfüllt:** PR #34 (THE-419 Code-Cutover) gemerged, `master` aktuell · **Grundlage:** ADR-0004 (Accepted), Design `2026-07-05-canon-architecture-design.md`

## Ziel

Die `Norm`-Entität und ihre Lese-Facade einführen — **ohne** irgendetwas zu migrieren oder umzuschreiben. Nach P1 gilt: Jeder Consumer *kann* einheitlich über `norm.service` lesen, aber die beiden bestehenden Welten (Standard-Upload, Regulation/Korpus) laufen unverändert weiter. Exakt das Strangler-Muster von `regulationResolver.service.ts`.

## Nicht-Ziele (bewusst ausgeschlossen)

- **Keine Datenmigration.** Standards/Regulations/Mappings bleiben, wo sie sind.
- **Kein Schreibpfad.** `Norm` wird in P1 nur *gelesen/projiziert*, nicht persistiert (Upload-schreibt-Norm = P4).
- **Keine Pipeline-/Requirements-/Gap-Umstellung** (= P2/P3).
- **Kein Index-/FK-Flip** auf `normId` (= P4, gebündelt mit der einmaligen Migration; verhindert Doppel-Migration — s. THE-419).
- **Keine Reach-/Derogation-Query-Logik.** In P1 nur die *Modell-Struktur*, die diese Relationen tragen kann; die Auswertung ist P3 (Applicability/Gap).

## Bestehende Welten (Ist, verifiziert)

| | Standard-Welt (Upload) | Regulation-Welt (Korpus) |
|---|---|---|
| Inhalt | `Standard` `{projectId, name, version, type, sections[]}`, Section `{id, title, number, content, level}` (`Standard.ts`) | `RegulationView` via `regulationResolver` `{regulationKey, source, jurisdiction, paragraphNumber, title, fullText}` |
| Mapping | `StandardMapping` `{standardId, sectionId, elementId, status: compliant\|partial\|gap\|not_applicable, confidence}` | `ComplianceMapping` `{projectId, regulationKey, regulationVersionHash, elementId, elementType, confidence, reasoning, status: auto\|confirmed\|rejected, createdBy}` |

## Artefakte (Dateien)

1. **`packages/shared/src/types/norm.types.ts`** (neu) — das Lese-Projektions-Kontrakt + der Identitäts-/Typ-Unterbau aus ADR-0004 (SLICE-1-Teilmenge, nur was P1 braucht):
   - `NormView`, `NormSectionView`, `NormMappingView` (die vereinheitlichte Lesesicht)
   - `NormIdentity {workId, aliases[], frbrLevel}`, `NormAlias {scheme, value, language?}` (ADR-0004 E1)
   - `NormSource = 'upload' | 'corpus'` (Herkunfts-Diskriminator der Facade)
   - Platzhalter-Typen für spätere Phasen als `type … = string`-Stubs mit Ontologie-Verweis (kein geschlossenes Enum): `NormKind`, `Bindingness` — als Felder in `NormView` optional, in P1 aus vorhandenen Daten abgeleitet.

2. **`packages/server/src/models/Norm.ts`** (neu) — Mongoose-Schema nach ADR-0004 SLICE-1 (Identität, `corpusRef {workId, expression?, versionHash}`, bitemporale Hülle `{validFrom, validTo, recordedFrom, recordedTo}`, `sections` als Baum-fähige Struktur mit `parentId`/`path`). **Definiert, in P1 nicht beschrieben** — dient P4 als Zielschema und der Facade als Typ-Anker.

3. **`packages/server/src/models/NormMapping.ts`** (neu) — Schema, das `StandardMapping` + `ComplianceMapping` vereint (`{projectId, normId, sectionEId?, elementId, status, confidence, reasoning?, createdBy, corpusRef?}`), ICM-Invarianten erhalten. Ebenfalls nur definiert, nicht beschrieben.

4. **`packages/server/src/services/norm.service.ts`** (neu) — die Lese-Facade. Kern:
   - `listNorms(projectId): NormView[]` — projiziert alle `Standard`-Docs (source=upload) **und** die vom Projekt referenzierten Korpus-Normen (via `regulationResolver.getRegulationsForProject`) auf `NormView`.
   - `getNorm(projectId, ref): NormView | null` — ref = workId/alias oder legacy standardId/regulationKey.
   - `getNormMappings(projectId, normId): NormMappingView[]` — projiziert `StandardMapping` bzw. `ComplianceMapping`.
   - **Projektions-Funktionen** `standardToNormView`, `regulationToNormView`, `standardMappingToNormMappingView`, `complianceMappingToNormMappingView` — die einzige Stelle, an der die Quelle sichtbar ist.

5. **`packages/server/src/__tests__/norm.service.test.ts`** (neu) — s. Tests.

## Facade-Verhalten (die eine wichtige Design-Regel)

`norm.service` **liest**, entscheidet **nicht** über Korrektheit und **schreibt nicht**. Es normalisiert nur zwei Datenformen auf eine Sicht. Damit ist P1 risikoarm: bricht es, fällt nur die neue Lesesicht aus — die bestehenden Endpunkte laufen unberührt weiter (sie nutzen die Facade noch nicht; Umstellung = P2).

## ADR-0004-Strukturen: jetzt vs. später

| ADR-0004 | P1 | später |
|---|---|---|
| E1 Identität (workId+Alias) | Typ + Schema-Feld; Facade generiert workId deterministisch aus legacy-Key | Persistenz P4 |
| E2 Hierarchie (@eId-Baum) | Schema trägt `parentId`/`path`; Facade projiziert flache Sections als 1-Ebenen-Baum | echter Baum-Ingest = REQ-CANON-001.3 (THE-415) |
| E3 corpusRef + Bitemporalität | Schema-Felder vorhanden; Facade füllt `corpusRef` aus `{regulationKey, versionHash}` | Bitemporale Auswertung = THE-416 |
| E4 NormMapping-Union | Schema + Projektion | Unique-Index-Flip + Migration = P4 |
| E7/E8 Relationen (Derogation, Reach …) | **nicht in P1** | Modell-Kanten P2, Query-Logik P3 |

## Tests

- **Facade über beide Welten:** ein Upload-`Standard` und eine Korpus-`Regulation` desselben Projekts → `listNorms` liefert beide als `NormView` mit korrektem `source`.
- **Mapping-Projektion:** `StandardMapping` und `ComplianceMapping` → einheitliche `NormMappingView`; ICM-Felder (confidence, reasoning, createdBy, status) erhalten.
- **workId-Determinismus:** gleicher legacy-Key → gleiche workId (idempotent).
- **Non-Breaking:** bestehende Standard-/Compliance-Tests laufen unverändert grün (Facade ist additiv).
- **Regressions-Gerüst (P0-Auflage):** Test-Datei `norm-regression.fixtures.ts` anlegen, die die 28 Angriffsklauseln aus Design §10 als benannte Fixtures sammelt — in P1 als Skelett + die 6 SLICE-1-relevanten Fälle, Rest markiert `todo` für die späteren Phasen.

## Sequenz & Aufwand

- **Branch:** `mganzmanninfo/the-390-p1-model-facade` von aktuellem `master`.
- **Reihenfolge:** shared-Typen → Modelle → Facade → Tests (shared baut zuerst).
- **Aufwand:** ~1 Personentag (THE-390-Schätzung).
- **Merge-Kriterium:** TSC clean, neue + bestehende Tests grün, keine Änderung an bestehenden Endpunkten.
- **Danach:** P2 (Pipeline/Consumer lesen über die Facade → ab hier laufen Regulations durch die Pipeline).
