# Norm-Ontology — CHANGELOG

Versioned reference-data (ADR-0004 E6). Every change is a PR with an entry here and
a semver bump of `ontologyVersion` in `norm-ontology.v1.ts`. AI-suggestion records
and traces carry the `ontologyVersion` they were produced against (THE-384 join).

**Bump rules:** additive value (new id) → MINOR · rename/remove (breaking) → MAJOR +
migration note · label/metadata-only fix → PATCH.

## 1.6.0 — 2026-07-21 (THE-421 / THE-430, Gate 1)

- **partyRoles** (9 → 15) ERWEITERT — additiv, keine id geändert/entfernt:
  `essential_important_entity` (nis2), `financial_entity` + `ict_third_party_provider`
  (dora), `manufacturer` (cra), `obligated_enterprise` (lksg), `member_state` (cross).
  Anlass ist eine **Messung**, keine Meinung: Der Zwei-Prüfer-Lauf auf dem
  Typing-Golden ergab auf der Achse `partyRole` Kappa **0,597** — knapp unter dem
  Freeze-Tor 0,6. Die Analyse der 24 Abweichungen zeigte, dass die Rubrik nicht
  unklar war, sondern der **Werteraum unvollständig**: Die Facette kannte nur
  DSGVO-Rollen (controller/processor/data_subject) und KI-VO-Produktrollen
  (provider/deployer/importer/…). Für eine NIS2- oder DORA-Vorschrift passte
  keine davon, also wählten die Prüfer beliebig verschiedene Ersatzrollen auf
  derselben Vorschrift. Eine fehlende Klasse lässt sich nicht durch schärfere
  Prosa heilen. Alle sechs Werte sind vorher am Korpus belegt worden
  (wesentliche/wichtige Einrichtung 11 DE + 18 EN, Finanzunternehmen 42,
  IKT-Drittdienstleister 31, Hersteller/manufacturer 35/39, Mitgliedstaaten 156,
  LkSG-Unternehmen) — kein Vorratsvokabular.
  Reihenfolge: regime-spezifische Rollen nach Gesetz gruppiert, `origin: 'cross'`
  (`member_state`, `supervisory_authority`) am Ende. Fließt über die abgeleiteten
  Sets automatisch in `PARTY_ROLE_IDS`, `PartyRoleSchema` und den
  OntoLearner-Export (`termTypes.partyRole`).
  Begleitend in `packages/server/src/evals/RUBRIC.md` (B-v1.2): Definitions- und
  Geltungsbereichs-Provisions bekommen `n/a`, und das Vokabular des jeweiligen
  Gesetzes hat Vorrang vor einer fremden Ersatzrolle.
  **Hinweis für alte Labels:** Eingefrorene Golden-Sets tragen weiterhin
  `ontologyVersion: "1.5.0"` (§ B6 — die Version bindet das Label an den Raum,
  gegen den gelabelt wurde). Sie bleiben gültig, weil die Änderung rein additiv ist;
  neu gelabelt wird gegen 1.6.0.

## 1.5.0 — 2026-07-20 (THE-421 Slice G-0)

- **provisionKinds** (6, E6) NEU — additiv, keine id geändert/entfernt: `scope-applicability`,
  `definition`, `obligation`, `enforcement-supervision`, `procedural`, `other`. Fünfte
  Typing-Achse: "welche Art Vorschrift ist dieser Paragraph?" — orthogonal zu
  `obligationKinds` (das ist der deontische Gehalt EINER Pflicht-Vorschrift).
  Zwei Gründe: (a) ein Prod-Befund zeigte, dass der Law-Discovery-Judge nur
  Enforcement-Paragraphen bekam und nie den Geltungsbereichs-Artikel — Retrieval
  muss Scope-Vorschriften priorisieren; (b) Requirement-Harmonisierung muss
  Pflichten mit Pflichten vergleichen, nicht mit Verfahrensvorschriften. Bewusst
  klein gehalten, `other` als Auffangbecken. Fließt in den OntoLearner-Export
  (`termTypes.provisionKind`) + `ProvisionKindSchema` / `isProvisionKind`.

## 1.4.0 — 2026-07-19 (THE-511)

- **normSources** (13, E6) NEU — additiv, keine id geändert/entfernt:
  - **Regel-lose Gesetze** (UC-LAW-002 Discovery-Wert, DE+EN): `cra-en`/`cra-de` (Cyber
    Resilience Act 2024/2847), `mdr-en`/`mdr-de` (MDR 2017/745), `psd2-en`/`psd2-de`
    (PSD2 2015/2366), `eprivacy-en`/`eprivacy-de` (2002/58/EC), `eidas-en`/`eidas-de`
    (910/2014). Diese kennen die 7 LAW-001-Regeln NICHT → nur über den Korpus entdeckbar.
  - **Sprach-Vollständigkeit** (cross-linguales Retrieval, DSGVO-Blindfleck 2026-07-19):
    `dsgvo-en`, `nis2-de`, `dora-de` — die fehlende Sprache zu den bestehenden Demo-Gesetzen.
  - Crawl-Parameter (celex/language/voll) in `compliance-crawler/crawl-config.ts`;
    bestehende Teil-Crawls (dsgvo/nis2/dora/lksg) dort gleichzeitig auf ganze Gesetze
    aufgebohrt (Regel: immer ganze Gesetze crawlen).

## 1.3.0 — 2026-07-12 (THE-430 / THE-432)

- **obligationKinds** (3, E6) NEU: obligation, prohibition, permission — der deontische
  von-Wright-Kern als geschlossener Label-Raum fürs Term Typing (THE-432). Bewusst
  minimal (höchstes Inter-Annotator-Agreement); feinere funktionale Typen
  (exemption/notification/…) wären additive Zeilen. Fließt in den OntoLearner-Export
  (`termTypes.obligationKind`) + `ObligationKindSchema` / `isObligationKind`.

## 1.0.0 — 2026-07-07 (THE-429)

Initial ontology. Seeds the E6/E7/E8-R5 vocabularies from ADR-0004:

- **normKinds** (8): legislation, implementing_act, delegated_act, technical_standard,
  guideline, trust_framework, court_decision, executive_order.
- **bindingness** (4): binding, binding-for-agencies, voluntary-de-facto, persuasive.
- **relationTypes** (12, E7) with `derivation` (metadata|inferred) — the parser-vs-LLM
  boundary (THE-433 AC-5). Metadata: AMENDS, CONSOLIDATES, REPEALS, CITES. Inferred:
  TRANSPOSES, IMPLEMENTS, CONCRETIZES, DEROGATED_BY, PREVAILS_OVER, SETS_PARAMETER,
  RECOGNIZES_EQUIVALENCE, INTERPRETS.
- **partyRoles** (9): GDPR + AI Act addressee roles.
- **maturityScales** (4): W3C, IETF, ISO, EU-legislative.
- **jurisdictions** (4): EU, DE, AT, CH — CH carries the full lifecycle incl.
  `referendum_passed` (BGEID showcase).
- **assuranceSchemes** (3, E8-R5): eIDAS (LoA), NIST SP 800-63 (IAL/AAL/FAL), UK GPG 45.
- **normSources** (10): collapse target for the triplicated `RegulationSource` enum;
  AI Act / Data Act (THE-396) present as data rows, proving "new law = data, not code".

## 1.1.0 — 2026-07-09 (THE-413)
- normSources: + `togaf`, + `archimate` (PolicySource enum collapse; The Open Group framework sources become registry data). Additive — no id changed or removed.

## 1.2.0 — 2026-07-10 (THE-417)
- **languages** (2, new facet): `de`, `en` — collapse target for the closed `RegulationLanguage` TS union + the `enum: ['de','en']` model fields (Regulation, crawler Regulation).
- normKinds: + `framework`, + `custom` — the two kinds `kindFromStandardType` (norm.service.ts) already produces for upload-world norms that were missing from the ontology. Additive — no id changed or removed.
