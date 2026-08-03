/**
 * Evidence — der Nachweis zu einer Compliance-Anforderung (THE-558).
 *
 * WICHTIGE ABGRENZUNG: `ContextTrace` belegt, wie ein Mapping ENTSTAND
 * (Evidenz der Herkunft). Dieses Modell belegt, dass eine Pflicht ERFÜLLT
 * wird (Evidenz der Erfüllung) — Verweis + Hash, kein Artefakt-Upload
 * (Entscheidung 2026-08-03: Aufbewahrungs-/Löschpflichten bleiben beim
 * Quellsystem, solange THE-536 offen ist).
 *
 * `kind` ist FREITEXT: den kanonischen Werteraum liefert THE-553 bottom-up.
 * Ein hier erfundenes Enum wäre der zweite Katalog am API-Rand, vor dem das
 * Ticket ausdrücklich warnt.
 *
 * WORM + Version-Lock: siehe evidence.service.ts (die Regeln) und
 * regulationDrift.service.ts (die Alterung).
 */
import mongoose, { Schema, Document } from 'mongoose';
import { assertAppendOnly, refCarriesCredentialMaterial } from '../services/evidence.service';

export interface IEvidence extends Document {
  projectId: mongoose.Types.ObjectId;
  requirementId: mongoose.Types.ObjectId;
  /** Freitext bis THE-553 (Register · Meldung · Bericht · Zertifikat · Protokoll …). */
  kind: string;
  /** URL, MinIO-Key oder Register-Referenz — NIE mit Zugangsmaterial. */
  ref: string;
  /** SHA-256 des referenzierten Inhalts, vom Erfasser geliefert. */
  sha256: string;
  collectedAt: Date;
  /** Server-seitig aus der Session — nie aus dem Body. */
  collectedBy: string;
  /** Version-Lock (Muster THE-306): der Textstand, für den der Nachweis gilt. */
  regulationKey?: string;
  regulationVersionHash?: string;
  /** Von der Drift-Erkennung gesetzt. Stale zählt nicht — wird aber nie gelöscht. */
  stale: boolean;
  /** Korrektur-Kette: dieser Eintrag ersetzt einen früheren. */
  supersedes?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema = new Schema<IEvidence>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'ComplianceRequirement', required: true, index: true },
    kind: { type: String, required: true, trim: true, minlength: 1 },
    ref: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v: string) => !refCarriesCredentialMaterial(v),
        message: 'ref must not carry credential material (token, password, api key)',
      },
    },
    sha256: {
      type: String,
      required: true,
      match: [/^[0-9a-f]{64}$/i, 'sha256 must be 64 hex characters'],
    },
    collectedAt: { type: Date, required: true },
    collectedBy: { type: String, required: true },
    regulationKey: { type: String, trim: true },
    regulationVersionHash: { type: String, trim: true },
    stale: { type: Boolean, default: false },
    supersedes: { type: Schema.Types.ObjectId, ref: 'Evidence' },
  },
  { timestamps: true },
);

// WORM (Muster RegisterEntry, THE-445): gespeichert = unveränderlich.
// Die EINE Ausnahme: die Drift-Erkennung darf `stale` kippen — das ist keine
// inhaltliche Änderung, sondern eine Alterungs-Markierung, und sie läuft über
// updateMany (am Dokument-Save vorbei), sodass dieser Guard sie nicht sieht.
evidenceSchema.pre('save', function (next) {
  try {
    assertAppendOnly(this);
    next();
  } catch (err) {
    next(err as Error);
  }
});

evidenceSchema.index({ requirementId: 1, stale: 1 });

export const Evidence = mongoose.model<IEvidence>('Evidence', evidenceSchema);
