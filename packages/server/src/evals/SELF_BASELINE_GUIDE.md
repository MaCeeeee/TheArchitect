# Self-Baseline-Leitfaden — Golden-Set aus TheArchitects eigenem Modell

> Linear: THE-379/THE-381 · Epic THE-378 (UC-EVAL-001) · Rubrik: RUBRIC.md v2 §6
>
> **Ziel:** Ein Golden-Set aus Gesetzen, die auf TheArchitect selbst zutreffen,
> gemappt auf das eigene Architektur-Modell (Projekt `6a3ff887e50cc39a4193802f`).
> Warum: Ground Truth braucht einen Annotator, der Architektur UND Recht sicher
> beurteilen kann — bei der eigenen Plattform ist das gegeben. Das BSH-Set
> (`mapping.v2.json`) bleibt als Transfer-Slice erhalten, entscheidet aber
> nicht mehr über den Freeze.

**Alle Schritte laufen auf DEINER Instanz** (lokal `~/thearchitect-eval` bzw.
gegen deine laufende App auf `localhost:3000` / API `localhost:5000`), nicht in
der Cloud-Session — die Datenbanken und der Crawler (Server B via Tailscale)
sind nur von dort erreichbar.

Konvention unten: `PROJECT=6a3ff887e50cc39a4193802f`, API-Basis `http://localhost:5000/api`.
Auth: Der API-Key (`ta_…`) geht als Header `X-API-Key`; die Middleware akzeptiert
ihn auf allen Projekt-Routen (der Key-Nutzer braucht ≥ viewer-Zugriff aufs Projekt).
Einmal setzen:

```bash
export PROJECT=6a3ff887e50cc39a4193802f
export KEY=ta_xxxxx   # dein API-Key; nach der Baseline rotieren (Settings → API Keys)
export API=http://localhost:5000/api
```

---

## Schritt 1 — Kandidatenpool prüfen (5 min, read-only)

Das Modell wurde aus GitHub/Obsidian/Linear gespeist — prüfe, ob es fürs
Labeling taugt, BEVOR du Zeit investierst. **Weg B (empfohlen, nur API-Key)** —
Elemente per API ziehen, lokal auswerten (kein Neo4j-Zugang nötig):

```bash
cd packages/server
curl -s "$API/projects/$PROJECT/elements" -H "X-API-Key: $KEY" > /tmp/elements.json
npm run golden:candidates -- --from-json /tmp/elements.json
```

Weg A (direkt aus Neo4j, braucht `NEO4J_*` in der `.env`):

```bash
npm run golden:candidates -- 6a3ff887e50cc39a4193802f
```

Das Skript prüft drei Dinge:

1. **Vollständigkeit:** Stehen die tragenden Elemente drin? Mindest-Checkliste
   für TheArchitect: MongoDB (Nutzerdaten!), Redis (Sessions!), Neo4j, MinIO,
   Express-API, React-Client, Socket.IO, Auth/MFA/OAuth, Audit-Logging,
   API-Key-Verwaltung, Billing, AI-Copilot, Docker/VPS-Deployment.
   Fehlt eines → im Produkt nachpflegen. **Ein fehlendes Element ist ein
   unsichtbares False Negative** — das Modell kann es nie vorschlagen, und
   die Eval kann den Fehler nie sehen.
2. **Compliance-Facts-Profile:** Rubrik v2.2 §2.3 (Zwei-Stufen-Test) macht
   Stufe-1-Labels vom **Facts-Profil** abhängig (`metadata.compliance` — NICHT
   mehr von der Freitext-Beschreibung; Taxonomie:
   `../compliance/COMPLIANCE_FACTS.md`). Die Profile für die operativen
   Self-Model-Elemente liegen als Entwurf im Katalog und werden so eingespielt:

   ```bash
   export TA_API=http://localhost:3000/api TA_KEY=$KEY TA_PROJECT=$PROJECT
   npm run facts:apply              # Dry-Run: zeigt je Element den Plan
   # Katalog reviewen (src/compliance/facts-catalog.self.v1.json) — jedes
   # Profil ist DEINE Betreiber-Behauptung! — dann:
   npm run facts:apply -- --apply
   ```

   Das Skript macht GET→merge→PUT und lässt fremde metadata-Keys unangetastet.
   Danach `golden:candidates` erneut — der Report zeigt die Profil-Abdeckung
   und die doc-Halter (= deine Stufe-1-Kandidaten).
3. **Typen-Vielfalt:** ≥ 4 Element-Typen (Rubrik §6).

Erst wenn das Skript ✅ zeigt, weiter zu Schritt 2.

## Schritt 2 — Gesetze crawlen (echte Texte statt Modellwissen)

```bash
# Crawler erreichbar?
curl -s http://localhost:5000/api/regulations/crawler/health

# DSGVO (Kern) + NIS2 (Grenzfall-Slice) crawlen:
curl -s -X POST http://localhost:5000/api/projects/$PROJECT/regulations/crawl \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"sources": ["dsgvo", "nis2"]}'
```

Danach verifizieren, dass das Projekt die Paragraphen sieht:

```bash
curl -s "http://localhost:5000/api/projects/$PROJECT/regulations?source=dsgvo&limit=5" \
  -H "X-API-Key: $KEY"
```

**Falls die Liste leer ist (`total: 0`):** Der Crawler schreibt in den
kanonischen Korpus (Server B, ADR-0001), nicht in den Projekt-Bestand — das
Auto-Mapping liest aber `Regulation.find({projectId})`. Importiere die
Paragraphen einmalig ins Projekt:

```bash
# CORPUS_MONGODB_URI muss in packages/server/.env stehen (siehe .env.example)
npm run regs:import -- --project $PROJECT --sources dsgvo,nis2            # Dry-Run: zeigt Plan
npm run regs:import -- --project $PROJECT --sources dsgvo,nis2 --apply    # schreibt
```

Idempotent (dedupe über source+paragraphNumber), read-only auf dem Korpus.
Danach `GET /regulations` erneut — jetzt sollte `total` > 0 sein. Falls
`CORPUS_MONGODB_URI` fehlt/nicht erreichbar ist, meldet das Skript das klar —
dann klären wir den Zugang (der Korpus-Mongo läuft auf Server B via Tailnet).

**Fallauswahl (15–25 Fälle, Rubrik §6):** DSGVO Art. 5, 6, 15, 17, 20, 25,
28, 30, 32, 33, 34 · als Hard Negatives Art. 51, 57, 68, 83 (Behörden-Adressat,
§3 Adressaten-Test) · NIS2 Art. 21 (Zulieferer-Grenzfall) + Art. 22 (Hard
Negative). Nicht jeden Artikel, den der Crawler liefert — bewusst stratifizieren.

## Schritt 3 — Auto-Mapping laufen lassen

```bash
curl -s -X POST http://localhost:5000/api/projects/$PROJECT/compliance/mappings/auto \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" -d '{}'
```

(Optional `{"regulationIds": [...]}`, um nur die ausgewählten Fälle zu mappen.)
Kostenrahmen: ~20 Paragraphen × Haiku ≈ wenige Cent. Jeder Call erzeugt
zusätzlich einen AiTrace (Observability, THE-384).

## Schritt 4 — Confirm/Reject im Produkt = dein Labeling

Im Produkt (Projekt öffnen → Compliance-Ansicht) jeden Mapping-Vorschlag
**bestätigen oder ablehnen** — nach RUBRIC.md v2, mit dem Zwei-Stufen-Test im
Kopf. Das ist derselbe Labeling-Akt wie im HTML-Worksheet, nur im echten
Produktpfad (und: `confirm` setzt `createdBy: human` + Audit-Eintrag — genau
das, was `seed-golden-from-db` als Gold einsammelt).

**Wichtig für die Qualität:**
- Auch die Ablehnungen sind wertvoll (sie werden als `rejected` gespeichert).
- Elemente, die das Modell NICHT vorgeschlagen hat, aber betroffen sind
  (False Negatives!), im Produkt als manuelles Mapping anlegen — sonst fehlt
  das Gold. Gerade dafür kennst du deine Architektur gut genug.
- Hard-Negative-Paragraphen: alle Vorschläge ablehnen, nichts bestätigen.

## Schritt 5 — Golden-Set aus der DB ziehen

```bash
npm run seed:golden-from-db -- --project 6a3ff887e50cc39a4193802f \
  --out src/evals/golden/mapping.self.v1.json
```

Ergebnis: Entwurfs-Golden-Set mit deinen Confirm/Reject-Entscheidungen als
Gold und dem **vollen** Neo4j-Kandidatenset pro Fall. Datei committen
(Branch `claude/architect-llm-judge-prep-wjhbq5`) oder mir hochladen.

## Schritt 6 — Zweit-Labeling + Kappa (macht Claude)

Ich labele dieselben Fälle unabhängig blind nach Rubrik v2 (Worksheet-Daten
ohne deine Gold-Labels), dann:

```bash
npm run golden:kappa -- src/evals/golden/mapping.self.v1.json <claude-labels>.json
```

Kappa ≥ 0,6 → Adjudikation der Restdifferenzen → `frozen: true` →
`npm run eval:mapping -- --models haiku,sonnet,opus` = **E1-Baseline fürs
Meetup (31.07.)**, mit Correctness × Conciseness pro Modell (S1-Runner).

---

## Rollen der Sets ab jetzt (RUBRIC.md §6)

| Datei | Rolle |
|---|---|
| `golden/mapping.self.v1.json` | **Baseline-Set** (Kappa-Gate, Freeze, THE-381) |
| `golden/mapping.v2.json` | Transfer-Slice (BSH/LkSG) — mitmessen via `--golden`, kein Gate |
| `golden/consistency-pairs.v1.json` | Label-freie DE/EN- + Shuffle-Konsistenz (unverändert) |

## Stolpersteine

- **Leerer Kandidatenpool in Schritt 5** → Projekt-ID prüfen (Mongo-ObjectId,
  24 Hex-Zeichen) und ob die Elemente in Neo4j `projectId` gesetzt haben.
- **`--offline`-Eval schlägt fehl** → erwartungsgemäß: neues Set = leerer
  Prediction-Cache. Einmal live laufen lassen (braucht `ANTHROPIC_API_KEY`).
  Zusätzlich sind ALLE Cache-Einträge von vor dem 2026-07-04 stale: Der
  Cache-Key enthält jetzt auch die Kandidaten-INHALTE (Dealbreaker-Fix aus dem
  Facts-Design — sonst hätte eine Profil-Änderung still alte Predictions
  geliefert). Einmalige Live-Neubefüllung, Kosten im Cent-Bereich.
- **Crawler unreachable (502)** → Tailscale/Server B prüfen
  (`COMPLIANCE_CRAWLER_URL`, Default `http://100.106.223.83:3100`).
- **Element nachgepflegt, nachdem schon gemappt wurde** → Auto-Mapping für die
  betroffenen Paragraphen erneut laufen lassen, sonst fehlt das Element in den
  Vorschlägen (und damit im Kandidaten-Snapshot des Falls).
