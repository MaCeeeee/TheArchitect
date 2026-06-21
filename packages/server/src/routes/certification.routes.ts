/**
 * Certification (Notar-Workflow) — Trust-Spine (UC-CERT-001 / THE-328).
 *
 * Der Architekt sichtet maschinell-erzeugte Atome (`provenance <> 'user'` und noch
 * nicht beglaubigt) und zertifiziert sie. Beglaubigung setzt AUSSCHLIESSLICH
 * `certifiedBy` (server-seitig aus req.user) + `certifiedAt` — provenance/source/
 * confidence bleiben unangetastet. Idempotent via `certifiedBy IS NULL`.
 *
 * Mount: app.use('/api/projects', certificationRoutes)
 *   GET  /:projectId/certification/pending
 *   POST /:projectId/certification/certify
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { runCypher } from '../config/neo4j';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';

const router = Router();

const toNum = (v: unknown): number =>
  typeof (v as { toNumber?: () => number })?.toNumber === 'function'
    ? (v as { toNumber: () => number }).toNumber()
    : Number(v ?? 0);

router.use(authenticate);
router.use('/:projectId', requireProjectAccess('viewer'));

/**
 * GET /:projectId/certification/pending
 * Alle unzertifizierten, nicht-`user`-Atome (riskigste = niedrigste Konfidenz zuerst).
 */
router.get(
  '/:projectId/certification/pending',
  audit({ action: 'certification_pending', entityType: 'project', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      const elementRecords = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId})
         WHERE e.provenance <> 'user' AND e.certifiedBy IS NULL
         RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer,
                e.provenance AS provenance, e.source AS source, e.confidence AS confidence
         ORDER BY coalesce(e.confidence, 1.0) ASC, e.name`,
        { projectId },
      );
      const connectionRecords = await runCypher(
        `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
         WHERE r.provenance <> 'user' AND r.certifiedBy IS NULL
         RETURN r.id AS id, r.type AS type, r.label AS label,
                r.provenance AS provenance, r.source AS source, r.confidence AS confidence,
                a.id AS sourceId, b.id AS targetId, a.name AS sourceName, b.name AS targetName
         ORDER BY coalesce(r.confidence, 1.0) ASC`,
        { projectId },
      );

      const elements = elementRecords.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        type: r.get('type'),
        layer: r.get('layer'),
        provenance: r.get('provenance'),
        source: r.get('source'),
        confidence: r.get('confidence'),
      }));
      const connections = connectionRecords.map((r) => ({
        id: r.get('id'),
        type: r.get('type'),
        label: r.get('label'),
        provenance: r.get('provenance'),
        source: r.get('source'),
        confidence: r.get('confidence'),
        sourceId: r.get('sourceId'),
        targetId: r.get('targetId'),
        sourceName: r.get('sourceName'),
        targetName: r.get('targetName'),
      }));

      res.json({
        success: true,
        data: {
          elements,
          connections,
          total: elements.length + connections.length,
        },
      });
    } catch (err) {
      console.error('[certification] pending error:', err);
      res.status(500).json({ success: false, error: 'Failed to load pending certifications' });
    }
  },
);

const CertifyBodySchema = z.object({
  elementIds: z.array(z.string()).optional(),
  connectionIds: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

/**
 * POST /:projectId/certification/certify
 * Beglaubigt Atome. `{all:true}` → alle pending; sonst die übergebenen IDs.
 * certifiedBy kommt SERVER-seitig aus req.user (nicht aus dem Body — Spoof-Schutz).
 */
router.post(
  '/:projectId/certification/certify',
  requireProjectAccess('editor'),
  audit({ action: 'certify_atoms', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const userId = (req as any).user?._id?.toString();
      if (!userId) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }
      const { elementIds, connectionIds, all } = CertifyBodySchema.parse(req.body);
      const now = new Date().toISOString();

      let elementsCertified = 0;
      let connectionsCertified = 0;

      if (all) {
        const e = await runCypher(
          `MATCH (e:ArchitectureElement {projectId: $projectId})
           WHERE e.provenance <> 'user' AND e.certifiedBy IS NULL
           SET e.certifiedBy = $userId, e.certifiedAt = $now
           RETURN count(e) AS n`,
          { projectId, userId, now },
        );
        elementsCertified = toNum(e[0]?.get('n'));
        const c = await runCypher(
          `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
           WHERE r.provenance <> 'user' AND r.certifiedBy IS NULL
           SET r.certifiedBy = $userId, r.certifiedAt = $now
           RETURN count(r) AS n`,
          { projectId, userId, now },
        );
        connectionsCertified = toNum(c[0]?.get('n'));
      } else {
        if (elementIds && elementIds.length > 0) {
          const e = await runCypher(
            `MATCH (e:ArchitectureElement {projectId: $projectId})
             WHERE e.id IN $ids AND e.certifiedBy IS NULL
             SET e.certifiedBy = $userId, e.certifiedAt = $now
             RETURN count(e) AS n`,
            { projectId, ids: elementIds, userId, now },
          );
          elementsCertified = toNum(e[0]?.get('n'));
        }
        if (connectionIds && connectionIds.length > 0) {
          const c = await runCypher(
            `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
             WHERE r.id IN $ids AND r.certifiedBy IS NULL
             SET r.certifiedBy = $userId, r.certifiedAt = $now
             RETURN count(r) AS n`,
            { projectId, ids: connectionIds, userId, now },
          );
          connectionsCertified = toNum(c[0]?.get('n'));
        }
      }

      res.json({
        success: true,
        data: {
          elementsCertified,
          connectionsCertified,
          certifiedBy: userId,
          certifiedAt: now,
        },
      });
    } catch (err) {
      console.error('[certification] certify error:', err);
      res.status(500).json({ success: false, error: 'Failed to certify' });
    }
  },
);

export default router;
