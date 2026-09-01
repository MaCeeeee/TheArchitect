# ADR-0010: Metamodell-Erweiterung über ArchiMate-Spezialisierung — nicht über eigene Typen

- **Status:** Accepted (2026-08-07, Matthias Ganzmann)
- **Datum:** 2026-08-07
- **Entscheider:** Matthias Ganzmann (Enterprise Architect), im Grill-Verfahren (grill-with-docs) — 3 Entscheidungen einzeln bestätigt
- **Normbezug:** [ArchiMate 3.2 §4.5 — Language Customization Mechanisms](https://pubs.opengroup.org/architecture/archimate3-doc/ch-Language-Customization-Mechanisms.html) (Profiling + Specialization) — **in ArchiMate 4.0 (C260, April 2026) ist das Kapitel 14.2**; dort trägt Spezialisierung zusätzlich die Migration der entfernten Typen (`Gap`, `Constraint`, `Contract`, `Representation`, `*Interaction`). Die Entscheidung dieses ADRs gilt unter 4.0 unverändert und wird dort sogar zum offiziellen Weg — Versionslage und Auslöser siehe THE-709 · [ArchiMate Model Exchange File Format Guide](https://pubs.opengroup.org/architecture/archimate31-exchange-file-format-guide/)
- **Baut auf:** BSH-EAM-Wiki-Definition „Information Object" (2026-08-07, Screenshot im Gespräch) · Wettbewerbsrecherche 2026-08-07 (Ardoq, LeanIX, BizzDesign, Avolution, Sparx) · Prod-Bestandsmessung 2026-08-07 (13 Projekte, 704 Elemente) · `docs/customer/2026-08-07-bsh-gespraechsleitfaden.md` Block 0/3b · THE-625
- **Revidiert:** die Nicht-Standard-Typen `data_entity`/`data_model` aus der UC-DATA-001-Typerweiterung
- **Glossar:** `CONTEXT.md`, Abschnitt „Information Architecture (BSH-Scharnier)"

## Kontext

BSHs EAM-Wiki definiert das **Information Object** als Bindeglied zwischen Business Object
(Prozess-Input/-Output) und Data Object (Realisierung in einer Anwendung): implementierungsfreie
fachliche Attribute, Pflicht-Data-Owner, M:N zu Business Objects, „needs to be realizable by at
least one Data Object". Unsere eigene Typdefinition von `data_entity` („a logical data concept in
the data architecture") sagt fast wörtlich dasselbe — aber als **eigener Typ** mit
`standard: false`.

Der Zustand im Produkt war die einzige inkonsistente Position im Markt: Die Palette markiert
Nicht-Standard-Typen mit einem Warndreieck, das PropertyPanel (`LegacyTypeMigration`) fordert
aktiv zur Migration auf Standard-Typen auf — **und gleichzeitig erzeugen unsere eigenen Importeure
(n8n, BPMN) und Generator D laufend neue `data_entity`-Elemente.** Wir weichen ab und ermahnen uns
selbst dafür.

Der entscheidende Fund: **ArchiMate 3.2 §4.5 definiert den Erweiterungsmechanismus selbst** —
Profiling (Attribute) und Spezialisierung (abgeleitete Typen, Notation «Guillemets»). Kernsatz der
Spezifikation: eine Spezialisierung **ist** ihr Elterntyp; jede Beziehungsregel gilt mit, jede
Abfrage gegen den Elterntyp liefert Spezialisierungen mit.

Das ist kein Stil-, sondern ein Funktionsunterschied: Ein eigener Typ ist für jede bestehende
Auswertung **unsichtbar** — Anwendbarkeitsprüfung, Redundanz-Erkennung, Kritikalität und Viewpoints
filtern auf `business_object`/`data_object` und sehen ein `data_entity` schlicht nicht. Dieselbe
Fehlerklasse wie THE-627 (still ausfallender Schritt), nur als Typsystem: Elemente, die lautlos aus
allen Analysen herausfallen.

**Wettbewerbslage** (Recherche 2026-08-07): zwei kohärente Lager.
„Das Metamodell gehört dem Kunden" — [Ardoq](https://help.ardoq.com/en/articles/44184-flexible-workspace-metamodels)
(flexibel→starr ist **unumkehrbar**), [Avolution](https://www.avolutionsoftware.com/feature-comparison-enterprise-architecture-tool/)
(„keine Limitierungen"), Sparx (UML-Profile/MDG), [LeanIX](https://help.sap.com/docs/leanix/ea/custom-fact-sheet-types)
(eigenes Fact-Sheet-Modell) — mit dokumentierten Governance- und Datenqualitätskosten.
Dagegen „ArchiMate **ist** das Metamodell, erweitert über den Standard-Mechanismus" —
[BizzDesign](https://support.bizzdesign.com/display/knowledge/Properties+for+metamodel+profiles,+attributes+and+data+types)
(Beispiel dort: „threat agent" als Spezialisierung von business actor). Wir standen in keinem Lager.

**Bestandsmessung Prod** (2026-08-07, alle 13 Projekte, 704 Elemente): genau **4 × `data_entity`,
0 × `data_model`** — alle vier im Projekt Fugu, alle vier vom n8n-Importeur erzeugt
(Supabase/Postgres-Knoten), eine einzige Kante (`process —access→`), die nach Umtypung auf
`data_object` ArchiMate-legal bleibt. Kein Mensch und kein Generator hat je von Hand ein
`data_entity` angelegt. Der Blast-Radius einer Ablösung ist damit historisch minimal und wächst
mit jedem Importer-Lauf.

## Entscheidungen

**E1 — Erweiterung ausschließlich über ArchiMate-Spezialisierung (§4.5).** Ein Element trägt ein
Profil (z. B. `business_object` «Information Object») und bleibt dabei sein Grundtyp. Konsequenz
per Konstruktion: **alle bestehenden und künftigen Auswertungen sehen spezialisierte Elemente
automatisch** — keine `DATA_TYPES`-Mengenpflege, keine Sonderfälle in Queries. Darstellung in
Palette/Panel in Guillemet-Notation.

**E2 — Keine kundeneigenen Typen, nie.** Wir sanktionieren Spezialisierungen vorhandener
ArchiMate-Typen; Kunden definieren keine neuen Grundtypen. Das ist die Leitplanke gegen die
Ardoq-Drift zum Metamodell-Editor: deren Governance-Preis ist am Markt dokumentiert
(Survey-Müdigkeit, Datenqualität), und deren Rückweg existiert nicht (flexibel→starr unumkehrbar).
Ein projektweises „Opt-in" für Abweichungen — die ursprüngliche Frage — **entfällt als Konzept**:
eine standardkonforme Spezialisierung braucht keine Sanktionierung.

**E3 — Das BSH-Scharnier fällt vollständig auf Standard.**

| BSH-EAM-Wiki | bei uns |
|---|---|
| Business Object | `business_object` |
| Information Object | `business_object` «Information Object» |
| Data Owner (Pflicht) | `business_role —assignment→ business_object «Information Object»` |
| Data Object (SAP Material, Teamcenter Part Item) | `data_object`, `—realization→` aufs Informationsobjekt |
| „Relation itself holds Information" | reifizierte Beziehung als eigenes «Information Object» — der Ort für **direkt/abgeleitet** einer Tag-Zuordnung |

BSHs Metamodell ist damit ArchiMate-kompatibler, als ihr Diagramm aussehen lässt — ihre Regel
„realizable by at least one Data Object" ist wörtlich die ArchiMate-Realization.

**E4 — `data_entity` und `data_model` werden vollständig abgelöst.** Die vier Fugu-Elemente
migrieren auf `data_object`; die Erzeuger werden umgestellt (`n8nParser`/`n8n.connector`,
`bpmnParser`, Generator-D-Schema, `ai.service`-Promptlisten, `analytics`-Kostenzeilen,
`DATA_TYPES`-Mengen). `LegacyTypeMigration` behält Name und Zweck, richtet sich künftig auf
Fremd-Importe. **Nicht Teil dieses ADR:** die Importeur-Fachlichkeit (eine Postgres-Instanz ist
kein logisches Datenkonzept — sauber wäre `system_software` + `data_object`); das ist ein eigener
Folgepunkt. Die Ablösung betrifft die zwei **Typen**, nicht die Daten-/Informations-Ebene als
Darstellungs- und Domänen-Zuordnung.

**E5 — Export-Degradierung ist der Normalfall, keine Sonderlogik.** Das Model Exchange Format
transportiert Spezialisierungen nicht als eigene Typen; das Profil reist als Property, der Typ
bleibt der Elterntyp. Der Verlust ist offen benannt und trifft jeden ArchiMate-Anbieter gleich.
Nebengewinn für den Import: Sparx-Stereotypen (BSHs CSV-Export vom 2026-08-07) und unsere
Spezialisierungen sind derselbe Begriff — ein Sparx-Profil im Importer wird damit ein
Mapping-Problem, kein Metamodell-Problem.

## Preis, offen benannt

- Beim Exchange-Export ist «Information Object» nur eine Property — andere Werkzeuge sehen ein
  `business_object`. Verlustbehaftet, aber branchenweit identisch.
- Guillemet-Darstellung und Profil-Feld müssen in Palette, PropertyPanel und Suche eingezogen
  werden, sonst bleibt die Spezialisierung unsichtbare Metadaten.
- Sechs Codestellen + vier Elemente Migration; das Kostenmodell verliert zwei Zeilen
  (`data_entity: 10000`, `data_model: 8000`) — Fugu-Kostenschätzung verschiebt sich marginal.

## Verworfene Alternativen

| Verworfen | Warum |
|---|---|
| **Projekt-Positivliste** (`settings.metamodelProfile` sanktioniert `data_entity` je Projekt) | Löst nur das Nörgeln, behält die Abfrage-Blindheit des eigenen Typs; gleicher Aufwand, schlechteres Ergebnis |
| **Kundeneigene Typen** (Ardoq-Weg) | Fremder Burggraben; dokumentierte Governance-Kosten; Flexibilisierung unumkehrbar; unser Wert liegt in der Norm-Schiene, nicht im Metamodell-Editor |
| **Einfrieren** (Typen bleiben, kein Erzeuger mehr) | Tote Ecke im Typraum — Verständnislast ohne Gegenwert, und der Sondertyp bleibt in jeder Query ein Denk-Muss |
| **`data_entity` behalten + alle Analysen erweitern** | Genau die Change Amplification, die das Facts-Design (THE-411) eliminiert hat: jede neue Analyse müsste an den Sondertyp denken |
