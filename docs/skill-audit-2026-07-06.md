# Skill-Audit 2026-07-06 — Kontextfenster verkleinern

**Ziel:** Die 213 in `.claude/skills/` geladenen Skills gegen die tatsächliche Arbeit prüfen (Linear-REQs, Codebase, Obsidian Vault) und den System-Prompt-Overhead reduzieren.

**Ergebnis:** 74 behalten · 2 aktivieren · 139 deaktivieren → **~9.100 von ~14.000 Tokens gespart (64 %) — bei jeder Session.**

---

## 1. Evidenzbasis

| Quelle | Befund |
|---|---|
| **Codebase** (Monorepo javis) | React 18 / TS 5.7 / Three.js / Zustand / Tailwind 4 / Vite · Express + Socket.IO + BullMQ / Fastify (Crawler) · MongoDB / Neo4j / Redis / Qdrant / MinIO · Python-Embedding-Sidecar (FastAPI, sentence-transformers) · Anthropic + OpenAI SDK · Jest / Vitest (111 Testdateien) · Turbo · GitHub Actions → Hostinger VPS. **Nicht vorhanden:** K8s/Helm, Terraform, Istio/Linkerd, Prometheus/Grafana/Jaeger, Kafka, Spark/Airflow/dbt, PostgreSQL, LangChain, Temporal, Bazel/Nx, GitLab CI, Angular/Next.js/React Native/Flutter, .NET/Go/Rust, Unity/Godot, Web3, Stripe/PayPal (noch), Vercel, Storybook |
| **Linear** (148 offene Issues) | Cluster: AI/LLM-Eval (~49), React-UI/UX (~42), Compliance/EU-Regulatorik (~41), ArchiMate/TOGAF (~33), Crawler/Korpus (~31), MongoDB-Schema/bitemporal (~26), Embeddings/RAG/Qdrant (~20), Provenance/Trust (~19), MCP/Skills (~15), Testing (~12), Deployment (~10), Neo4j (~9), Auth (~8), n8n (~5). **Null Issues** zu K8s, Terraform, Mobile, Web3, Spark/Airflow/dbt, Payment-Providern (außer Stripe-Roadmap im Vault), .NET/Go/Rust |
| **Obsidian Vault** | Compliance dominiert (DSGVO, NIS2, DORA, AI Act, CSRD, LkSG); Geschäftsaufbau aktiv: Businessplan-XLSX, Pricing/Freemium, **Stripe-Monetarisierung auf Roadmap**, Wettbewerb (LeanIX/Ardoq/Bizzdesign), LinkedIn-Outreach, **Report-Generation (PDF/PPTX) auf Roadmap**, NemoClaw (MCP). Keine Videoproduktion, Games, Web3, Mobile |
| **Nutzung** (35 Sessions, 20.06.–06.07.) | Nur 8 Skills je aufgerufen: `writing-plans` (3×), `subagent-driven-development`, `skill-creator`, `schedule`, `rvtm-traceability` (je 2×), `webapp-testing`, `using-superpowers`, `brainstorming` (je 1×) |

## 2. Struktur-Befunde (unabhängig vom Löschen)

1. **Architektur:** `.claude/skills/` = 208 Symlinks auf `.agents/skills/` + 5 echte Verzeichnisse. Nur `.claude/skills/` wird in den Kontext geladen. **Deaktivieren = Symlink entfernen; `.agents/skills/` bleibt als Kalt-Archiv (0 Token). Reaktivieren = ein `ln -s`. Nichts geht verloren.**
2. **`the-architect-core` ist nicht verlinkt** — liegt nur in `.agents/skills/` (+ `docs/skills/`), obwohl `the-architect-modeler` und `togaf-vision-architect` ihn als Shared Core referenzieren und THE-339/341 (MCP-Server) darauf aufbauen. → **Aktivieren.**
3. **`deploy-to-hostinger` ist nicht verlinkt, aber `deploy-to-vercel` schon** — genau falsch herum (Deployment läuft auf Hostinger VPS). → **Tauschen.** Beim Überarbeiten die 4 Deploy-Fallstricke aus `deployment_pitfalls_2026_05_17` einarbeiten (zwei compose-Files, .env-Overwrite, restart liest .env nicht neu, Neo4j-Boot-Race).
4. **`thearchitect-csv-import-workspace` hat keine `description`** im Frontmatter → kann nie automatisch triggern, toter Eintrag. Inhalt mit `thearchitect-csv-import` abgleichen, ggf. mergen, dann archivieren.
5. **7 lokale Skills sind exakte Duplikate installierter Plugins** (`anthropic-skills:*`): `docx`, `pdf`, `pptx`, `xlsx`, `mcp-builder`, `skill-creator`, `web-artifacts-builder` — sie stehen doppelt in der Skill-Liste und kosten doppelt Kontext. Lokale Symlinks löschen, Plugin-Versionen nutzen. (PDF/PPTX-Fähigkeit bleibt also voll erhalten — wichtig für Board-Reports und Gesetzes-PDFs.)
6. `steve-jobs` und `arxiv-radar` liegen nur in `.agents/skills/` (inaktiv, 0 Token). `arxiv-radar` existiert zudem als Plugin — die lokale Kopie ist redundant. Kein Handlungsbedarf, nur Aufräum-Option.
7. `rvtm-traceability` und `togaf-vision-architect` existieren doppelt (echtes Verzeichnis in `.claude/skills/` **und** Kopie in `.agents/skills/`) — aktuell identisch, aber Drift-Gefahr bei Edits. Eine Quelle festlegen.
8. Nach der Bereinigung: CLAUDE.md-Abschnitt „Installed Skills (200+)" aktualisieren.

## 3. BEHALTEN (74)

**Workflow-Rückgrat (superpowers, nachweislich genutzt):**
`using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `rvtm-traceability` (Pflicht laut Arbeitsweise), `verification-before-completion`, `systematic-debugging`, `test-driven-development`, `requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`, `using-git-worktrees`, `writing-skills`, `webapp-testing`

**Projekteigene:**
`the-architect-modeler`, `togaf-vision-architect`, `thearchitect-csv-import`

**Frontend/UX (2.-größter Linear-Cluster, UX-Strategie aktiv):**
`react-state-management`, `vercel-react-best-practices`, `vercel-composition-patterns` (React-Komposition, trotz Namens kein Vercel-Deploy), `frontend-design`, `web-design-guidelines`, `interaction-design`, `tailwind-design-system`, `typescript-advanced-types`, `javascript-testing-patterns`, `e2e-testing-patterns`, `accessibility-compliance`, `ui-ux-pro-max`
Impeccable-Familie (UI-Polish, passt exakt zum „App zu komplex"-Feedback): `audit`, `critique`, `polish`, `animate`, `optimize`, `harden`, `adapt`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `extract`, `normalize`, `quieter`, `onboard` (Guided Onboarding = Roadmap-Punkt)

**Backend/Daten:**
`nodejs-backend-patterns`, `api-design-principles`, `auth-implementation-patterns`, `architecture-patterns`, `architecture-decision-records` (docs/adr/ existiert), `database-migration` (bitemporale Mongo-Migrationen THE-413ff), `secrets-management`, `turborepo-caching`

**AI/RAG/MCP (größter Linear-Cluster):**
`rag-implementation`, `embedding-strategies`, `hybrid-search-implementation`, `similarity-search-patterns`, `vector-index-tuning` (Qdrant), `llm-evaluation` (THE-401 Modell-Kaskade), `prompt-engineering-patterns`, `claude-api`, `fable5-prompting`

**Compliance/Security (Produktkern):**
`gdpr-data-handling`, `security-requirement-extraction`

**Business/Geschäftsaufbau (Obsidian-Evidenz):**
`competitive-landscape`, `market-sizing-analysis`, `startup-financial-modeling` (BP_Javis.xlsx, Pricing), `startup-metrics-framework` (Waitlist/Conversion), `stripe-integration` (Roadmap: Monetarisierung), `data-storytelling` (Pitch/Board-Reports), `doc-coauthoring`, `ckm-design` (deckt laut eigener Beschreibung Logo/Banner/Slides/Social ab → ersetzt die 5 anderen ckm-Skills)

Dazu bleiben unangetastet: die 7 n8n-Skills auf User-Ebene (`~/.claude/skills/`, WFCOMP-Pilot braucht sie) und alle Plugin-Skills.

## 4. AKTIVIEREN / ÜBERARBEITEN (2 + 3)

| Skill | Aktion |
|---|---|
| `the-architect-core` | Symlink anlegen (Referenz-Doku für modeler/togaf-vision, Basis für THE-339/341); offenen Punkt Element-CREATE-Uniqueness dort nachziehen |
| `deploy-to-hostinger` | Symlink anlegen, mit Deploy-Pitfalls-Memory abgleichen/erweitern |
| `deploy-to-vercel` | entfernen (falscher Provider) |
| `thearchitect-csv-import-workspace` | description fehlt → mit `thearchitect-csv-import` mergen, dann archivieren |
| `rvtm-traceability` / `togaf-vision-architect` | Doppelablage konsolidieren (eine Quelle, Rest Symlink) |

## 5. DEAKTIVIEREN (139) — nach Grund gruppiert

- **Plugin-Duplikate (7):** docx, pdf, pptx, xlsx, mcp-builder, skill-creator, web-artifacts-builder
- **Fremder Tech-Stack — Infra (18):** airflow-dag-patterns, bazel-build-optimization, dbt-transformation-patterns, gitlab-ci-patterns, gitops-workflow, grafana-dashboards, helm-chart-scaffolding, hybrid-cloud-networking, istio-traffic-management, k8s-manifest-generator, k8s-security-policies, linkerd-patterns, ml-pipeline-workflow, mtls-configuration, multi-cloud-architecture, nx-workspace-patterns, prometheus-configuration, service-mesh-observability, spark-optimization, terraform-module-library *(20 — inkl. distributed-tracing, slo-implementation)*
- **Fremde Sprachen/Runtimes (22):** alle 14 python-\* (Sidecar ist fertig & winzig), async-python-patterns, uv-package-manager, fastapi-templates, temporal-python-testing, dotnet-backend-patterns, go-concurrency-patterns, rust-async-patterns, memory-safety-patterns
- **Fremde Frameworks/DBs (6):** angular-migration, nextjs-app-router-patterns, react-modernization, langchain-architecture, postgresql-table-design, sql-optimization-patterns
- **Mobile (5):** mobile-android-design, mobile-ios-design, react-native-architecture, react-native-design, vercel-react-native-skills
- **Web3/Games/Trading (8):** defi-protocol-templates, nft-standards, solidity-security, web3-testing, unity-ecs-patterns, godot-gdscript-patterns, backtesting-frameworks, risk-metrics-calculation
- **Architektur-Patterns ohne Match (7):** cqrs-implementation, event-store-design, projection-patterns, saga-orchestration, microservices-patterns, workflow-orchestration-patterns, workflow-patterns
- **Security-Forensik/AppSec-Spezialthemen (8):** anti-reversing-techniques, attack-tree-construction, binary-analysis-patterns, memory-forensics, protocol-reverse-engineering, sast-configuration, stride-analysis-patterns, threat-mitigation-mapping *(security-reviewer-Agent + /security-review bleiben verfügbar)*
- **Payment außer Stripe (3):** paypal-integration, pci-compliance, billing-automation
- **Team-Prozesse (Solo-Betrieb) (12):** code-review-excellence, incident-runbook-templates, multi-reviewer-patterns, on-call-handoff-patterns, parallel-debugging, parallel-feature-development, postmortem-writing, task-coordination-strategies, team-communication-protocols, team-composition-analysis, team-composition-patterns, track-management
- **Redundant zu Behaltenem (16):** debugging-strategies (→ systematic-debugging), monorepo-management (→ turborepo-caching), design-system-patterns (→ tailwind-design-system), responsive-design (→ adapt), visual-design-foundations + web-component-design (→ frontend-design/web-design-guidelines), modern-javascript-patterns (→ typescript-advanced-types), wcag-audit-patterns + screen-reader-testing (→ accessibility-compliance), canvas-design + ckm-banner-design + ckm-brand + ckm-design-system + ckm-slides + ckm-ui-styling (→ ckm-design), git-advanced-workflows (→ using-git-worktrees)
- **Shell-Spezialskills (3):** bash-defensive-patterns, bats-testing-patterns, shellcheck-configuration
- **Sonstiges ohne Bezug (12):** algorithmic-art, brand-guidelines (Anthropic-CI), changelog-automation, context-driven-development, cost-optimization, dependency-upgrade, deploy-to-vercel, deployment-pipeline-design, github-actions-templates (Pipeline existiert bereits), employment-contract-templates, error-handling-patterns, internal-comms, kpi-dashboard-design, openapi-spec-generation, slack-gif-creator, teach-impeccable, template-skill, theme-factory, thearchitect-csv-import-workspace (nach Merge)

## 6. Umsetzung (reversibel, nicht ausgeführt — Entscheidung liegt bei dir)

```bash
cd /Users/mac_macee/javis

# 1) 139 Skills deaktivieren (Symlinks weg, echte Verzeichnisse ins Archiv)
while read -r s; do
  [ -z "$s" ] && continue
  p=".claude/skills/$s"
  if [ -L "$p" ]; then rm "$p"
  elif [ -d "$p" ]; then mv "$p" ".agents/skills/${s}-archived"
  fi
done < docs/skill-audit-2026-07-06-delete-list.txt

# 2) Zwei Skills aktivieren
ln -s ../../.agents/skills/the-architect-core  .claude/skills/the-architect-core
ln -s ../../.agents/skills/deploy-to-hostinger .claude/skills/deploy-to-hostinger

# 3) Kontrolle
ls .claude/skills | wc -l   # erwartet: 76
```

### Anhang A — Delete-Liste (139, maschinenlesbar)

Siehe `docs/skill-audit-2026-07-06-delete-list.txt` (eine Zeile pro Skill, direkt vom Skript oben konsumierbar).

---

## 7. Kontext-Rechnung

| | Skills | Zeichen (Name+Description) | ≈ Tokens |
|---|---|---|---|
| Heute geladen | 213 | 55.879 | ~14.000 |
| Nach Bereinigung | 76 | ~19.800 | ~4.950 |
| **Ersparnis pro Session** | **−137** | **−36.000** | **~−9.050 (64 %)** |

Nebenbefund außerhalb des Auftrags: Die MCP-Server (n8n, Firecrawl, PDF-Tools, PowerPoint, Kalender, Gmail, **Flugsuche**, Google Drive …) stellen >200 weitere Tools. Sie sind „deferred" (nur Namen im Kontext, Schemas laden on-demand), kosten also deutlich weniger als früher — aber die Namensliste wächst mit jedem Server. Der Flugsuche-Connector z. B. hat keinerlei Bezug zur Projektarbeit; Server-Hygiene in den claude.ai-Connector-Einstellungen wäre der nächste Hebel.
