/**
 * UC-LAW-002 Slice-2 (THE-463) — Persist/Lifecycle für LLM-Korpus-Befunde.
 *
 * `upsertFindings` ist der EINE Schreibpfad des Judge-Orchestrators
 * (discoverAndJudge, Task 8): er persistiert neue/aktualisierte 'auto'-
 * Befunde, rührt aber NIE ein bereits menschlich bewertetes Finding
 * (status='confirmed'|'rejected') an — weder Status noch Content (Review-Fix
 * 5 / AC-3). Sonst würde ein Re-Run die Evidenz unter einer menschlichen
 * Entscheidung wegdriften lassen.
 *
 * `setFindingStatus` ist der EINE Schreibpfad für die menschliche Entscheidung
 * (confirm/reject-Routen, Task 9) — Muster ComplianceMapping-Confirm-Route.
 *
 * Linear: THE-463 (REQ-LAW-002.4)
 */
import mongoose from 'mongoose';
import type { DiscoveryFinding } from '@thearchitect/shared';
import { LawDiscoveryFinding, type ILawDiscoveryFinding } from '../models/LawDiscoveryFinding';

export type UpsertFindingInput = Omit<DiscoveryFinding, 'status' | 'createdBy' | 'projectId'>;

function toDiscoveryFinding(doc: ILawDiscoveryFinding): DiscoveryFinding {
  return {
    projectId: doc.projectId.toString(),
    family: doc.family,
    sources: doc.sources,
    jurisdiction: doc.jurisdiction,
    status: doc.status,
    applies: doc.applies,
    confidence: doc.confidence,
    reasoning: doc.reasoning,
    elementIds: doc.elementIds,
    keyParagraphs: doc.keyParagraphs,
    // AC-4 (Fix 1): additiv — Alt-Docs ohne das Feld liefern undefined (UI-Fallback: Key).
    ...(doc.keyParagraphDetails?.length
      ? { keyParagraphDetails: doc.keyParagraphDetails.map(d => ({ regulationKey: d.regulationKey, title: d.title })) }
      : {}),
    retrievalScore: doc.retrievalScore,
    corpusVersionHash: doc.corpusVersionHash,
    judgeModel: doc.judgeModel,
    createdBy: doc.createdBy,
  };
}

/**
 * Persistiert neue/aktualisierte Judge-Befunde als `status: 'auto'`,
 * `createdBy: 'llm'`. Ein Dedup-Key (`projectId,family,corpusVersionHash`),
 * der bereits `status !== 'auto'` trägt (ein Mensch hat entschieden), wird
 * KOMPLETT übersprungen — weder Content noch Status werden überschrieben.
 */
export async function upsertFindings(
  projectId: string,
  findings: UpsertFindingInput[],
): Promise<void> {
  if (findings.length === 0) return;
  const projectObjectId = new mongoose.Types.ObjectId(projectId);

  for (const f of findings) {
    const existing = await LawDiscoveryFinding.findOne({
      projectId: projectObjectId,
      family: f.family,
      corpusVersionHash: f.corpusVersionHash,
    })
      .select('status')
      .lean();

    if (existing && existing.status !== 'auto') {
      // Human-reviewed (confirmed/rejected) — protected, never overwritten.
      continue;
    }

    const query = { projectId: projectObjectId, family: f.family, corpusVersionHash: f.corpusVersionHash };
    const content = {
      sources: f.sources,
      jurisdiction: f.jurisdiction,
      applies: f.applies,
      confidence: f.confidence,
      reasoning: f.reasoning,
      elementIds: f.elementIds,
      keyParagraphs: f.keyParagraphs,
      ...(f.keyParagraphDetails ? { keyParagraphDetails: f.keyParagraphDetails } : {}),
      retrievalScore: f.retrievalScore,
      judgeModel: f.judgeModel,
      status: 'auto',
      createdBy: 'llm',
    };

    try {
      await LawDiscoveryFinding.updateOne(query, { $set: content }, { upsert: true, runValidators: true });
    } catch (err) {
      // Code-Review-Fix: findOne+upsert ist nicht atomar — bei parallelem
      // /discover (Doppelklick, zwei Tabs) verliert einer das bekannte Mongo-
      // Upsert-Race mit E11000, obwohl upsert:true gesetzt ist. Das Dokument
      // existiert dann bereits: menschlichen Status respektieren, sonst als
      // reines Update (ohne upsert) nachziehen. Alles andere wirft weiter.
      if ((err as { code?: number }).code !== 11000) throw err;
      const raced = await LawDiscoveryFinding.findOne(query).select('status').lean();
      if (raced && raced.status !== 'auto') continue;
      await LawDiscoveryFinding.updateOne(query, { $set: content }, { runValidators: true });
    }
  }
}

/**
 * Menschliche Entscheidung (confirm/reject-Routen). `confirm` markiert das
 * Finding zusätzlich `createdBy: 'human'` (Muster ComplianceMapping-Confirm) —
 * `reject` ändert nur den Status, der Judge bleibt Urheber des Inhalts.
 * Gibt `true` zurück, wenn ein Dokument getroffen wurde.
 */
export async function setFindingStatus(
  projectId: string,
  family: string,
  corpusVersionHash: string,
  status: 'confirmed' | 'rejected',
): Promise<boolean> {
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  const update: Record<string, unknown> = { status };
  if (status === 'confirmed') update.createdBy = 'human';

  const res = await LawDiscoveryFinding.updateOne(
    { projectId: projectObjectId, family, corpusVersionHash },
    { $set: update },
  );
  return res.matchedCount > 0;
}

/** Reuse-Lookup für den Judge-Orchestrator (Task 8): existiert schon ein Befund? */
export async function findExisting(
  projectId: string,
  family: string,
  corpusVersionHash: string,
): Promise<DiscoveryFinding | null> {
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  const doc = await LawDiscoveryFinding.findOne({
    projectId: projectObjectId,
    family,
    corpusVersionHash,
  });
  return doc ? toDiscoveryFinding(doc) : null;
}

/** Alle Befunde eines Projekts (optional auf eine Evidenz-Version gefiltert). */
export async function listFindings(
  projectId: string,
  corpusVersionHash?: string,
): Promise<DiscoveryFinding[]> {
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  const filter: Record<string, unknown> = { projectId: projectObjectId };
  if (corpusVersionHash) filter.corpusVersionHash = corpusVersionHash;
  const docs = await LawDiscoveryFinding.find(filter);
  return docs.map(toDiscoveryFinding);
}
