/**
 * remediationBacklink — schließt die Schleife Gap → Maßnahme → Nachweis
 * (THE-568, Slice A von REQ-REQTRACE-001.5).
 *
 * Der Apply-Pfad der Remediation erzeugte Elemente, aber die auslösende
 * Anforderung erfuhr es nie — `covered` blieb unknown, obwohl die Maßnahme
 * existierte (Pre-Flight 2026-08-03: null Verweise auf linkedElementIds im
 * Apply-Service). Dieser Service schreibt MECHANISCH zurück:
 *
 *   Proposal.sourceRef.{normId, sectionIds}
 *     → Requirements { projectId, normId, sectionEId ∈ sectionIds }
 *     → $addToSet linkedElementIds + covered-Recompute (THE-557).
 *
 * Kein LLM, kein Raten: Requirements ohne `normId` (Bestand vor THE-390) und
 * Proposals ohne jede Norm-Referenz (advisor/manual) sind dokumentierte
 * No-ops. Menschliche Tore (enforced/attested) werden NIE berührt — nur
 * `covered` wird aus der neuen Element-Liste abgeleitet.
 *
 * BEIDE WELTEN (seit THE-643). Bis dahin baute der Join `upload:${standardId}`
 * von Hand und griff für Korpus-Normen ins Leere. Der Schlüssel kommt jetzt
 * kanonisch aus `sourceRef.normId`; Bestands-Proposals fallen auf die alte
 * Ableitung zurück.
 */
import mongoose from 'mongoose';
import { toNormWorkId } from '@thearchitect/shared';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { deriveCovered, emptyGates } from './requirementGates.service';

export interface BacklinkSourceRef {
  /** Kanonisch, beide Welten (THE-643). Führt, wenn vorhanden. */
  normId?: string;
  /** Bestand vor THE-643 — Upload-Welt, ObjectId. */
  standardId?: mongoose.Types.ObjectId | string;
  sectionIds?: string[];
}

export interface BacklinkResult {
  linkedRequirements: number;
  requirementIds: string[];
}

interface BacklinkArgs {
  projectId: mongoose.Types.ObjectId | string;
  sourceRef: BacklinkSourceRef | undefined;
  elementIds: string[];
}

/**
 * Der Schlüssel, unter dem gejoint wird — kanonisch, nicht handgebaut.
 *
 * Vorher stand hier `upload:${standardId}`. Für eine Korpus-Norm ergab das
 * `upload:corpus:dsgvo`, einen Schlüssel ohne Gegenstück: Der Rückschluss griff
 * ins Leere, und `covered` blieb leer, obwohl die Maßnahme existierte
 * (THE-643).
 *
 * `normId` führt. Fehlt es — jedes Proposal, das vor dieser Änderung entstand —,
 * bleibt die alte Ableitung als Rückfall, byte-gleich zu vorher: `toNormWorkId`
 * setzt vor eine rohe ObjectId genau `upload:`. Das ist der Schutzraum
 * THE-568.
 */
function normKeyOf(sourceRef: BacklinkSourceRef): string | null {
  if (sourceRef.normId) return sourceRef.normId;
  if (sourceRef.standardId) return toNormWorkId(String(sourceRef.standardId));
  return null;
}

function joinFilter(args: BacklinkArgs): Record<string, unknown> | null {
  const { sourceRef, elementIds } = args;
  if (!sourceRef || !sourceRef.sectionIds?.length || elementIds.length === 0) return null;
  const normId = normKeyOf(sourceRef);
  if (!normId) return null;
  return {
    projectId: new mongoose.Types.ObjectId(String(args.projectId)),
    normId,
    sectionEId: { $in: sourceRef.sectionIds },
  };
}

/**
 * Leitet `covered` aus der aktuellen Element-Liste des Dokuments neu ab und
 * speichert beides. Doc-weise statt updateMany: die neue Liste muss GELESEN
 * werden, bevor covered daraus folgt — und die menschlichen Tore werden aus
 * dem Bestand übernommen, nie neu erzeugt.
 */
async function recomputeCovered(requirementId: mongoose.Types.ObjectId): Promise<void> {
  const doc = await ComplianceRequirement.findById(requirementId);
  if (!doc) return;
  doc.gates = { ...(doc.gates ?? emptyGates()), covered: deriveCovered(doc.linkedElementIds) };
  await doc.save();
}

export async function linkAppliedElements(args: BacklinkArgs): Promise<BacklinkResult> {
  const filter = joinFilter(args);
  if (!filter) return { linkedRequirements: 0, requirementIds: [] };

  const matches = await ComplianceRequirement.find(filter).select('_id').lean();
  if (matches.length === 0) return { linkedRequirements: 0, requirementIds: [] };

  await ComplianceRequirement.updateMany(
    { _id: { $in: matches.map((m) => m._id) } },
    { $addToSet: { linkedElementIds: { $each: args.elementIds } } },
  );
  for (const m of matches) await recomputeCovered(m._id as mongoose.Types.ObjectId);

  return {
    linkedRequirements: matches.length,
    requirementIds: matches.map((m) => String(m._id)),
  };
}

export async function unlinkAppliedElements(args: BacklinkArgs): Promise<BacklinkResult> {
  const filter = joinFilter(args);
  if (!filter) return { linkedRequirements: 0, requirementIds: [] };

  const matches = await ComplianceRequirement.find(filter).select('_id').lean();
  if (matches.length === 0) return { linkedRequirements: 0, requirementIds: [] };

  await ComplianceRequirement.updateMany(
    { _id: { $in: matches.map((m) => m._id) } },
    { $pullAll: { linkedElementIds: args.elementIds } },
  );
  for (const m of matches) await recomputeCovered(m._id as mongoose.Types.ObjectId);

  return {
    linkedRequirements: matches.length,
    requirementIds: matches.map((m) => String(m._id)),
  };
}
