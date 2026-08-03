/**
 * ChainSystemRequirement — eine implementierungsfreie Systemanforderung der
 * ISO-Kette (THE-562, Phase 1 von ADR-0008).
 *
 * ── ZWEI SCHEMA-REGELN ──
 *
 * 1. **Rückverweis-Pflicht:** `stakeholderRequirementIds` verlangt ≥ 1 —
 *    Traceability ist Schema, nicht Konvention (ISO 15288 §6.4.3.2 f). Eine
 *    Systemanforderung ohne Herkunft ist keine.
 * 2. **Die vier Schlüsselfelder sind persistiert**, nicht nur Prompt-Schmuck:
 *    ⟨Schutzgut · Verpflichteter · Auslöser · Nachweis⟩ ist der mechanische
 *    Zusammenfall-Test aus ADR-0007 E5 — zwei Anforderungen fallen genau dann
 *    zusammen, wenn alle vier identisch sind. Ohne die Felder wäre der Test
 *    später wieder Ermessen.
 *
 * Der Name trägt das `Chain`-Präfix, weil `SystemRequirement` in shared
 * bereits der Plain-Typ der Kette ist — dieses Modell ist seine Persistenz.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IChainSystemRequirement extends Document {
  projectId: mongoose.Types.ObjectId;
  text: string;
  schutzgut: string;
  verpflichteter: string;
  ausloeser: string;
  nachweis: string;
  stakeholderRequirementIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const chainSystemRequirementSchema = new Schema<IChainSystemRequirement>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    text: { type: String, required: true, maxlength: 2000 },
    schutzgut: { type: String, default: '' },
    verpflichteter: { type: String, default: '' },
    ausloeser: { type: String, default: '' },
    nachweis: { type: String, default: '' },
    stakeholderRequirementIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'StakeholderRequirement' }],
      required: true,
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length >= 1,
        message: 'a system requirement without a stakeholder requirement has no provenance (ISO 15288 §6.4.3.2 f)',
      },
    },
  },
  { timestamps: true },
);

export const ChainSystemRequirement = mongoose.model<IChainSystemRequirement>(
  'ChainSystemRequirement',
  chainSystemRequirementSchema,
);
