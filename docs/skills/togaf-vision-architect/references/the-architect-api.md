# The Architect — API contract (action layer)

The MCP server is not built yet. Until it is, commit models through this REST API.
When the MCP server ships, it wraps exactly these operations.

## Contents
- Auth & connection (and its pitfalls)
- Endpoints (project, elements, connections, vision)
- Enums (layer, domain, element types, relationship types, status)
- Assumption vs. validated encoding
- Dual representation (the gotcha that leaves the Phase-A panel empty)
- Verification (read-back)

## Auth & connection

Base URL (local dev): `http://localhost:4000/api` (the client runs on `:3000`).
Two auth methods on the `authenticate` middleware:

- **API key (preferred):** header `X-API-Key: ta_…` (or `Authorization: Bearer ta_…`).
- **Login:** `POST /api/auth/login` `{ "email", "password" }` → `accessToken`,
  then `Authorization: Bearer <accessToken>`.

Pitfalls learned the hard way:
- The **local server uses its own local MongoDB** (`localhost:27017`), separate
  from production. An API key only works against the instance whose DB holds it.
- `.env` keys named `THEARCHITECT_API_KEY*` are typically **outbound** keys (the
  app calling prod/RAG) — they are **not** registered in the local DB and will
  401 locally.
- API keys can be rotated/stale. If you get `401 Invalid API key`, generate a
  fresh one: **Settings → API Keys → Generate New Token** (the raw `ta_…` value
  is shown **once** — copy it immediately; only a SHA-256 hash is stored).

## Endpoints

All `/:projectId/*` routes require project access. Element/connection creation
require `ELEMENT_CREATE` / `CONNECTION_CREATE` permissions (the key's user role).

### Create project
`POST /api/projects`
```json
{ "name": "string", "description": "string", "tags": ["string"] }
```
→ `{ "data": { "_id": "…", … } }` (or `id`). Use that as `:projectId`.

### Create element
`POST /api/projects/:projectId/elements`
```json
{
  "id": "stable-local-id",          // optional; if you pass it, it's honored — use it to wire relations + positions deterministically
  "type": "stakeholder",            // see element types below (free string, but use canonical values)
  "name": "string",
  "description": "string",
  "layer": "motivation",            // LayerEnum (required)
  "togafDomain": "motivation",      // TOGAFDomainEnum (required)
  "status": "current",              // current | target | transitional | retired
  "riskLevel": "low",               // low | medium | high | critical
  "maturityLevel": 1,               // 1..5
  "position3D": { "x": 0, "y": 0, "z": 0 },   // see references/3d-layout.md — SMALL units
  "metadata": { "assumption": false }          // free-form; use for assumption flag, roles, etc.
}
```
→ `201 { "success": true, "data": { "id", … } }`.

### Create connection (relationship)
`POST /api/projects/:projectId/connections`
```json
{ "sourceId": "id", "targetId": "id", "type": "influence", "label": "string" }
```
→ `201 { "success": true, "data": { "id", … } }`. Connections get auto ids.
**There is no PUT/PATCH for connections** — to change a relationship type, DELETE
and re-create:
`DELETE /api/projects/:projectId/connections/:connectionId`.

### Set the project vision + stakeholders (the Phase-A panel)
`PUT /api/projects/:projectId`
```json
{
  "vision": {
    "scope": "string",
    "visionStatement": "string",
    "principles": ["string"],
    "drivers": ["string"],
    "goals": ["string"]
  },
  "stakeholders": [
    { "id": "string", "name": "string", "role": "string",
      "stakeholderType": "c_level|business_unit|it_ops|data_team|external",
      "interests": ["string"], "influence": "high|medium|low",
      "attitude": "champion|supporter|neutral|critic" }
  ]
}
```

### Update element position
`PUT /api/projects/:projectId/elements/:elementId` with `{ "position3D": { … } }`.

### Read back (verify)
`GET /api/projects/:projectId/elements` and `…/connections`.

## Enums

**layer** (`LayerEnum`): `motivation`, `strategy`, `business`, `information`
(=Data), `application`, `technology`, `physical`, `implementation_migration`.

**togafDomain** (`TOGAFDomainEnum`): `strategy`, `business`, `data`,
`application`, `technology`, `motivation`, `implementation`.

**element `type`** (canonical values; `type` is a free string but use these):
- Motivation (`layer: "motivation"`, `togafDomain: "motivation"`):
  `stakeholder`, `driver`, `assessment`, `goal`, `outcome`, `principle`,
  `requirement`, `constraint`, `am_value`, `meaning`.
- Strategy (`layer: "strategy"`, `togafDomain: "strategy"`):
  `business_capability`, `value_stream`, `resource`, `course_of_action`.
- Business (`layer: "business"`): `business_actor`, `business_role`, `process`,
  `business_function`, `business_service`, `business_object`, `product`,
  `contract`, … (full list in `packages/shared/.../togaf.constants.ts`).

**relationship `type`** (ArchiMate 3.2): `composition`, `aggregation`,
`assignment`, `realization`, `serving`, `access`, `influence`, `triggering`,
`flow`, `specialization`, `association`.
Common motivation patterns: stakeholder —influence→ driver; driver —influence→
goal; goal —realization→ outcome; principle —association/realization→ goal;
principle —influence→ requirement.
Value Stream View pattern: **capability —serving→ value_stream** (points up);
value_stream —realization→ outcome; value_stream —flow→ value_stream (a flywheel).

**status**: `current`, `target`, `transitional`, `retired`.

## Assumption vs. validated encoding

Provenance fields (`provenance`, `certifiedBy`, `certifiedAt`, `confidence`) are
**set server-side and deliberately NOT accepted from the request body** (anti-
spoofing: "user-verified" must not be forgeable). So encode the distinction with
fields you *can* set:
- validated → `status: "current"`, `metadata.assumption: false`
- assumption → `status: "target"`, `metadata.assumption: true`

(When the MCP server adds a certify endpoint, validated elements can additionally
be certified — but the status+metadata convention is the durable signal.)

## Dual representation (don't leave the Phase-A panel empty)

Two separate stores describe "the vision":
- **Graph elements** live in Neo4j (`ArchitectureElement` nodes) — written by
  `POST …/elements`. These render in the 2D/3D canvas.
- **The project's `vision` + `stakeholders`** live in MongoDB — written by
  `PUT /api/projects/:id`. The **Envision Phase-A panel reads these.**

Creating elements does **not** populate the Phase-A panel, and setting the vision
does not create canvas elements. **Do both** so the model is coherent everywhere.
(This mismatch is also a known product wart — worth flagging to the user.)

## Verification

After committing, GET elements + connections and count by `type`. Confirm the
counts match what you previewed, and that `metadata.assumption` split matches the
validated/assumption intent. Report it back; don't claim success unverified.
