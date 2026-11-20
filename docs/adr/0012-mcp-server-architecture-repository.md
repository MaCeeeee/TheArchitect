# ADR-0012: MCP-Server — das Architektur-Repository als geprüfte Wissensquelle für fremde KI-Clients

- **Status:** Proposed (Entwurf, 2026-11-20) — noch nicht im Grill-Verfahren bestätigt
- **Datum:** 2026-11-20
- **Entscheider:** Matthias Ganzmann (Enterprise Architect) — ausstehend
- **Normbezug:** [Model Context Protocol, Spezifikation](https://modelcontextprotocol.io/specification) (Transport „Streamable HTTP", Authorization, Tool-Annotations `readOnlyHint`/`destructiveHint`)
- **Baut auf:** Bewertung von [`gogoymh/auto-ontology-mcp`](https://github.com/gogoymh/auto-ontology-mcp) (2026-11-14, nur README gelesen, Code nicht geprüft) · ADR-0004 (Norm-Ontologie als versionierte Referenzdaten) · ADR-0010 (Metamodell = ArchiMate + Spezialisierung) · `packages/shared/src/constants/archimate-rules.ts` · `packages/server/src/middleware/{auth,rbac,projectAccess,audit,rateLimit}.middleware.ts`
- **Ticket:** — (noch anzulegen)

## Kontext

Kunden-Architekten arbeiten zunehmend in fremden KI-Clients (Claude, ChatGPT, Copilot, Cursor). Fragen
wie „Welche Anwendungen hängen am Kundenstamm?" oder „Welche Normen gelten für dieses Projekt?"
beantwortet dort heute ein Modell **ohne** Zugriff auf unser Repository — es rät aus dem Gespräch.
Unser eigener Copilot (`POST /:projectId/ai/chat`) erreicht nur Nutzer, die in TheArchitect sitzen.

Was wir haben, ist genau das, was einem fremden Modell fehlt: ein **typisiertes** Modell (ArchiMate +
Spezialisierung, ADR-0010), deterministische Regeln (`isValidRelationship`, `getValidRelationships`),
eine versionierte Norm-Ontologie (`ontologyVersion`, ADR-0004) und Provenance mit Zertifizierung
(`Provenance = 'user' | 'import' | 'ai_generated' | 'mcp_discovered'`, `confidence`). Ein MCP-Server
macht diese Prüfbarkeit für fremde Modelle nutzbar.

**Befund aus `auto-ontology-mcp`** (2026-11-14): Das Projekt zeigt ein übertragbares Muster —
*das Modell macht die Sprachschritte, der Server alles Prüfbare* (Antwortbarkeit vorab prüfen,
Abfragen gegen die Ontologie validieren, „nicht abgedeckt" ausdrücklich sagen). Es ist selbst aber
**nicht** einsetzbar: Python + SQLite, Einzelplatz, kein RBAC, Datenbank-Passwörter im Klartext,
nur relationale Quellen. Wir übernehmen das Muster, nicht den Code.

**Bestandsaufnahme im Code** (2026-11-20):
- Kein MCP-Server, keine Abhängigkeit auf `@modelcontextprotocol/sdk`.
- API-Keys existieren bereits: `ta_`-Präfix, SHA-256, `permissions[]` als Scope
  (`auth.middleware.ts`), `rbac.middleware.ts` kennt eine `READ_PERMISSIONS`-Menge.
- Neo4j-Abfragen sind durchgängig über `projectId` gescoped (`MATCH (e:ArchitectureElement {projectId: $projectId})`).
- Der Provenance-Wert `mcp_discovered` wird in `certification.routes.ts` **gezählt, aber nirgends gesetzt**.

## Entscheidungen

**E1 — Eigener MCP-Server in TypeScript, im bestehenden Express-Server.** Ein Router unter
`/api/mcp` mit Transport „Streamable HTTP" (offizielles TypeScript-SDK). Die Tools sind **dünne
Adapter auf bestehende Services** — keine zweite Fachlogik. Begründung: Authentifizierung,
Projekt-Zugriff, RBAC, Audit und Rate-Limit existieren als Middleware und gelten damit per
Konstruktion auch für MCP. Ein separater Prozess müsste all das nachbauen oder über REST tunneln.

**E2 — v1 ist ausschließlich lesend.** Jedes Tool trägt `readOnlyHint: true`. Schreiben kommt
frühestens in einer späteren Ausbaustufe und dann **nur als Vorschlag**: Elemente mit
`provenance: 'mcp_discovered'`, Status Entwurf, Weg durch die bestehende `CertificationQueue`.
Kein MCP-Tool setzt je direkt einen zertifizierten Stand. Damit bekommt der bisher tote
Provenance-Wert seinen vorgesehenen Erzeuger — aber erst nach v1.

**E3 — Kein freies Cypher, nur typisierte Tools.** Das Modell schickt Parameter, nie Abfragetext.
`projectId` wird bei jedem Aufruf gegen die Projektmitgliedschaft geprüft (Logik aus
`requireProjectAccess`) und als Cypher-Parameter gebunden. Begründung: In einer Mehrmandanten-
Datenbank ist eine freie Abfrage — auch validiert — eine Leckfläche über Projektgrenzen. Bei
`auto-ontology-mcp` reichen drei Sperrschichten nur für den Einzelplatz; wir bräuchten zusätzlich
eine Mandanten-Garantie in einem Cypher-Parser. Typisierte Tools geben diese Garantie ohne Parser.

**E4 — Authentifizierung v1 über die bestehenden `ta_`-API-Keys, nur mit Lese-Scopes.** Ein Key
für MCP darf nur Rechte aus einer Teilmenge von `READ_PERMISSIONS` tragen (`project:read`,
`element:read`, `connection:read`, `analytics:view`, `governance:view` — **ohne**
`admin:view_audit`, das zwar lesend, aber kein Architekturinhalt ist); ein Key mit Schreibrechten wird am
MCP-Endpunkt abgewiesen. **OAuth 2.1 nach MCP-Authorization-Spec ist Ausbaustufe 2** — Voraussetzung
für Clients, die nur OAuth-Connectoren kennen (siehe Offene Fragen).

**E5 — Opt-in je Projekt, Standard aus.** Ein Projekt ist erst über MCP erreichbar, wenn ein
Projekt-Owner es freischaltet. Begründung: Über MCP fließen Architekturdaten an den
LLM-Anbieter des **Kunden-Clients**, nicht an unseren. Das ist eine Datenabfluss-Entscheidung des
Kunden und muss bewusst getroffen und im Audit sichtbar sein.

**E6 — Antworten tragen ihre Belastbarkeit mit.** Jedes zurückgegebene Element enthält
`provenance`, Zertifizierungsstatus und ggf. `confidence`; jede Norm-Antwort die `ontologyVersion`.
Ein Tool `check_answerable` prüft vorab, ob Metamodell und Projektinhalt eine Frage überhaupt
abdecken, und sagt sonst ausdrücklich „nicht abgedeckt" (Muster aus `auto-ontology-mcp`).
Die Arbeitsregeln — erst `check_answerable`, Beziehungen mit `validate_relationship` prüfen,
Provenance nennen — sendet der Server beim Verbindungsaufbau als MCP-Instructions.

**E7 — Tool-Gruppen statt eines großen Katalogs.** Standard ist die Gruppe `answer`; weitere
Gruppen schaltet der Key frei. Begründung: Jede Tool-Beschreibung wird bei jeder Anfrage des
Clients mitgeschickt. `auto-ontology-mcp` berichtet für eine solche Aufteilung eine Reduktion von
rund 52.000 auf rund 12.000 Zeichen — **deren Messung, nicht unsere**.

| Gruppe | Tool | Kapselt (bestehend) |
|---|---|---|
| `answer` | `list_projects` | Projekt-Mitgliedschaften des Key-Inhabers |
| `answer` | `describe_metamodel` | ArchiMate-Typen, Spezialisierungen (ADR-0010), `getValidRelationships` |
| `answer` | `search_elements` (Name, Typ, Ebene) | Element-Suche je `projectId` |
| `answer` | `get_element` (inkl. Beziehungen, Provenance) | Element- und Connection-Lesepfad |
| `answer` | `get_neighbors` / `find_path` (Tiefe ≤ 3) | Graph-Abfragen in Neo4j |
| `answer` | `validate_relationship` | `isValidRelationship` |
| `answer` | `check_answerable` | neu, deterministisch gegen Metamodell + Projektinhalt |
| `compliance` | `get_applicable_regulations` | `regulationApplicability` / `legalApplicability` |
| `compliance` | `get_norm` (mit `ontologyVersion`) | `norm.service`, Governed Retrieval |
| `propose` *(nach v1)* | `propose_element`, `propose_connection` | Anlage als `mcp_discovered`, Entwurf |

Die Tabelle ist ein **Zuschnitt**, kein fertiger Vertrag; Namen und Parameter entstehen in der Umsetzung.

**E8 — Audit und Grenzen wie jede andere API.** Jeder Tool-Aufruf erzeugt einen Audit-Eintrag
(Tool, `projectId`, Key-Präfix, IP, User-Agent) über `createAuditEntry`; eigenes Rate-Limit je Key
über `rateLimit({ name: 'mcp' })`; Ergebnislisten haben eine feste Obergrenze, Graph-Traversierung
eine feste Maximaltiefe.

## Abnahme — Messung, keine Meinung

- **Mandanten-Trennung:** Eine Testsuite ruft jedes Tool mit einer fremden `projectId` auf.
  Erwartung: **0** Treffer aus fremden Projekten, ohne Ausnahme. Das ist ein Release-Gate.
- **Antwortqualität:** Golden-Set mit EA-Fragen aus einem Demo-Projekt (Umfang festzulegen),
  einmal mit und einmal ohne MCP-Server beantwortet; gemessen werden korrekte Antworten und korrekt
  verweigerte („nicht abgedeckt"). Bewertung nach dem Rubrik-Verfahren aus `server/src/evals/RUBRIC.md`.
- **Schreibsperre:** Ein Key mit Schreibrechten wird am MCP-Endpunkt abgewiesen (Test).

## Preis, offen benannt

- **Neue Angriffsfläche** nach außen: ein weiterer authentifizierter Endpunkt mit eigenem Rate-Limit,
  eigenem Audit und eigener Testsuite.
- **Prompt-Injection läuft in beide Richtungen:** Elementbeschreibungen, Importe und Normtexte
  sind für den fremden Client nicht vertrauenswürdige Daten. Wir können das nur kennzeichnen,
  nicht im fremden Client verhindern.
- **Datenabfluss an fremde LLM-Anbieter** — deshalb Opt-in je Projekt (E5). Für regulierte
  Kunden ist das trotzdem ein Gesprächspunkt im Vertrieb.
- **Spezifikations-Drift:** MCP entwickelt sich schnell (Transporte, Auth). Das SDK muss gepflegt werden.
- **Doppelte Oberfläche:** Jede neue Lese-Funktion stellt die Frage „auch als MCP-Tool?".

## Verworfene Alternativen

| Verworfen | Warum |
|---|---|
| **`auto-ontology-mcp` integrieren** | Python + SQLite, Einzelplatz, kein RBAC, Klartext-Passwörter, nur relationale Quellen; passt weder zum Stack noch zum Mehrmandanten-Betrieb |
| **Freies Cypher mit Validator** (`validate_cypher`) | Mandanten-Garantie hinge an einem Cypher-Parser; typisierte Tools geben sie ohne Parser (E3). *Revidiert die Empfehlung aus der Bewertung vom 2026-11-14.* |
| **Eigenes Paket / separater Prozess über REST** | Bessere Isolation, aber Auth, Audit und Rate-Limit doppelt oder über eine zweite Hop-Schicht; für v1 kein Gegenwert |
| **Schreibzugriff in v1** | Umgeht die Zertifizierung; ein fremdes Modell würde ungeprüft ins Repository schreiben |
| **Nur lokaler stdio-Server** | Passt zum Desktop-Einzelplatz, nicht zu einem SaaS mit zentralem Repository |

## Offene Fragen (vor Accepted zu klären)

1. **Client-Kompatibilität der Auth:** Welche Ziel-Clients akzeptieren einen statischen
   Bearer-Key, welche verlangen OAuth? Nicht verifiziert. Entscheidet, ob OAuth in v1 gehört.
2. **SDK-Stand:** Welche Version des TypeScript-SDK unterstützt Streamable HTTP mit Express stabil?
   Nicht geprüft.
3. **Plan-Zuordnung:** Ist MCP an einen Billing-Plan gebunden (heute rollenbasiert:
   `chief_architect` = enterprise)?
4. **Workspace-Ebene:** Reicht Opt-in je Projekt, oder braucht es zusätzlich einen
   Workspace-Schalter (`workspace.routes.ts`)?
5. **`check_answerable`:** Wie deterministisch ist eine Abdeckungsprüfung ohne Embedding-Suche
   machbar? `auto-ontology-mcp` arbeitet rein lexikalisch; ob das für EA-Fragen reicht, ist ungemessen.
