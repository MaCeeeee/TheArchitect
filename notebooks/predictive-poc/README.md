# Element-Similarity PoC

> **Goal:** Validate within 3 hours whether sentence-embedding similarity is good enough to power the Reuse-Mode of UC-DATA-001 V2 + the redundancy detection of UC-RED-001 + the harmonization-matching of UC-HARM-001.
>
> **Decision-Gate:** Of 5 hand-picked test queries, at least **4** must return top-10 results that a senior architect would consider "intuitively sensible". If yes → green-light Sprint-2/3 production-implementation. If no → fall back to Pattern-Mining (Option B from the strategy doc).

**Strategy reference:** [docs/strategy/2026-05-06-predictive-architecture.md](../../docs/strategy/2026-05-06-predictive-architecture.md)

---

## Time-Box: 3 Hours

| Stage | Duration | Output |
|---|---|---|
| 1. Data extraction | 30 min | `data/elements.json` — 200-1000 elements from local DB |
| 2. Embedding + index | 30 min | `data/embeddings.npz` + cosine-similarity helper |
| 3. Test-query run | 30 min | `findings.md` — top-10 per query + manual scoring |
| 4. Decision documentation | 15 min | "Continue / Fallback" verdict at top of findings |
| Buffer for setup, debugging | 75 min | (Python install, model download, fixing CSV issues) |

**Hard stop at 3 hours** — if not done, document where we are and pause. No scope creep.

---

## Tech Stack (lean, open-source-first)

| Component | Choice | Why |
|---|---|---|
| Embedding model | `sentence-transformers/all-mpnet-base-v2` | 109M params, 768-dim, balanced speed+quality, no API cost |
| Similarity | numpy cosine in-memory | <1000 elements, FAISS/Qdrant overkill |
| Runtime | Python 3.11+ script (not Jupyter) | Simpler to run, simpler to share |
| Data source | local Neo4j → JSON dump via TS script | Reproducible, no production dependency |

**Optional fallback** if `sentence-transformers` is too heavy to install (large `torch` dependency):
- OpenAI `text-embedding-3-small` via API — needs `OPENAI_API_KEY`, has API cost (~$0.02 for 1000 elements)
- Both code paths are provided in `embed.py`; switch via env var `EMBEDDING_BACKEND=local|openai`

---

## What we input

Each element is encoded as a single string:

```
{name} — {type} ({layer}). {description}
```

Examples:
- `Emissions-Record — data_object (information). Monthly Scope 1/2/3 GHG measurements per facility`
- `SAP S/4HANA — application_component (application). Core ERP, billing + finance + supply chain`
- `Risk Management Requirement — requirement (motivation). Companies must establish a risk-management system`

This concatenation is **lossy on purpose**: we want the embedding to capture what kind of thing this is + what it does, ignoring detail-noise like cost numbers or position coordinates.

---

## The 5 Test-Queries (Decision-Critical)

Each is hand-picked to test a different similarity dimension. We score "intuitively sensible" yes/no for each.

### Query 1 — Direct synonym match (semantic)
**Input:** "Emissions data record for greenhouse gas reporting"
**Expected:** top-3 should include `Emissions-Record`, `Greenhouse Gas Accounting` or similar — even if the exact text doesn't appear.
**Tests:** Does the embedding capture "emissions" ≈ "greenhouse gas" without the literal token overlap?

### Query 2 — Cross-project capability
**Input:** "Customer-Master data with PII"
**Expected:** top-5 should include any `customer_master`, `client-record`, `user-profile` from any project, even if BSH demo doesn't have one.
**Tests:** Does it generalize across project domains?

### Query 3 — Different layer, similar function
**Input:** "Audit trail logging for compliance"
**Expected:** top-10 should include both `audit-log` data-objects AND `compliance-audit-process` business processes.
**Tests:** Does it span layers when functionality is similar?

### Query 4 — Compliance-anchor matching
**Input:** "Verify supplier complies with LkSG due diligence obligations"
**Expected:** top-10 should include the LkSG-related `Supplier Due Diligence` requirements + the related Process.
**Tests:** Does it match a German-law concept against named entities?

### Query 5 — Negative test (false-positive avoidance)
**Input:** "Coffee mug ordering system"
**Expected:** top-10 should be **noticeably worse matches** — score distribution flatter, top-1 should look like a stretch.
**Tests:** Is the model honest about not-in-corpus queries?

---

## Decision-Criteria (concrete, not subjective)

After running the 5 queries, mark each as PASS / FAIL based on:

- **PASS:** at least 4 of 10 results are "I'd consider this if I were modelling"
- **FAIL:** noise dominates, top-1 is wildly off, or no clear ranking signal

| Score | Outcome |
|---|---|
| 5/5 PASS | Strong green-light — proceed to production-service in Sprint 2 |
| 4/5 PASS | Green-light — proceed but watch quality metrics in production |
| 3/5 PASS | Yellow — try `e5-large-v2` model or richer input string before deciding |
| ≤2/5 PASS | Red — fall back to Pattern-Mining (Option B), embedding approach not ready |

---

## Files in this directory

```
notebooks/predictive-poc/
├── README.md               ← this plan
├── requirements.txt        ← Python dependencies (sentence-transformers, numpy)
├── extract.ts              ← TypeScript: dump elements from local Neo4j to JSON
├── embed.py                ← Python: load JSON, embed, search top-K, print results
├── data/
│   ├── elements.json       ← (after step 1) input data
│   └── embeddings.npz      ← (after step 2) cached embeddings
└── findings.md             ← (after step 3) results + decision
```

---

## How to run

### Step 1 — Extract elements from local DB

```bash
# From repo root, with local docker stack running (mongo + neo4j up):
cd packages/server
npx tsx ../../notebooks/predictive-poc/extract.ts
# → writes notebooks/predictive-poc/data/elements.json
```

### Step 2 — Setup Python + embed

```bash
cd notebooks/predictive-poc
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt    # ~400MB on first run for sentence-transformers
python embed.py --build-index
# → writes data/embeddings.npz
```

### Step 3 — Run test queries

```bash
python embed.py --query
# → prints top-10 per query, you score in findings.md
```

### Step 4 — Document the decision in `findings.md`

Use the template at the top of `findings.md` (created on first run).

---

## Out of Scope (for THIS PoC, deferred)

- Multi-tenancy / cross-workspace data leakage (production design needs strict isolation — this PoC may mix projects)
- UI / frontend integration (PoC is CLI/Python-only)
- Persistence beyond local cache (production will use Qdrant which is already in the stack)
- Fine-tuning the model (out-of-the-box quality is what we're measuring)
- Field-level / schema embeddings (would need V2-data — out of scope for V1 measurement)
- Performance benchmarks (we're testing quality first, speed second)

---

## What success looks like (concrete)

Three tangible outputs:

1. `findings.md` containing 5 query-result tables + per-query PASS/FAIL + final verdict
2. A 1-sentence go/no-go recommendation in the verdict line
3. (If green) — a line item added to Sprint 2 backlog: "Build `elementSimilarity.service.ts` based on PoC-validated approach"

If we end the 3-hour timebox without these three artifacts, we documented where we got stuck and why — also a valid result.
