# Norm-Ontology — CHANGELOG

Versioned reference-data (ADR-0004 E6). Every change is a PR with an entry here and
a semver bump of `ontologyVersion` in `norm-ontology.v1.ts`. AI-suggestion records
and traces carry the `ontologyVersion` they were produced against (THE-384 join).

**Bump rules:** additive value (new id) → MINOR · rename/remove (breaking) → MAJOR +
migration note · label/metadata-only fix → PATCH.

## 1.10.0 — 2026-08-06 (THE-614)

* **Zwei neue `normSources`** — `esg-rating-en` und `esg-rating-de`: die
  **ESG-Rating-Verordnung (EU) 2024/3005** (CELEX `32024R3005`), seit dem
  2026-07-02 anwendbares Recht.

* **Warum:** Das erste ESG-Gesetz im Korpus. Die ESG-Strecke ist die
  Demo- und Kundenseite (BSH), und bis hierher lag dort keine einzige
  einschlägige Norm — die Korpus-Discovery aus THE-459 konnte auf ESG-Modellen
  per Konstruktion nichts finden, weil es nichts zu finden gab. Dieselbe
  Diagnose wie bei THE-511, nur eine Fachdomäne weiter.

* **Beide Sprachfassungen, wie seit 1.4.0 Regel.** Der kanonische Schlüssel ist
  `quelle:artikel` — ohne Sprach-Suffix überschriebe der zweite Crawl den ersten
  beim Upsert. Zusätzlich der belegte Retrieval-Grund: eine einsprachige Quelle
  punktet schlecht gegen ein anderssprachiges Architekturmodell.

* **Nebenbei der härtere Prüffall.** `esg-rating` hat — anders als `nis2` oder
  `lksg` — **keinen** suffixlosen Stammschlüssel. Ein Pfad, der Gruppenschlüssel
  und Normquelle verwechselt, fliegt hier auf statt still durchzugehen (der
  Fehler vom 2026-08-03, THE-570).

* **Rein additiv.** Keine bestehende id berührt, bestehende Labels und Prüfsätze
  bleiben gültig.

## 1.9.0 — 2026-08-02 (THE-545 / ADR-0007)

* **Neue Facette `displacements`** — konkrete Verdrängungs-Kanten (*lex specialis*), erste Kante: `dora-prevails-nis2`.

  Auslöser ist wie bei 1.6.0–1.8.0 eine **Messung**, keine Meinung. Bei der Durchrechnung des Kontroll-Katalogs am 2026-08-01 erwiesen sich **zehn von sechzehn** gesetzesübergreifenden Harmonisierungs-Kandidaten als rechtlich **gegenstandslos**: DORA erklärt sich in Art. 1 Abs. 2 zur lex specialis, NIS2 Art. 4 und ErwG 28 ziehen die Konsequenz und nennen DORA ausdrücklich. Für ein und denselben Adressaten können die Risikomanagement- und Meldepflichten beider Rechtsakte **nie gleichzeitig** gelten.

  Die Relationstypen `PREVAILS_OVER`/`DEROGATED_BY` gibt es seit v1.0 — als **Typen**. Eine konkrete Kante gab es nie, und deshalb konnte kein Konsument die Frage stellen.

* **Warum als Daten und nicht als Code:** Eine Verdrängung ist ein Fakt über das Recht, belegt am Primärtext, für alle Kunden identisch — genau die Sorte Wissen, die nach ADR-0004 in diese Datei gehört. `citations` ist Pflicht und verlangt **beide** Seiten der Herleitung: ein Audit muss lesen können, *warum* verdrängt wird.

* **Anwendbarkeit wird berechnet, nie gespeichert** (`findDisplacement(displacedSource, addresseeClass)`). Ob eine Kante beißt, ist eine Eigenschaft des **Adressaten**, nicht der Norm. `addresseeClass` ist die Klasse, FÜR DIE sie beißt: ein Finanzunternehmen ist zugleich wesentliche Einrichtung — eine wesentliche Einrichtung ohne Finanzaufsicht bleibt unter NIS2, und die DSGVO wird gar nicht verdrängt (DORA ErwG 16), sie gilt daneben.

* **Referenz-Integrität** in `assertOntologyValid`: `relationType`, beide `source`-Angaben und `addresseeClass` müssen existieren, und eine Norm darf sich nicht selbst verdrängen. Eine Kante auf eine erfundene Rolle wäre stumm — sie würde nie feuern und sähe aus wie „keine Verdrängung".

* **Rein additiv.** Bestehende Labels und Prüfsätze bleiben gültig; neu gelabelt wird gegen 1.9.0.

## 1.8.0 — 2026-08-01 (THE-438 / THE-538)

- **canonicalActions** NEU (26 Einträge) — additive Facette, keine bestehende id
  berührt. Bezugsgröße der Requirement-Harmonisierung: zwei Pflichten sind
  Kandidaten, wenn sie auf denselben Eintrag zeigen.
  Auslöser ist wie bei 1.6.0/1.7.0 eine **Messung**, keine Meinung. Drei
  Verfahren, die Pflichten über ihre FORMULIERUNG vergleichen — lexikalisch
  (Jaccard, Maximum 0,225, echter Treffer auf Rang 17), semantisch (Embedding-
  Paare) und gröber verdichtet — fanden **0 Treffer**. Der Fehler saß nicht in
  den Daten: Ähnlichkeit vergleicht Texte, gefragt ist aber, ob EINE Maßnahme
  beide Pflichten erfüllt.
  Die Zerlegung in ⟨Handlung·Adressat·Modalität·Bedingung⟩ und ein aus dem
  Korpus ABGELEITETES Handlungs-Vokabular (219 Pflichten aus DSGVO × NIS2 ×
  DORA → 216 freie Formulierungen → 26 Einträge, 218/219 zuordenbar) trennen
  dagegen sauber. Blinder Drei-Häuser-Richter (Haiku 4.5 · Opus 4.8 · Kimi K3):

  | Arm | Ergebnis in allen drei Häusern |
  | -- | -- |
  | Positiv-Kontrolle (dieselbe Pflicht) | 15/15 |
  | Negativ-Kontrolle (verschiedene Handlung) | **0/60** — 0 Fehlalarme auf 180 Urteile |
  | Gleiche kanonische Handlung | 37 % · 37 % · 47 % → Mehrheit 35 %, einstimmig 18 % |

  **Auflage:** κ zwischen den Häusern liegt bei 0,308–0,697 und damit unter dem
  Tor 0,80. Die Häuser sind sich über die Quote einig, über das einzelne Paar
  nicht. Die Facette trägt deshalb **Vorschläge, keine Behauptungen** — kein
  Auto-Merge (THE-438 Slice 1).

  Zwei Messfallen sind dabei aufgefallen und in den Prüfaufbau eingebaut:
  ungeblendete Gesetzesnamen lassen das Modell über das Etikett statt über den
  Text urteilen (wortgleicher Text unter zwei Etiketten: 7/15 statt 15/15), und
  eine fehlende Positiv-Kontrolle lässt ein Instrument, das nie „ja" sagt, wie
  einen sauberen Negativ-Befund aussehen.

## 1.7.0 — 2026-07-25 (THE-515)

- **partyRoles** (15 → 19) ERWEITERT — additiv, keine id geändert/entfernt:
  `conformity_assessment_body` (cross), `trust_service_provider` (eidas),
  `data_holder` (data-act), `ecs_provider` (eprivacy).
  Auslöser ist wieder eine **Messung**, keine Meinung: Golden v2 (2026-07-24) ergab
  auf der Achse `partyRole` in-sample 0,845, out-of-sample aber nur **0,668**. Die
  Fehleranalyse zeigte dasselbe Muster wie bei 1.6.0 — kein Modellproblem, sondern
  eine **Lücke im Werteraum**: Für vier real vorkommende Akteure gab es keinen
  passenden Wert, also wichen die Prüfer auf Ersatzrollen oder `n/a` aus.
  Belegdichte vorher am Korpus nachgemessen: Konformitätsbewertungsstelle **131**
  (KI-VO, CRA, MDR, eIDAS je DE/EN) · Vertrauensdiensteanbieter **46** (eIDAS 38) ·
  Dateninhaber **44** (Data Act) · ECS-Anbieter **14** (ePrivacy). Kein Vorratsvokabular.
  **Terminologie-Falle:** Derselbe Akteur heißt je nach Rechtsakt „Benannte Stelle"
  (MDR-DE, 50×), „notifizierte Stelle" (KI-VO/CRA-DE, 50×) oder
  „Konformitätsbewertungsstelle" (30×); englisch „notified body" vs. „conformity
  assessment body". EINE Rolle — das Label nennt deshalb alle Varianten, sonst ordnet
  das Modell nach Wortlaut statt nach Akteur zu.
  **Reihenfolge:** `conformity_assessment_body` trägt `origin: 'cross'`, steht aber
  bewusst NICHT am Ende. Die Positions-Invariante aus 1.6.0 meint nur die
  NICHT-regulierten Akteure (`member_state`, `supervisory_authority`) — die
  Konformitätsbewertungsstelle ist ein regulierter Akteur, der lediglich in vier
  Rechtsakten vorkommt.
  **Risiko (bewusst eingegangen, OntoLearner-Paper P2, arXiv:2607.01977):** Der
  Komplexitätswert des Papers gewichtet *Breadth* mit 20 %, sein zentraler Befund ist,
  dass Fehlermodi mit ontologischer Komplexität skalieren, nicht mit Modellgröße. Die
  Verbreiterung 15 → 19 ist damit eine gemessene Wette mit dokumentiertem Rückbaupfad
  (Plan `docs/superpowers/plans/2026-07-25-the-515-partyrole-170.md`, Task 6
  Abbruchregel: notfalls zurück auf die zwei bestbelegten Rollen als 1.7.1).
  **Bewusste Nicht-Aufnahme:** PSD2-Zahlungsinstitute → `financial_entity` (DORA Art. 2
  listet sie ausdrücklich). Nicht jedes neue Gesetz braucht eine Rolle.
  Fließt über die abgeleiteten Sets automatisch in `PARTY_ROLE_IDS`, `PartyRoleSchema`
  und den OntoLearner-Export (`termTypes.partyRole`).
  **Hinweis für alte Labels:** Eingefrorene Golden-Sets tragen weiterhin `1.5.0`/`1.6.0`
  (§ B6 — die Version bindet das Label an den Raum, gegen den gelabelt wurde). Sie
  bleiben gültig, weil die Änderung rein additiv ist; neu gelabelt wird gegen 1.7.0.

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
