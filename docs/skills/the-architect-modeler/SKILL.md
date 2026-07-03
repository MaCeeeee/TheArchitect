---
name: the-architect-modeler
description: >-
  Turns pasted prose that DESCRIBES existing (or planned) systems — a concept
  paper, an e-mail, meeting notes, an As-Is/To-Be write-up — into a multi-layer
  ArchiMate 3.2 model in The Architect. Reach for it whenever the user hands over
  a chunk of text and wants it structured: "turn this document into elements",
  "model this system description", "import this concept paper as architecture",
  "paste & see". It extracts business, application, technology and data elements
  plus their relationships, previews them (with duplicate detection against the
  target project), and only writes after an explicit yes. Use THIS skill when the
  user gives you existing prose about systems that already exist or are being
  described; when the user instead describes intent/vision for something NEW
  ("we want to…", "kick off an initiative", drivers/goals/stakeholders), use
  `togaf-vision-architect`. Do NOT use this for structured inputs — CSV, BPMN,
  n8n workflows, or ArchiMate XML each have their own dedicated importer; this
  skill is for unstructured natural-language text only.
compatibility: >-
  Requires a target projectId and a valid API key (ta_ prefix). Executes through
  the `the-architect-core` skill's `scripts/commit-model.mjs` (REST action layer).
  A future MCP tool `architect.commit_elements` will wrap the same operation; the
  methodology in this skill is unchanged when that lands.
---

# The Architect Modeler ("Paste & See")

This skill turns unstructured prose — "our Web Shop calls a Catalog API, the ERP
owns Order data and runs on a Kubernetes cluster backed by PostgreSQL" — into a
clean, multi-layer **ArchiMate 3.2** model committed into The Architect and
rendered in its 3D view.

The user pastes; the skill reads the text, identifies elements across every
layer, wires the relationships, checks the target project for duplicates,
previews the result, and — only after an explicit yes — commits it. The user
should never have to think in the metamodel; the skill does that.

## Core principle: methodology lives here, action lives in the core / MCP

Keep a hard separation, exactly as the sibling `togaf-vision-architect` skill does:

- **This skill owns the method.** Reading prose, deciding what is an element vs.
  noise, assigning layer and type from the canonical vocabulary, choosing
  relationships, and detecting duplicates all happen here, in the conversation.
- **The action layer owns the write.** It is thin: it receives a finished,
  validated model payload and persists it. Today that layer is
  `the-architect-core/scripts/commit-model.mjs`; tomorrow it is the MCP tool
  `architect.commit_elements`. Either way: **never push half-formed data**, and
  never expect the platform to "figure out" structure the skill should have set.

## Before you start

1. **Confirm a target `projectId`.** If none is given, ask which project to
   populate. Elements are committed *into* a project; there is no write without one.
2. **Mirror the user's language** for every `name` and `description` value. If the
   pasted text is German, the element names go in German; if English, English.
   (Your own preview commentary can be in the user's chat language.)
3. **Never write before a confirmed preview.** Every commit is confirmation-gated
   (see "Confirmation discipline"). A paste is an input, not an instruction to write.

## Extraction method — reading prose into a multi-layer model

Read the whole text once, then pass over it identifying candidate elements per
layer. Cover **all** layers the text actually touches:

- **Business** — actors and roles ("the fulfilment team", "a customer"),
  processes and functions ("Fulfil Order", "invoicing"), business services
  ("Order Management"), business objects ("an invoice" as a business concept).
- **Application** — application components (named systems / apps: "ERP",
  "Web Shop"), application services (an API or capability a component exposes:
  "Catalog API"), application interfaces (the endpoint/channel through which it
  is offered).
- **Technology** — nodes (compute: "Kubernetes cluster", "VM"), devices,
  system software ("PostgreSQL", "nginx"), artifacts (a deployable/file).
- **Information / data** — data objects the systems own or exchange ("Order",
  "Customer record").
- **Motivation / strategy** — only when the text *clearly* implies intent
  (a driver, a goal, a stakeholder concern). If the paste is mostly intent
  ("we want to modernise because…"), stop and **defer to `togaf-vision-architect`** —
  that is its job, not this skill's.

Rules while extracting:

- **Every element gets an explicit `layer`.** Do not rely on inference — set it.
  The executor honours an explicit `layer` per element.
- **Assign `type` from the canonical vocabulary** (next section). One clear type
  per element.
- **Prefer fewer, well-named elements over exhaustive noise.** Merge synonyms,
  drop passing mentions that aren't real architecture elements. A good model of a
  paragraph is a handful of elements, not thirty.
- **Keep `name` short** — the 3D view truncates long labels. Put the nuance in
  `description`, which carries the detail and any caveats.

## Layer / type vocabulary (the common types)

Assign each element a `type` from this canonical set. This is the *common* subset;
the full enum lives in `the-architect-core/references/the-architect-api.md` and,
authoritatively, in `packages/shared/src/constants/togaf.constants.ts`.

| Layer (`layer`) | Common `type` values |
|---|---|
| `business` | `business_actor`, `business_role`, `process`, `business_function`, `business_service`, `business_object`, `product`, `contract` |
| `application` | `application_component`, `application_service`, `application_interface`, `application_function` |
| `technology` | `node`, `device`, `system_software`, `artifact` |
| `information` | `data_object` (data domain) |
| `motivation` | `stakeholder`, `driver`, `goal`, `outcome`, `principle`, `requirement`, `constraint` — but prefer `togaf-vision-architect` for intent-heavy text |
| `strategy` | `business_capability`, `value_stream`, `resource`, `course_of_action` |

**Hard rule — no invented types.** A `type` that is not in the canonical
vocabulary must **NOT** be committed. If the prose suggests something outside it,
surface that element in the preview as **`unsupported — dropped`** with the
**nearest valid type** suggested, and let the user decide. Never silently coerce
or push a non-canonical type at the platform.

## Relationship rules (ArchiMate 3.2)

The relationship enum (`type` on a connection) is: `composition`, `aggregation`,
`assignment`, `realization`, `serving`, `access`, `influence`, `triggering`,
`flow`, `specialization`, `association`. The authoritative list is in api.md.

Common prose → relationship patterns:

| Prose says… | Relationship (`s` → `t`) |
|---|---|
| "X runs on / is hosted on / is deployed to Y" (Y = infra) | `serving` from the infrastructure element up to X |
| "X reads / writes / stores / uses Y-data" | `access` from X to the data object |
| "process delivers / provides service S" | `realization` from the process to the service |
| "X consists of / is composed of Y" | `composition` from X to Y |
| "X groups / includes Y (shared parts)" | `aggregation` from X to Y |
| "X calls / uses / depends on service S" | `serving` from S to X (S serves X) |
| "X triggers / then Y" (control flow) | `triggering` from X to Y |
| "X sends data to Y" (data flow) | `flow` from X to Y |
| "role R performs process P" | `assignment` from R to P |

Direction matters: `serving` points **from the provider to the consumer**
(the infrastructure serves the app; the API serves the shop). If the platform's
metamodel validation rejects a relationship, read the error, correct the type or
direction, and re-preview — do not force it. api.md is the final arbiter.

## Duplicate detection & preview (the heart of this skill)

Before any write, reconcile the proposed model against what already lives in the
project so you never create a second "ERP".

1. **Read the project's current elements:** `GET /api/projects/:projectId/elements`.
2. **Match each proposed element** against the returned elements by
   **Name + Type, case-insensitive, trimmed** (normalise both sides: trim
   surrounding whitespace, lowercase, compare `name` and `type` together).
3. **Matched → reuse.** Mark the proposed element **`exists — reuse id`** and do
   **NOT** re-create it. When wiring connections, use the **existing element's
   stored id** for that endpoint.
4. **Unmatched → new.** Mark it **`new`**; it will be created.

Then present a **compact preview** before asking to commit:

- **NEW elements**, counted by layer and by type (e.g. `application: 2
  (application_component ×1, application_service ×1)`).
- **Dedup hits**, listed explicitly: `ERP → exists, reusing <id>`.
- **The relationship list** in readable form: `Fulfil Order —realizes→ Order
  Management`, noting which endpoints resolve to a reused id.
- **Dropped** entries: anything flagged `unsupported — dropped`, with the
  suggested nearest valid type.

The preview is the user's single decision point. Keep it scannable.

## Commit contract & executor

**Logical tool (for skill-family consistency):** `architect.commit_elements`
— input `{ projectId, elements[], connections[] }`, output the created ids.
This is the interface the future MCP server will expose. Describe writes in these
terms so the method survives the MCP transition.

**Today, the executor is `the-architect-core/scripts/commit-model.mjs`.** To
commit:

1. Write the reconciled model to a temp file, e.g.
   `/tmp/modeler-model.json`, in the script's shape:
   ```json
   {
     "elements":    [ { "id": "…", "type": "…", "name": "…", "description": "…", "layer": "…" } ],
     "connections": [ { "s": "…", "t": "…", "type": "…", "label": "…" } ]
   }
   ```
   (Include `"project": { … }` only when creating a new project; omit it when
   `PROJECT_ID` targets an existing one.)
2. Run it against the target project:
   ```bash
   API_KEY=ta_… [BASE_URL=http://localhost:4000/api] PROJECT_ID=… \
     node docs/skills/the-architect-core/scripts/commit-model.mjs /tmp/modeler-model.json
   ```

The script **namespaces ids** (`NS()` prefixes each id with a slice of the
projectId), **retries** transient `500` / `401` / `429` writes with backoff, and
**read-back verifies** by re-reading elements and connections and counting by type.

### The NS() / existing-id caveat (prevents silently broken connections)

`NS()` prefixes ids **only for elements the script itself creates** in this
payload. A **reused, pre-existing element already carries its stored id** in the
database — that id is *not* the NS-prefixed form of your local id.

So: a connection endpoint that points at a **new** element uses your local id
(the script will NS() both the element and the reference consistently). But a
connection endpoint that points at a **reused, pre-existing** element must
reference that element's **stored id as-is** — and the script will NS() it,
breaking the match. Therefore, **do not route mixed connections through the
script.** When a connection touches a pre-existing element, create it directly:

```bash
POST /api/projects/:projectId/connections
{ "sourceId": "<stored-or-created id, exactly as stored>",
  "targetId": "<stored-or-created id, exactly as stored>",
  "type": "serving", "label": "…" }
```

Use the script for the pure "all-new" slice (elements + connections wholly among
new elements), and `POST …/connections` for any connection that reuses an
existing element's id. This keeps every relationship actually resolvable instead
of pointing at a namespaced id that doesn't exist.

## Confirmation discipline

Same spirit as `togaf-vision-architect`. Every commit is a write:

1. Show the compact preview (new-by-layer/type, dedup hits, relationships,
   dropped).
2. Get an **explicit** go-ahead ("yes, commit").
3. Only then run the executor.

If the user edits anything during preview (renames, drops an element, changes a
relationship), **update the in-memory model and re-preview** — never commit a
model the user hasn't just seen. Never commit an unseen model.

## Verification & report

After the commit, rely on the script's **read-back** (it re-reads elements and
connections and prints counts by type). Confirm the counts match the preview,
then report to the user:

- Elements created, **counted by type**, plus the **dedup summary** (how many
  reused, which ones).
- Connections created.
- **Where to look:** open the project's **3D view** on the client (`:3000`) to
  see the multi-layer model rendered.

Never claim success unverified — if a read-back count doesn't match the preview,
say so and investigate rather than reporting a clean commit.

## Examples

**Example 1 — multi-layer paragraph → extraction**
Paste: *"Order Management is our order-handling service, realised by the Fulfil
Order process. The ERP application serves that process and reads/writes Order
data. Separately, the Web Shop is served by a Catalog API. Everything runs on a
Kubernetes cluster, and PostgreSQL runs on that cluster."*
Extraction (see `fixtures/modeler-multilayer.json`):
- business: `business_service` **Order Management**, `process` **Fulfil Order**
- application: `application_component` **ERP**, `application_component` **Web Shop**,
  `application_service` **Catalog API**
- information: `data_object` **Order**
- technology: `node` **Kubernetes Cluster**, `system_software` **PostgreSQL**
- relationships: Fulfil Order —`realization`→ Order Management; ERP —`serving`→
  Fulfil Order; Catalog API —`serving`→ Web Shop; ERP —`access`→ Order;
  Kubernetes Cluster —`serving`→ ERP; PostgreSQL —`serving`→ Kubernetes Cluster.
Preview → explicit yes → commit → report counts + 3D view.

**Example 2 — paste overlaps an existing model → dedup**
The project already contains an `application_component` named "ERP". The paste
adds a new `application_component` "CRM" that *serves* the existing ERP.
`GET …/elements` → "ERP" matches on Name+Type (case-insensitive, trimmed) →
mark **`exists — reuse id`**; only **CRM** is `new`. Preview shows: new = 1 (CRM),
dedup = 1 (ERP reused). Because the CRM→ERP connection touches a **pre-existing**
element, create CRM via the script's all-new slice, then create the connection
directly with `POST …/connections` using ERP's **stored id** — not through the
script. Only the delta is written; no duplicate ERP appears.

**Example 3 — ambiguous paste → ask, don't invent**
Paste: *"We have some systems talking to each other."*
There is nothing concrete to extract — no named systems, no relationships. Do
**not** invent placeholder elements. Ask **one** focused clarifying question:
*"Which systems, and how do they talk — which one calls or feeds which?"* Then
extract from the answer. Inventing elements to fill a vague paste violates the
"never push half-formed data" principle.
