/**
 * RelationSuggestion — Vertragsfläche für KI-vorgeschlagene Cross-Norm-Kanten
 * am Korpus (THE-433, Slice 1). Muster-Vorlage ist die Typisierungs-Pipeline
 * (Slice T, `typing` auf dem Korpus-Dokument): der Batch schreibt
 * status='suggested', confirmed/rejected setzt NUR ein Mensch.
 *
 * WARUM das Schema in shared lebt (und nicht im Crawler oder Server): dieselbe
 * Validierung muss an JEDER Eintrittsstelle gelten — Eval-Harness (Server) und
 * Batch (Crawler, Server B) — sonst driften die beiden Pfade auseinander
 * (gleiche Begründung wie beim Typing-Prompt-Umzug, shared/src/typing/).
 *
 * Kernregel (AC-5, E7-Registry): `relationType` darf NUR ein Typ mit
 * `derivation: 'inferred'` sein. `metadata`-Kanten (AMENDS, CONSOLIDATES,
 * REPEALS, CITES) kommen aus offiziellen Dokument-Metadaten (ELI/CELLAR) und
 * dürfen NIEMALS von einem Sprachmodell vorgeschlagen werden — der Refine
 * gegen `isInferredRelation` erzwingt das an der Schema-Grenze (dasselbe
 * Muster wie RelationTypeLabel in relationsGolden.ts).
 *
 * Richtungs-Semantik: `a` ist IMMER das zitierende Dokument — der Träger des
 * Eintrags (das Korpus-Dokument, auf dem `relationSuggestions` liegt) —, `b`
 * das Ziel (`targetRegulationKey`). 'a-to-b' heißt also: die Relation läuft
 * vom Träger zum Ziel (z. B. "DORA PREVAILS_OVER NIS2" als Eintrag auf dem
 * DORA-Paragraphen). Die Richtung ist ein EIGENES Feld und wird nicht aus
 * einer Sortierung abgeleitet (Begründung: relationsGolden.ts, Design-
 * Entscheidung 1 — nur 2 von 8 inferred Typen haben eine deklarierte Inverse).
 *
 * Text-Anker (Idempotenz + Interpretierbarkeit): `sourceVersionHash` bindet
 * den Vorschlag an den Text-Stand des ZITIERENDEN Dokuments,
 * `targetVersionHash` an den des ZIELS. Beide sind Pflicht — ein Vorschlag
 * ohne Aussage, WELCHE Texte er verbindet, ist nach einer Novelle nicht mehr
 * interpretierbar (Review-Fix-1-Lektion aus dem Typing-Schema).
 *
 * Linear: THE-433 · Registry: norm-ontology.v1.ts (E7 `relationTypes`)
 */
import { z } from 'zod';
import { isInferredRelation } from '../ontology';

export const RELATION_SUGGESTION_STATUSES = ['suggested', 'confirmed', 'rejected'] as const;
export type RelationSuggestionStatus = (typeof RELATION_SUGGESTION_STATUSES)[number];

export const RelationSuggestionSchema = z.object({
  /** Kanonischer Key des ZIELS, z. B. "nis2:art-3" (ADR-0001). */
  targetRegulationKey: z.string().min(1),
  /** sha256 des Ziel-fullText, den dieser Vorschlag meint — Pflicht-Anker. */
  targetVersionHash: z.string().min(1),
  /** sha256 des fullText des Träger-Dokuments (des zitierenden) — Pflicht-Anker. */
  sourceVersionHash: z.string().min(1),
  /** NUR inferred-Typen der E7-Registry — metadata-Kanten validieren hier nie (AC-5). */
  relationType: z.string().refine(isInferredRelation, {
    message:
      "relationType must be an ontology 'inferred' relation type (metadata edges like AMENDS come from ELI/CELLAR, never from a model)",
  }),
  /** a = zitierendes Dokument (Träger des Eintrags), b = Ziel. */
  direction: z.enum(['a-to-b', 'b-to-a']),
  confidence: z.number().min(0).max(1).optional(),
  /** Nachvollziehbarkeit für den menschlichen Reviewer: WOMIT wurde das Paar begründet. */
  evidence: z.object({
    /** Der konkret gefundene Textausschnitt des Verweises. */
    matched: z.string().min(1),
    /** Artikelnummern-Pinpoints aus dem Verweis (normalisiert). */
    articleHints: z.array(z.string()),
  }),
  /** Provenance: mit welchem Prompt-Stand und Modell wurde vorgeschlagen. */
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  /** ISO-8601-Zeitstempel des Vorschlags. */
  suggestedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'suggestedAt must be an ISO date string',
  }),
  /** 'suggested' schreibt der Batch; confirmed/rejected setzt NUR ein Mensch. */
  status: z.enum(RELATION_SUGGESTION_STATUSES),
});

export type RelationSuggestion = z.infer<typeof RelationSuggestionSchema>;
