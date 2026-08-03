# RVTM — THE-558: Evidence-Objekt (Slice 2 von UC-ATTEST-001)

**Plan:** `docs/superpowers/plans/2026-08-03-the558-evidence.md` · **Parent:** THE-552 (85,7)
**Muster:** WORM THE-445 · Version-Lock THE-306 · Drift THE-368 · Notar THE-557

Status: ⬜ offen · ✅ verifiziert

| ID | Anforderung | Task | Verifikation | Status |
|---|---|---|---|---|
| AC-1 | `Evidence` bindet an EIN Requirement; `kind` Freitext (THE-553 liefert den Werteraum später — kein zweiter Katalog), `ref`, `sha256` (64 hex), `collectedAt`, `collectedBy` server-seitig | 1, 2 | validateSync + Zod ohne `collectedBy` | ✅ |
| AC-2 | Alterung nach Version-Lock: `regulationKey`+`regulationVersionHash`; Drift ⇒ `stale`, nie gelöscht, nie still weitergezählt | 1, 3 | Unit `isFreshEvidence`; Drift-Pass zählt `evidenceStaled` im Bericht | ✅ |
| AC-3 | `attested` verlangt ≥1 nicht-stale Evidenz | 2 | Route-Guard: 400 mit benanntem Grund | ✅ |
| AC-4 | Append-only: Korrektur = neuer Eintrag mit `supersedes`, kein Update | 1 | WORM-Helper-Test + `pre('save')` | ✅ |
| AC-5 | Kein Token/Zugangsdatum in `ref`/Metadaten | 1 | `refCarriesCredentialMaterial` als Schema-Validator, 4 Musterfälle | ✅ |
| P-1 | frische Evidenz ⇒ `attested` setzbar; nach simulierter Novelle wird sie `stale` und `attested` fällt auf `unknown` **mit sichtbarem Grund** | 1, 3 | Unit `resetAttestedForStale` + Drift-Pass-Logik | ✅ |
| N-1 | `attested` ohne Evidenz ⇒ 400 mit Grund | 2 | Route-Guard | ✅ |
| N-2 | `stale` Evidenz zählt nicht — auch als einzige | 2 | Guard filtert `stale !== true` | ✅ |

**Benannte Grenzen:** Evidenz-Erfassung API-first (UI-Fläche mit Slice 3) · `sha256` liefert der Erfasser — der Server holt fremde Refs bewusst NICHT selbst (SSRF) · `regulationKey`-lose Evidenz altert nicht automatisch (ausgewiesen, nicht versteckt).
