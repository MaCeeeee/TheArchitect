# Handoff: `the-architect-core` herauslösen

> Selbstständiges Briefing für einen **neuen Chat ohne Vorkontext**. Ziel: den
> geteilten technischen Kern aus dem ersten Skill (`togaf-vision-architect`) in
> einen eigenen, von Geschwister-Skills nutzbaren `the-architect-core` extrahieren.
> Repo-Root: `/Users/mac_macee/javis`. Antworten auf **Deutsch**, UI-Strings **Englisch**.

---

## 0. ZUERST: Pre-Flight (PFLICHT, diesmal VOR dem Bauen)

Der Nutzer hat einen **verbindlichen Pre-Flight-Prozess**, der beim ersten Skill
übersprungen wurde (und nachgeholt werden musste). Mach es diesmal richtig, bevor
du Dateien anfasst:

1. **Linear durchsuchen** (Team „TheArchitect", `de63435a-…`): gibt es schon ein
   Issue für „Skill-Core / shared references / Refactor"? Verwandt: **THE-339**
   (UC-MCP-001, Dach), **THE-340** (Vision-Skill, In Progress), **THE-369**
   (Layout-REQ, Done), **THE-370** (Bug, s. u.).
2. **Komplexität bewerten** (Ousterhout: 3 Symptome + 2 Ursachen) — ist ein reines
   Refactor (Dateien verschieben + Referenzen umbiegen), also vermutlich niedrig.
3. **UC/REQ anlegen** falls gerechtfertigt (Refactor unter THE-339), **8-Kriterien-
   Scoring** (7 numerisch: BizValue·BizRisk·ImplChall·Success·Compliance·Relations·
   Urgency, Summe/35×100; 8. = Status, nicht bepunktet).
4. **User-Bestätigung einholen**, *dann* bauen.

Memory-Referenzen: `feedback_preflight_check`, `feedback_preflight_before_plan`,
`feedback_requirement_scoring`, `feedback_complexity_assessment`.

---

## 1. Warum (die Skill-Familien-These)

The Architect kann viel mehr als „Elemente laden". Statt eines Mega-Skills (der
schlecht triggert und Kontext aufbläht) → eine **Skill-Familie**: je ein
fokussierter Skill pro Nutzer-Absicht, alle gestützt auf **einen gemeinsamen Kern**
(„wie rede ich mit The Architect": Auth, Endpoints, Enums, 3D-Layout, Verify).

```
Vision(✅) · Modeler(UC-1/2) · Analyst(UC-3/4/9) · Simulate(UC-5/6) · Compliance(UC-7/8)
                         └────────── the-architect-core ──────────┘
        heute: geteilte references/ + commit-model.mjs   ·   später: MCP-Server (THE-339)
```

Prinzip aus THE-340: **Methodik im Skill, Action im Kern/MCP.** Wenn der MCP-Server
(THE-339) später existiert, wandert der Kern-Inhalt in dessen Tool-Beschreibungen
und die Skills werden dünner. `the-architect-core` ist die Zwischenstufe, damit
Skill #2 (Analyst, UC-3) nicht alles dupliziert.

---

## 2. Was schon existiert (Ausgangslage)

**Erster Skill — `togaf-vision-architect`** (gebaut, aktiv, gemergt):
```
docs/skills/togaf-vision-architect/          ← versionierte Quelle (docs/ ist getrackt)
  SKILL.md                                    Methode + Frage-Flow + Strategic-Discovery
  references/the-architect-api.md             ← KERN-KANDIDAT (Auth, Endpoints, Enums, Gotchas)
  references/3d-layout.md                     ← KERN-KANDIDAT (Maßstab, Sub-Y, Value Stream View)
  scripts/commit-model.mjs                    ← KERN-KANDIDAT (lauffähig, Auto-Layout, Verify, Retry)
```
- **Aktivierung:** `.agents/` und `.claude/` sind **gitignored**, nur `docs/` ist
  getrackt. Aktiv geschaltet via **Symlink**: `.agents/skills/togaf-vision-architect
  → ../../docs/skills/togaf-vision-architect`. Gleiches Muster für den Core nutzen.
- **Gemergt:** PR #16 (Skill), PR #18 (Eval-Härtung), PR #12 (Value-Stream-View-Layout).
- **Eval bestanden:** 6 Läufe (3 mit/3 ohne Skill), alle committeten korrekt.

**Linear (Source of Truth für Status):**
| Issue | Inhalt | Status |
|---|---|---|
| THE-339 | UC-MCP-001 (MCP-Server, Dach) | Backlog (MCP nicht gebaut) |
| THE-340 | MCP-UC-0 Vision-Skill | In Progress · 80,0 |
| THE-369 | REQ-MCP-0.1 Value-Stream-View-Layout | Done · 65,7 |
| THE-370 | BUG Connection-Match ohne projectId-Scope | Backlog · High |
| THE-342/343/348/350… | weitere MCP-UCs (Modeler/Simulate/Audit/…) | Backlog |

---

## 3. Vorgeschlagene Core-Struktur

```
docs/skills/the-architect-core/
  SKILL.md            "Wie rede ich mit The Architect" — Referenz für alle architect-* Skills.
                      Description so fassen, dass sie als technische Referenz konsultiert wird,
                      nicht als user-getriggerter Workflow.
  references/
    the-architect-api.md     ← aus togaf-vision-architect VERSCHIEBEN
    3d-layout.md             ← aus togaf-vision-architect VERSCHIEBEN
  scripts/
    commit-model.mjs         ← aus togaf-vision-architect VERSCHIEBEN
```
Dann `togaf-vision-architect/SKILL.md` umbiegen: statt eigener References auf den
Core verweisen (per Pfad, z. B. „zum Committen siehe `the-architect-core`:
references/the-architect-api.md + 3d-layout.md + scripts/commit-model.mjs"). Skills
sind self-contained Verzeichnisse → Cross-Referenz geht **per Pfad** (Claude liest
jede Datei unter `docs/skills/…`). Symlink für den Core in `.agents/skills/` anlegen.

**Offene Entscheidung für den User:** Ist der Core ein eigener (niedrig-triggernder)
Skill, oder eine reine Referenz-Bibliothek, die andere Skills per Pfad lesen? Beides
geht; empfohlen: eigener Skill mit „technische Referenz"-Description.

---

## 4. Der technische Inhalt des Kerns (Kurzfassung — Details in den Dateien)

> Vollständig steht das bereits in `togaf-vision-architect/references/*` — hier die
> nicht-offensichtlichen Punkte, damit nichts verloren geht.

**Auth** — `X-API-Key: ta_…` (oder `Authorization: Bearer ta_…`), alternativ Login
`POST /api/auth/login {email,password}` → `accessToken`. Lokaler Dev-Server:
`http://localhost:4000/api` (Client auf `:3000`). **Fallen:** lokaler Server nutzt
eigene `localhost:27017`-Mongo (getrennt von Prod); `.env`-Keys (`THEARCHITECT_API_KEY*`)
sind ausgehende Prod-Keys → lokal 401; Keys rotieren. **Lokalen Key frisch erzeugen:**
App → Settings → API Keys → Generate New Token (Rohwert nur **einmal** sichtbar).
Niemals einen Key hart ins Repo schreiben.

**Endpoints** (alle unter `/api/projects`):
- `POST /api/projects` `{name,description,tags}` → Projekt mit `_id`
- `POST /api/projects/:id/elements` — Body: `{id?, type, name, description, layer,
  togafDomain, status, riskLevel, maturityLevel, position3D{x,y,z}, metadata}`
- `POST /api/projects/:id/connections` `{sourceId, targetId, type, label}` — **kein
  PUT**; Typ ändern = DELETE + neu. `DELETE …/connections/:connId`.
- `PUT /api/projects/:id` `{vision{scope,visionStatement,principles[],drivers[],goals[]},
  stakeholders[]}` ← **dual representation** (s. u.)
- `PUT …/elements/:id {position3D}`; `GET …/elements`, `…/connections` (Read-back)
- `DELETE /api/projects/:id`

**Enums** — layer: `motivation|strategy|business|information|application|technology|
physical|implementation_migration`. Motivation-Typen: stakeholder/driver/assessment/
goal/outcome/principle/requirement/constraint/am_value/meaning. Strategy:
business_capability/value_stream/resource/course_of_action. Relationen: influence,
realization, association, serving, flow, composition, aggregation, assignment, access,
triggering, specialization. status: current|target|transitional|retired.

**Annahme vs. validiert** — Provenance ist **serverseitig & nicht von außen setzbar**
(Anti-Spoofing). Kodierung: validiert = `status:current` + `metadata.assumption:false`;
Annahme = `status:target` + `metadata.assumption:true`.

**Dual representation (Stolperstein!)** — Graph-Elemente (Neo4j, via `…/elements`)
und Projekt-`vision`+`stakeholders` (Mongo, via `PUT /projects/:id`) sind **getrennte
Stores**. Das Phase-A-Panel liest die Vision; Elemente anlegen füllt es NICHT.
**Beides** schreiben.

**3D-Layout (sonst Sternenhimmel!)** — Y wird beim Laden vom Client per
`resolveElementY(layer,type)` überschrieben (Datei: `packages/shared/src/constants/
togaf.constants.ts`); du steuerst nur **X/Z**, in **kleinen Einheiten** (~3/Zelle,
ca. −12…+12; NICHT Hunderte). Y-Bänder: Motivation stapelt (stakeholder 31 … requirement
16), Strategy stapelt (value_stream 14.5, business_capability 13) = **Value Stream View**,
`capability —serving→ value_stream` zeigt nach oben. Recipe: Motivation als vertikale
Wand (z=0), Strategy als Boden darunter. `commit-model.mjs` hat das Auto-Layout schon.

**Verify** — nach jedem Commit `GET` Elemente+Connections, nach Typ zählen,
Annahme-Split prüfen. Nichts ungeprüft „fertig" melden.

**Bekannter Bug THE-370 (im Kern dokumentieren):** `POST …/connections` matcht
Elemente per `id` **ohne** projectId-Scope → generische IDs kollidieren
projektübergreifend (500/ambiguous/constraint). **Workaround (schon in
commit-model.mjs):** IDs per Projekt namespacen (`NS()`, prefix aus projectId) +
Retry auf 500/401/429. Server-Fix ist THE-370 (separat).

---

## 5. Umgebungs-Fakten

- Repo: `/Users/mac_macee/javis` (TS-Monorepo: packages/shared, server, client).
- Dev-Server: API `:4000`, Client `:3000` (mit `npm run dev`). Node v22+.
- `docs/` getrackt; `.agents/`, `.claude/` gitignored (Skills dort nur via Symlink aktiv).
- Git-Hygiene: nicht direkt auf `master` committen — eigener Branch + PR (User mergt selbst).
- Prod existiert (thearchitect.site / VPS), aber für Skill-Arbeit **lokal** bleiben.

---

## 6. Konkrete Schritte (Vorschlag, nach Pre-Flight-OK)

1. `docs/skills/the-architect-core/` anlegen; `references/the-architect-api.md`,
   `references/3d-layout.md`, `scripts/commit-model.mjs` aus `togaf-vision-architect`
   **dorthin verschieben** (`git mv`).
2. `the-architect-core/SKILL.md` schreiben (Description = „technische Referenz für alle
   architect-* Skills", Body = Kurzindex auf die References + das commit/verify-Vorgehen).
3. `togaf-vision-architect/SKILL.md` umbiegen: References-Verweise → auf den Core zeigen.
4. THE-370-Workaround + dual-representation + Layout-Recipe im Core klar dokumentieren.
5. Symlink `.agents/skills/the-architect-core → ../../docs/skills/the-architect-core`.
6. **Verifizieren:** `commit-model.mjs --demo` gegen lokale API laufen lassen
   (frischer lokaler API-Key!), Read-back grün, danach Demo-Projekt wieder löschen.
7. Branch + PR; Linear-Issue auf Done/Verlinkung.

---

## 7. Danach (nicht jetzt)

Nächster Capability-Skill = nächsthöchster UC mit eigenem Trigger. Empfehlung:
**Analyst (UC-3 NL-Query, THE-342? Score 77,1, read = risikoarm)** als Skill #2 —
er konsumiert dann `the-architect-core` und beweist, dass die Wiederverwendung trägt.
Auch hier: **Pre-Flight zuerst.**
