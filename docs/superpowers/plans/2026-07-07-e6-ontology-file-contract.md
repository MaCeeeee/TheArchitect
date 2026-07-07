# E6-Ontologie-Datei — Kontrakt für THE-390 P1 ↔ THE-429

**Stand:** 2026-07-07 · **Zweck:** Der eine zeitkritische Abstimmungs-Punkt aus UC-ONTO-001 (THE-421). THE-390 P1 legt gerade `NormKind`/`Bindingness` als string-Stubs „mit Ontologie-Verweis" an — dieser Kontrakt legt fest, **worauf der Verweis zeigt**, damit die Datei (THE-429) später ohne Stub-Migration eingehängt werden kann.
**Grundlage:** ADR-0004 E6 (Reference-Data statt Code-Enums), E7 (relationTypes-Registry), E8-R5 (AssuranceScheme/Axis = ontologie-validierte string). **Betrifft:** [THE-390](https://linear.app/thearchitect/issue/THE-390) P1, [THE-429](https://linear.app/thearchitect/issue/THE-429), [THE-432](https://linear.app/thearchitect/issue/THE-432)/[THE-433](https://linear.app/thearchitect/issue/THE-433) (Konsumenten), [THE-384](https://linear.app/thearchitect/issue/THE-384) (Trace-Join).

## Verifizierte Randbedingungen (Codebase-Scan 2026-07-07)

- `packages/shared` ist heute **dependency-frei** (reine Typen). `packages/compliance-crawler` hängt an `@thearchitect/shared` (`"*"`) **und** shippt bereits `zod ^3.24.0`; der Server nutzt zod breit (`evals/goldenSet.ts`, `compliance.routes.ts`, …). → Beide Ingestion-Konsumenten können eine shared-Ontologie samt Zod-Contract lesen.
- Das laut ADR-0004 dreifach duplizierte `RegulationSource`/`RegulationJurisdiction`-Enum liegt in `shared/src/types/compliance.types.ts:62,78`. Die Ontologie-Datei ist der Ort, an dem diese Duplikation kollabiert.
- Keine `Norm*`-Dateien auf master; P1-Branch (noch) nicht sichtbar → dieser Kontrakt ist additiv (neuer `ontology/`-Ordner), kollidiert mit keiner P1-Datei.

## Kern-Entscheidung (die Spannung auflösen)

ADR-0004 verlangt zweierlei, das sich zu widersprechen scheint: **„Werte leben in der Ontologie-Datei"** und **„nicht als TS-Enum am Kern, validiert am Zod-Ingestion-Contract"**. Auflösung:

| Ebene | Was | Typ |
|--|--|--|
| **Kern-Schema** (Norm/NormMapping/Suggestion) | `kind`, `bindingness`, `assuranceScheme`, Relations-`type` | **`string`** (P1-Stub bleibt `type NormKind = string`) |
| **Allowed-Values** | die erlaubten IDs + deren Metadaten | **Daten** in der versionierten Ontologie-Datei |
| **Grenze dazwischen** | Ingestion / Suggestion-Write | **Zod-Refinement** gegen die Allowed-Values |

Der Kern speichert also nie ein geschlossenes Enum — er speichert `string`, der **an der Schreibgrenze** gegen die Datei validiert wird. Genau E6/E8-R5.

## D1 — Ort & Format

```
packages/shared/src/ontology/
  norm-ontology.v1.ts        # kanonische Daten (TS `as const`) — Source of Truth
  norm-ontology.schema.ts    # Zod-Schema, das (a) die Datei selbst und (b) Ingestion validiert
  index.ts                   # Accessoren + abgeleitete Convenience-Typen + Allowed-Value-Sets
  CHANGELOG.md               # Review-Gate-Historie (semver)
```

**TS `as const`, nicht rohes JSON** — weil daraus die literal-Typen (für UI/Authoring) *kostenlos* abgeleitet werden und der Review-Diff lesbar bleibt. Der OntoLearner-Export (THE-429 AC-3) ist ein trivialer Serialisierer über dasselbe Objekt (`ontology → {terms, types, taxonomic, non_taxonomic}`-JSON), **kein** zweiter Datenspeicher. `zod` wird als (erste, bewusste) Dependency zu `shared` hinzugefügt — der einzige Schema-Validator, den Server + Crawler ohnehin teilen.

## D2 — Datei-Struktur (v1-Skelett)

```typescript
// norm-ontology.v1.ts
export const NORM_ONTOLOGY = {
  ontologyVersion: '1.0.0',          // semver — Bump = Review-Gate (D4)
  updatedAt: '2026-07-07',
  normKinds: [
    { id: 'legislation',        label: 'Legislation',            bindingnessDefault: 'binding' },
    { id: 'implementing_act',   label: 'Implementing Act',       bindingnessDefault: 'binding' },
    { id: 'delegated_act',      label: 'Delegated Act',          bindingnessDefault: 'binding' },
    { id: 'technical_standard', label: 'Technical Standard',     bindingnessDefault: 'voluntary-de-facto' },
    { id: 'guideline',          label: 'Guideline',              bindingnessDefault: 'persuasive' },
    { id: 'trust_framework',    label: 'Trust Framework',        bindingnessDefault: 'voluntary-de-facto' },
    { id: 'court_decision',     label: 'Court Decision',         bindingnessDefault: 'binding' },
    { id: 'executive_order',    label: 'Executive Order',        bindingnessDefault: 'binding-for-agencies' },
  ],
  bindingness: [
    { id: 'binding' }, { id: 'binding-for-agencies' },
    { id: 'voluntary-de-facto' }, { id: 'persuasive' },
  ],
  relationTypes: [                    // E7 — Cross-Norm-Kanten
    { id: 'AMENDS',        derivation: 'metadata' },   // aus ELI/CELLAR — NICHT LLM (THE-433 AC-5)
    { id: 'CONSOLIDATES',  derivation: 'metadata' },
    { id: 'REPEALS',       derivation: 'metadata' },
    { id: 'CITES',         derivation: 'metadata' },
    { id: 'TRANSPOSES',    derivation: 'inferred'  },   // Text-abhängig → THE-433 (LLM-Vorschlag)
    { id: 'IMPLEMENTS',    derivation: 'inferred'  },
    { id: 'CONCRETIZES',   derivation: 'inferred'  },
    { id: 'DEROGATED_BY',  derivation: 'inferred'  },   // lex specialis, DORA↔NIS2-Härtetest
    { id: 'PREVAILS_OVER', derivation: 'inferred'  },
    { id: 'SETS_PARAMETER',derivation: 'inferred'  },
    { id: 'RECOGNIZES_EQUIVALENCE', derivation: 'inferred' },
    { id: 'INTERPRETS',    derivation: 'inferred'  },
  ],
  // jurisdictions[] mit per-Jurisdiktion-Lifecycle-State-Machine (E6),
  // partyRoles[], assuranceSchemes[]+axes[] (E8-R5), maturity[] je SDO — in v1 als leere/seed-Arrays,
  // gefüllt von THE-429 (hier nur der Vertrag, dass die Schlüssel existieren).
} as const;
```

Das `derivation`-Feld auf `relationTypes` ist der **Abgrenzungs-Vertrag** zwischen deterministischem Parser-Pfad und LLM-Vorschlag (THE-433 AC-5: `AMENDS` darf nie vom LLM kommen). Es gehört in die Datei, weil es Daten sind, keine Logik.

## D3 — Ingestion-Contract (die Schreibgrenze)

```typescript
// norm-ontology.schema.ts
import { z } from 'zod';
import { NORM_ONTOLOGY } from './norm-ontology.v1';

const kindIds = NORM_ONTOLOGY.normKinds.map(k => k.id);
export const NormKindSchema = z.string()
  .refine(v => kindIds.includes(v), { message: 'unknown NormKind — not in ontology vX' });
// analog BindingnessSchema, RelationTypeSchema, …
// Ein `assertInOntology(field, value, ontologyVersion)`-Helper → wird von
// THE-432 (Term Typing) und THE-433 (RE) als OOV-Drop-Gate wiederverwendet.
```

Out-of-Vocabulary → Drop + Telemetrie (dasselbe Muster wie der Drop halluzinierter elementIds in `complianceMapping.service.ts:143`).

## D4 — Versionierung & Review-Gate

- `ontologyVersion` ist **semver**. Additiver Wert (neue ID) = MINOR; Umbenennung/Entfernen (breaking) = MAJOR + Migrations-Notiz.
- Änderung nur per PR + `CHANGELOG.md`-Eintrag (Extension-Review-Gate, ADR-0004 „Ontologie-Datei = deploy-kritisches Artefakt").
- **Jeder AI-Suggestion-Record und Trace trägt `ontologyVersion`** (Join-Feld zu THE-384) — so ist rückverfolgbar, gegen welchen Wertevorrat eine Typisierung/Kante vorgeschlagen wurde. Das ist zugleich THE-429 AC-4.

## Was P1 JETZT tut (und was es NICHT tut)

**P1 tut:** die Stubs in `norm.types.ts` als `string` typisieren und per JSDoc auf den (künftigen) Ontologie-Modulpfad + den Ingestion-Validator verweisen — nicht mehr:

```typescript
/**
 * Allowed values: {@link NORM_ONTOLOGY.normKinds} (packages/shared/src/ontology).
 * Validated at ingestion via NormKindSchema (THE-429). Core field stays `string` (ADR-0004 E6).
 */
export type NormKind = string;
export type Bindingness = string;
```

**P1 tut NICHT:** die Datei bauen, zod zu shared hinzufügen, oder Werte hart kodieren. Das ist THE-429 — ein eigener, auf 001.5 nicht angewiesener Slice (die Datei kann vor dem Eval stehen; nur die *Suggest-Features* 001.3/001.4 brauchen das Eval-Gate).

**Ergebnis:** Wenn THE-429 die Datei liefert, ist die Änderung an P1 = null (die Stubs zeigen schon richtig) + das Hinzufügen von `zod` zu shared. Keine Stub-Migration. Genau das Doppel-Anfassen, das dieser Kontrakt verhindert.

## Offen (bewusst dem Menschen überlassen — Asilomar #16)

- **zod als shared-Dependency**: kleine, aber erste Runtime-Dep in `shared`. Alternative wäre, das Schema in server+crawler zu duplizieren — genau die Duplikation, die ADR-0004 killen will. Empfehlung: zod nach shared. **Bestätigung durch Matthias steht aus.**
- v1-Seed-Tiefe (welche jurisdictions/partyRoles/assuranceSchemes zum Start): gehört in THE-429, nicht in diesen Kontrakt.
