# THE-559: Prüfer-Bündel — Implementierungsplan (kompakt)

**Goal:** Export je Norm — Gates-Tripel + Evidenz-Kette als PDF und JSON, auditiert; das Bündel behauptet nur, was die Tore hergeben.

**Architecture:** Reiner Bundle-Builder + PDF-Renderer (`auditBundle.service.ts`, pdfkit-Muster aus `report.service.ts`); eine GET-Route in `requirements.routes.ts`; ein Download-Button in der CompliancePage. **Ein** Bündel je Projekt, innen **je Norm eine eigene, in sich vollständige Sektion** (inkl. der ausdrücklichen Null-Aussage) — optional per `regulationId` auf eine Norm gefiltert.

**RVTM:** `docs/superpowers/rvtm/2026-08-03-the559-audit-bundle-rvtm.md` · **Ticket:** THE-559 (Slice 3 von THE-552)

## Tasks

### Task 1: Reiner Builder + PDF (TDD)
- `buildAuditBundle(input)` → JSON: je Norm-Sektion Anforderungen mit Tripel (`honesty`-Label „covered, not attested"), Evidenz-Kette (ref, sha256, collectedAt, Textstand, `supersedes`, **stale mit Grund, nie gefiltert**), Zählungen je Tor-Zustand (**keine Prozentzahl, kein Score**), Erzeugungszeit + Disclaimer; Norm ohne attestierte Anforderung → wörtliche Null-Aussage.
- `renderAuditBundlePdf(bundle)` → Buffer.
- Tests: Ehrlichkeits-Label · stale sichtbar statt gefiltert · Null-Aussage · kein `percent`/`score`-Schlüssel · `%PDF`-Magic · supersedes in der Kette.

### Task 2: Route + Audit
- `GET /:projectId/requirements/audit-bundle?format=json|pdf&regulationId?` (viewer) — Requirements + Evidenzen (ein `$in`-Read) + Regulation-Titel; `createAuditEntry('requirements.audit-bundle.export')` mit Format und Umfang.

### Task 3: Client
- `requirementsAPI.auditBundle` (blob) + kompakter Download-Button in der CompliancePage (PDF · JSON).

### Task 4: Abschluss
- Suiten + tsc · RVTM · PR + Merge + Nachprüfung origin/master · THE-559 Done · **THE-552 schließen** (alle drei Slices) mit Gesamt-Kommentar.
