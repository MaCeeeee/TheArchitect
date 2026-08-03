# RVTM — THE-559: Prüfer-Bündel (Slice 3 von UC-ATTEST-001)

**Plan:** `docs/superpowers/plans/2026-08-03-the559-audit-bundle.md` · **Parent:** THE-552

| ID | Anforderung | Task | Verifikation | Status |
|---|---|---|---|---|
| AC-1 | Export je Norm: Anforderungen mit Tripel + Evidenz-Kette (ref, Hash, Datum, Textstand, supersedes) | 1, 2 | Builder-Tests + Route | ✅ |
| AC-2 | Bündel behauptet nur, was die Tore hergeben — „covered, not attested" wird nicht geschönt | 1 | Test: honesty-Label; kein score/percent-Schlüssel | ✅ |
| AC-3 | `stale` erscheint **als stale mit Grund**, nicht gefiltert | 1 | Test: stale in Ausgabe + Grund | ✅ |
| AC-4 | PDF + JSON, beide mit Erzeugungszeit, Textstand, Disclaimer | 1, 2 | %PDF-Magic + JSON-Felder | ✅ |
| AC-5 | Export auditiert (wer, wann, welches Bündel) | 2 | `createAuditEntry` in der Route | ✅ |
| N-1 | Norm ohne attestierte Anforderung ⇒ **gültiges** Bündel mit wörtlicher Null-Aussage | 1 | Test | ✅ |

**Grenze:** Das Bündel exportiert den *Stand*, keine Rechtsberatung — Disclaimer in beiden Formaten. Evidenz-Sichtbarkeit für Nutzer läuft über dieses Bündel (API-first-Zusage aus THE-558 eingelöst).
