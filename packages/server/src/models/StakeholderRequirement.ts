/**
 * StakeholderRequirement — eine singuläre Anforderung aus einer Rechtsklausel
 * (THE-561, Phase 1 von ADR-0008; Kette nach ADR-0007).
 *
 * ── WARUM DER KLAUSEL-SNAPSHOT EINGEBETTET IST ──
 *
 * Die Referenz muss auch nach einer Novelle auflösbar sein: `clause.text` ist
 * der Beleg-Text zum Zeitpunkt der Ableitung (WORM-Geist THE-558), die
 * `contentId` die änderungsstabile Achse (THE-560 — positionale Ids zeigen
 * nach einer Novelle zu 24/30 auf die falsche Klausel, Content-Hash findet
 * 30/30). Der positionale Pfad bleibt reine Anzeige.
 *
 * `slots` sind die vier Achsen des Singularitätstors ⟨Handlung · Empfänger ·
 * Modalität · Bedingung⟩ — hier steht je genau EIN Wert, denn nicht-singuläre
 * Kandidaten wurden vor der Persistenz aufgeteilt (requirementChain.service).
 *
 * `deadline` ist optional und kommt AUSSCHLIESSLICH aus `deriveDeadline` am
 * Klauseltext — eine Anforderung ohne Frist trägt kein erfundenes Fristobjekt
 * (THE-549: die SysReq-Transformation VERLIERT Fristen, deshalb hängt die
 * Uhr an der Klausel).
 */
import mongoose, { Schema, Document } from 'mongoose';
import type { Deadline } from '@thearchitect/shared';

export interface IStakeholderRequirement extends Document {
  projectId: mongoose.Types.ObjectId;
  regulationKey: string;
  clause: {
    contentId: string;
    positionalId?: string;
    path?: string;
    text: string;
    regulationVersionHash?: string;
  };
  text: string;
  slots: { action: string; recipient: string; modality: string; condition: string };
  kind: 'requirement' | 'constraint';
  deadline?: Deadline;
  createdAt: Date;
  updatedAt: Date;
}

const deadlineSchema = new Schema(
  {
    dauer: {
      wert: { type: Number, required: true },
      einheit: { type: String, enum: ['h', 'd', 'mon'], required: true },
    },
    bezugspunkt: {
      type: String,
      enum: ['kenntnis', 'einstufung', 'vorherige-meldung', 'ereignis'],
      required: true,
    },
    stufe: { type: String, enum: ['erst', 'zwischen', 'abschluss', null], default: null },
    quelle: { type: String, required: true },
  },
  { _id: false },
);

const stakeholderRequirementSchema = new Schema<IStakeholderRequirement>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    regulationKey: { type: String, required: true, trim: true, index: true },
    clause: {
      contentId: { type: String, required: true, match: /^[0-9a-f]{16}$/, index: true },
      positionalId: { type: String, trim: true },
      path: { type: String, trim: true },
      text: { type: String, required: true, maxlength: 10000 },
      regulationVersionHash: { type: String, trim: true },
    },
    text: { type: String, required: true, maxlength: 2000 },
    slots: {
      action: { type: String, default: '' },
      recipient: { type: String, default: '' },
      modality: { type: String, default: '' },
      condition: { type: String, default: '' },
    },
    kind: { type: String, enum: ['requirement', 'constraint'], required: true },
    deadline: { type: deadlineSchema, required: false },
  },
  { timestamps: true },
);

export const StakeholderRequirement = mongoose.model<IStakeholderRequirement>(
  'StakeholderRequirement',
  stakeholderRequirementSchema,
);
