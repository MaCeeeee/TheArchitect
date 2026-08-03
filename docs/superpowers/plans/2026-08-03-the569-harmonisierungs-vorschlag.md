# THE-569 (Slice B) — Harmonisierungs-Vorschlag Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Auf **expliziten** Aufruf schlägt das System vor, dass N Ketten-Systemanforderungen aus M Gesetzen dasselbe realisierende Element teilen könnten; ein **Mensch** bestätigt die Teilung, und erst dann wird verlinkt (REQ-REQTRACE-001.5b / THE-569). Verdrängte Paare erreichen den Richter nie und erscheinen als eigener Fall.

**Architecture:** `groupIntoMeasures` (die gemessene Maßnahmen-Bildung aus Lauf 4, samt Verdrängungs-Gate via `displacementGate.service`) bleibt die EINE Quelle — ein neuer `harmonization.service` liefert ihr produktive Inputs und zwei Routen konsumieren sie:
1. **Anreicherung:** `ChainSystemRequirement` → `GroupableSysReq` braucht `source` (mechanisch aus `StakeholderRequirement.regulationKey`-Präfix), `actionId` (Produktions-Klassifikator `classifyObligation`, am Dokument **gecacht mit `ontologyVersion`**) und `addresseeClass` — im Eval kam sie aus dem handkuratierten Fixture; im Produkt kommt sie aus einem **mechanischen Lexikon** über den `verpflichteter`-Freitext. Unmappbares nimmt NICHT an der Paar-Bildung teil und wird als Quote ausgewiesen (ehrlich statt falsch gepaart).
2. **Vorschlag (POST, explizit):** Judge-Lauf mit ausgewiesener Deckelung; Response trägt Kandidaten-Gruppen, `excludedByDisplacement` als eigenen Fall, alle Quoten und `pairsJudged` (Kosten sichtbar — der Pre-Flight-Watch-Point).
3. **Bestätigung (POST, editor, auditiert):** Der Mensch wählt das geteilte Element **aus den bereits verlinkten Elementen der Gruppen-Mitglieder** (THE-551-Leitplanke: das System schlägt die GRUPPE vor, nie das Element) → `$addToSet` an alle Mitglieder + covered-Recompute (Muster THE-568).

**Ehrliche Grenzen (Code-Kommentar + RVTM):**
- Das Adressaten-Lexikon ist musterbasiert und unvollständig — `unmappedAddressee` ist eine sichtbare Quote, kein stilles Loch. Der saubere Weg (Korpus-Typisierung `partyRole` je Provision, THE-540) folgt mit dem Korpus-Anschluss der Kette.
- Der Vorschlag arbeitet auf `ChainSystemRequirement` (Phase-1-Kette) — REQGEN-Alt-Dokumente ohne Kette haben keine vier Schlüsselfelder und nehmen nicht teil (Provenienz-Trennung, ADR-0008).
- Bestätigung setzt voraus, dass ≥ 1 Mitglied bereits ein Element trägt (via Remediation THE-568 oder manuellem Mapping); sonst 400 mit klarer Botschaft („link an element first").

**Tech Stack:** TypeScript, Mongoose, jest + memory-server, Stub-judge/ask in Tests (kein LLM in CI), vitest fürs UI.

**RVTM:** docs/superpowers/rvtm/2026-08-03-the569-harmonisierungs-vorschlag-rvtm.md

---

## Task 1: Adressaten-Lexikon — `verpflichteter`-Freitext → `PartyRoleId`

**Files:**
- Create: `packages/server/src/services/addresseeLexicon.ts`
- Test: `packages/server/src/__tests__/addresseeLexicon.test.ts`

- [x] **Step 1: Failing test** — `mapVerpflichteterToPartyRole(text)`: „wesentliche Einrichtung"/„wichtige Einrichtungen" → `essential_important_entity`; „Finanzunternehmen" → `financial_entity`; „Verantwortlicher" → `controller`; „Auftragsverarbeiter" → `processor`; Groß-/Kleinschreibung + Plural tolerant; „Zahlungsdienstleister nach PSD2" (unbekannt) → `null` — **kein Raten**; jede gemappte Klasse ist ein gültiges `PartyRoleId` der Ontologie (`isPartyRole`).
- [x] **Step 2: rot** · **Step 3: Implementierung** — eine Datenzeile je Muster (Regex → PartyRoleId), Kommentar-Kopf: bewusst konservativ, Erweiterung = Eintrag, kein Umbau; Lauf-4-`verpflichteter`-Formen als Quelle der Startmuster.
- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-569): addresseeLexicon — Freitext-Verpflichteter mechanisch zur Ontologie-Klasse, null statt raten`

## Task 2: Anreicherung — `harmonization.service.buildGroupables`

**Files:**
- Modify: `packages/server/src/models/ChainSystemRequirement.ts` (additiv: `actionClassification?: { actionId: string | null; ontologyVersion: string }`)
- Create: `packages/server/src/services/harmonization.service.ts`
- Test: `packages/server/src/__tests__/harmonizationBuildDb.test.ts` (memory-server, Stub-ask)

- [x] **Step 1: Failing test** — Fixtures: 3 ChainSysReqs (2× nis2 via StR `regulationKey 'nis2:art23'`, 1× dora) mit `verpflichteter` „wesentliche Einrichtung"/„Finanzunternehmen":
  - `buildGroupables(projectId, {ask})` liefert `GroupableSysReq[]` mit `source` aus dem Key-Präfix, `addresseeClass` aus dem Lexikon, `actionId` aus Stub-classify; die vier Schlüsselfelder durchgereicht.
  - **Cache:** zweiter Aufruf macht 0 classify-Calls (Zähler am Stub); Cache trägt `ontologyVersion` — bei abweichender Version wird NEU klassifiziert.
  - `verpflichteter` unbekannt → Anforderung fehlt in der Rückgabe, `stats.unmappedAddressee` zählt; classify unlesbar → `stats.unclassified` zählt.
- [x] **Step 2: rot** · **Step 3: Implementierung** (Cache-Write additiv am Doc; Kommentar: warum ontologyVersion am Cache — eine Klassifikation ohne Katalog-Stand ist später nicht deutbar, THE-438-Muster).
- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-569): buildGroupables — Anreicherung mit actionId-Cache (ontologyVersion) + Lexikon, Quoten sichtbar`

## Task 3: Vorschlag + Bestätigung — Service-Funktionen

**Files:**
- Modify: `packages/server/src/services/harmonization.service.ts`
- Test: `packages/server/src/__tests__/harmonizationProposeDb.test.ts`

- [x] **Step 1: Failing test:**
  - `proposeSharedMeasures(projectId, {ask, judge, maxJudgedPairs})` (Stub-judge liefert `intersects`-Urteil für das nis2×dsgvo-Paar): Response enthält 1 Kandidaten-Gruppe (memberIds, `laws` ≥ 2, gemeinsame actionId), `excludedByDisplacement` mit dem nis2×dora-Paar **samt Zitat** (der Richter-Stub wurde für dieses Paar NIE gerufen — Spy), `stats` {pairsJudged, pairsCapped, unmappedAddressee, unclassified}.
  - `confirmSharedMeasure({projectId, requirementIds, elementId, userId})`: `elementId` hängt an Mitglied A → nach Confirm tragen ALLE Mitglieds-**ComplianceRequirements** das Element (`$addToSet` über die `chain.systemRequirementId`-Rückverweise), covered recomputed, menschliche Tore unangetastet; `elementId` an KEINEM Mitglied → 400-Fehler („link an element first").
- [x] **Step 2: rot** · **Step 3: Implementierung** — `proposeSharedMeasures` = buildGroupables → `groupIntoMeasures` (EINE Quelle, kein Fork); confirm joint `ComplianceRequirement` über `chain.systemRequirementId ∈ requirementIds` und nutzt das `$addToSet`+Recompute-Muster aus `remediationBacklink`.
- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-569): propose/confirm — groupIntoMeasures produktiv, Verdraengung als eigener Fall, Mensch verlinkt`

## Task 4: Routen — explizit, editor, auditiert

**Files:**
- Modify: `packages/server/src/routes/requirements.routes.ts` (POST `/:projectId/requirements/harmonization/propose` + `/confirm`)

- [x] **Step 1–3 (TDD am Zod-Schema + dünner Handler):** propose: `requireProjectAccess('editor')`, Rate-Limit (Muster `generateRateLimit`), Body `{maxJudgedPairs?}` (Default 50, Obergrenze 200); Antwort = Service-Result + Quoten. confirm: editor, Zod `{requirementIds: string[]≥2, elementId, reason?}`, `audit()` riskLevel high, Antwort mit `linkedRequirements`.
- [x] **Step 4: tsc + Routen-Reihenfolge geprüft** (keine `:id`-Route fängt `/harmonization/*` — Lektion audit-bundle) · **Step 5: Commit** `feat(the-569): Harmonisierungs-Routen — explizit, gedeckelt, auditiert`

## Task 5: UI — Kandidaten sichtbar, Mensch bestätigt

**Files:**
- Create: `packages/client/src/components/compliance/SharedMeasuresPanel.tsx`
- Modify: `packages/client/src/services/api.ts` (Typen + `harmonizationAPI`), CompliancePage (Montage)
- Test: `packages/client/src/components/compliance/SharedMeasuresPanel.test.tsx` (vitest, api gemockt)

- [x] **Step 1: Failing test** — Klick „Propose shared measures" → Kandidaten-Gruppe gerendert (Titel der Mitglieder, Rechtsakte, gemeinsame Handlung), Fehlerrest-Satz sichtbar („In about 1 of 3 cases…" — Muster Generator-Modal), verdrängte Paare als eigener Info-Block („mutually exclusive regimes"), Quoten-Zeile; Confirm-Button disabled, solange kein Element gewählt (Auswahl = verlinkte Elemente der Mitglieder aus der Response).
- [x] **Step 2: rot** · **Step 3: Implementierung** (UI-Strings Englisch; Dark-Theme-Palette wie Bestand) · **Step 4: vitest + client tsc grün** · **Step 5: Commit** `feat(the-569): SharedMeasuresPanel — Vorschlag sichtbar, Bestaetigung braucht Mensch + Element`

## Task 6: RVTM + Abschluss

- [x] RVTM gegen alle 5 THE-569-ACs; Gesamtlauf (neue Suiten + `measureGrouping.test.ts` + `displacementGateSvc.test.ts` + `remediationBacklinkDb.test.ts` + Gates + client); Commit, Push, PR; Merge nach letztem Push + Stichprobe.
