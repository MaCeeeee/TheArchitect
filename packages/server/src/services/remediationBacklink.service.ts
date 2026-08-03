/**
 * remediationBacklink — schließt die Schleife Gap → Maßnahme → Nachweis
 * (THE-568, Slice A von REQ-REQTRACE-001.5).
 *
 * Der Apply-Pfad der Remediation erzeugte Elemente, aber die auslösende
 * Anforderung erfuhr es nie — `covered` blieb unknown, obwohl die Maßnahme
 * existierte (Pre-Flight 2026-08-03: null Verweise auf linkedElementIds im
 * Apply-Service). Dieser Service schreibt MECHANISCH zurück:
 *
 *   Proposal.sourceRef.{standardId, sectionIds}
 *     → Requirements { projectId, normId: `upload:<standardId>`,
 *                      sectionEId ∈ sectionIds }
 *     → $addToSet linkedElementIds + covered-Recompute (THE-557).
 *
 * Kein LLM, kein Raten: Requirements ohne `normId` (Bestand vor THE-390) und
 * Proposals ohne `standardId` (advisor/manual) sind dokumentierte No-ops.
 * Menschliche Tore (enforced/attested) werden NIE berührt — nur `covered`
 * wird aus der neuen Element-Liste abgeleitet.
 *
 * EHRLICHE GRENZE: das greift für die Upload-Welt (Standard-Sections). Der
 * Korpus-/Klausel-Anschluss folgt mit Gap-je-Klausel (ADR-0008 Phase 2).
 */
import mongoose from 'mongoose';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { deriveCovered, emptyGates } from './requirementGates.service';

export interface BacklinkSourceRef {
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

function joinFilter(args: BacklinkArgs): Record<string, unknown> | null {
  const { sourceRef, elementIds } = args;
  if (!sourceRef?.standardId || !sourceRef.sectionIds?.length || elementIds.length === 0) {
    return null;
  }
  return {
    projectId: new mongoose.Types.ObjectId(String(args.projectId)),
    normId: `upload:${sourceRef.standardId}`,
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
