# Feature: Oracle — Acceptance Risk Assessment

> **Module:** Oracle  
> **Version:** 2.0  
> **Document Classification:** KSU C3 — CONFIDENTIAL | BSI Protection Level: high  
> **Compliance:** EU AI Act 2024/1689, EU Data Act 2023/2854

---

## 1. What Does Oracle Do?

Oracle is a **single-round stakeholder simulation** for assessing acceptance risk of architecture change proposals. Five AI-driven stakeholder personas independently analyze a proposal and deliver a weighted verdict.

**Core question:** *"Will this change be accepted or blocked by the relevant stakeholders?"*

Oracle delivers a quantified result (score 0-100) within 5-10 seconds, complete with reasoning, resistance factors, and actionable mitigation suggestions — without the expense of a full MiroFish multi-round simulation.

### Where It Fits in the Toolset

| Tool | Purpose | Cost | When to Use |
|---|---|---|---|
| **Oracle** | Quick acceptance risk check | ~5 LLM calls, 5-10s | Before pitching, go/no-go decisions |
| **MiroFish** | Stakeholder negotiation simulation | ~25-50+ LLM calls, minutes | After Oracle returns "contested", deep analysis |

---

## 2. Technical Prerequisites

### 2.1 LLM API Access (REQUIRED)

Oracle requires access to a Large Language Model via an API endpoint. A minimum of **6 LLM calls per assessment** are made (5 stakeholder evaluations + 1 mitigation generation).

**Supported Providers:**

| Provider | Environment Variable | Default Model | Recommendation |
|---|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` | Faster, cheaper |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | Higher reasoning quality |

**Configuration in `.env`:**
```bash
# At least ONE of these keys must be set:
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Model override
OPENAI_MODEL=gpt-4o          # Default: gpt-4o-mini
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Default: claude-haiku-4-5-20251001
```

**Fallback Logic:** OpenAI is checked first. If no key is set, the API returns `503 Service Unavailable` with an explanatory message.

**Estimated Cost per Assessment:**
- gpt-4o-mini: ~$0.01-0.03
- gpt-4o: ~$0.05-0.15
- claude-haiku: ~$0.01-0.03
- claude-sonnet: ~$0.10-0.30

### 2.2 Architecture Data in Project (REQUIRED)

Oracle evaluates changes **in the context of the existing architecture**. The following data must be present in the project:

| Data Source | Storage | Purpose | Minimum |
|---|---|---|---|
| **Architecture Elements** | Neo4j | Affected components with metadata | ≥1 element |
| **Connections/Dependencies** | Neo4j | Dependency graph for impact analysis | Recommended |
| **Element Attributes** | Neo4j Properties | Cost, maturity, risk, error rate, user count | Recommended |
| **Business Layer Links** | Neo4j | Business capability mapping | Optional |

**Important:** The more metadata elements have (annualCost, maturityLevel, riskLevel, errorRatePercent, technicalDebtRatio, userCount), the more precise stakeholder evaluations will be. Elements without metadata receive default values.

### 2.3 Databases

| Database | Purpose |
|---|---|
| **MongoDB** | Storage of Oracle assessments (proposals, verdicts, audit trails) |
| **Neo4j** | Graph queries for element details, dependencies, business capabilities |
| **Redis** | Session management (for authenticated API calls) |

### 2.4 Authentication

Oracle endpoints require:
- **JWT Token** (Access Token) or **API Key** (`ta_` prefix)
- **Project Access:** At least `viewer` role in the project
- **Permission:** `ANALYTICS_SIMULATE`

---

## 3. Input Format (Proposal)

### 3.1 API Endpoint

```
POST /api/projects/:projectId/oracle/assess
```

### 3.2 Request Body (JSON)

```json
{
  "title": "Migrate MongoDB to PostgreSQL",
  "description": "Replace MongoDB document store with PostgreSQL for all application data. Requires schema redesign from document-based to relational model, ORM migration from Mongoose to Prisma, and data migration scripts for ~500k documents.",
  "affectedElementIds": [
    "csv-1775415356867-uomtyfn",
    "csv-1775415356867-ci0vkpy"
  ],
  "changeType": "migrate",
  "estimatedCost": 120000,
  "estimatedDuration": 4,
  "targetScenarioId": "optional-scenario-id",
  "customStakeholders": [
    {
      "name": "Head of HR",
      "role": "HR Director — responsible for employee change fatigue",
      "stakeholderType": "hr",
      "weight": "advisory",
      "riskThreshold": "medium",
      "priorities": ["employee_retention", "training_budget"],
      "visibleLayers": ["business", "strategy"],
      "context": "Currently 3 parallel transformation projects are already underway"
    }
  ]
}
```

### 3.3 Field Validation (Zod Schema)

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | Yes | 1-200 characters |
| `description` | string | Yes | 10-3000 characters |
| `affectedElementIds` | string[] | Yes | At least 1 element ID |
| `changeType` | enum | Yes | `retire`, `migrate`, `consolidate`, `introduce`, `modify` |
| `estimatedCost` | number | — | ≥ 0 |
| `estimatedDuration` | number | — | 1-120 months |
| `targetScenarioId` | string | — | Reference to a scenario |
| `customStakeholders` | array | — | Max 5, each with name/role/type/weight/priorities/layers |

### 3.4 Change Types Explained

| Change Type | Description | Typical Score Range |
|---|---|---|
| `retire` | Decommission a system/component | 15-35 (usually accepted) |
| `consolidate` | Merge multiple systems into one | 35-55 (contested) |
| `migrate` | Technology swap with same purpose | 40-60 (contested) |
| `introduce` | Bring in an entirely new system | 45-65 (often contested) |
| `modify` | Adjust an existing component | 20-45 (usually accepted) |

---

## 4. Stakeholder Personas (AI Agents)

### 4.1 The 5 Preset Personas

| Persona | Stakeholder Type | Weight | Risk Threshold | Visible Layers | Priorities |
|---|---|---|---|---|---|
| **CTO** | c_level | 30% | high | All 5 layers | Innovation, risk reduction, digital transformation |
| **Business Unit Lead** | business_unit | 25% | medium | Strategy, Business | Cost, efficiency, time-to-market |
| **IT Operations Manager** | it_ops | 20% | low | Application, Technology | Stability, security, maintenance cost |
| **Head of Data & Analytics** | data_team | 15% | medium | Information, Application, Technology | Data quality, compliance, integration |
| **CISO** | c_level | 10% | low | Application, Technology, Information | Security, compliance, risk reduction |

### 4.2 Weight Normalization

- Preset weights sum to 100%
- Custom stakeholders: `voting` = 15%, `advisory` = 5%
- All weights are automatically normalized to sum = 1.0

### 4.3 Risk Threshold → Scoring Behavior

| Threshold | Scoring Guidance |
|---|---|
| **HIGH** (CTO) | Conservative. Score 65-80 for mixed trade-offs. Below 40 only for core strategic threats. |
| **MEDIUM** (Business, Data) | Balanced. Score 50-70. No "safe middle" — take a clear position. |
| **LOW** (IT Ops, CISO) | Strict. Does the change ADD risk → score 20-40. Does it REDUCE risk → score 60-80. |

---

## 5. Output Format (Verdict)

### 5.1 Response Body (JSON)

```json
{
  "success": true,
  "assessmentId": "69d2d4bc95786436444f2651",
  "data": {
    "acceptanceRiskScore": 58,
    "riskLevel": "medium",
    "overallPosition": "contested",
    "agentVerdicts": [
      {
        "personaId": "cto",
        "personaName": "CTO",
        "stakeholderType": "c_level",
        "position": "approve",
        "reasoning": "Strategically sound for scalability...",
        "concerns": ["Migration timeline too aggressive"],
        "acceptanceScore": 75
      }
    ],
    "resistanceFactors": [
      {
        "factor": "Operational complexity increase",
        "severity": "high",
        "source": "IT Operations Manager",
        "description": "..."
      }
    ],
    "mitigationSuggestions": [
      "Implement phased rollout starting with non-critical services..."
    ],
    "fatigueForecast": {
      "projectedDelayMonths": 2.8,
      "budgetAtRisk": 25812,
      "overloadedStakeholders": ["IT Operations Manager", "CISO"]
    },
    "durationMs": 7290,
    "timestamp": "2026-04-05T21:30:00.000Z"
  }
}
```

### 5.2 Score Interpretation

| Score | Risk Level | Position | Meaning |
|---|---|---|---|
| 0-30 | low | likely_accepted | Broad approval expected |
| 31-55 | medium | contested | Split opinions — rework needed |
| 56-75 | high | contested | Strong resistance — compromises required |
| 76-100 | critical | likely_rejected | Blockade expected — fundamental redesign needed |

---

## 6. EU AI Act — Compliance Requirements

### WARNING: User Commitment Required

Oracle is an **AI-assisted decision support system** subject to the EU AI Act 2024/1689. The following points are **legally binding** and require explicit action from the user.

### 6.1 Art. 52 — Transparency Obligation

**The user must know and acknowledge:**
- Oracle results are generated by an AI system (Large Language Model)
- The stakeholder personas are **simulated**, not real people
- Assessments are based on probabilities, not facts
- The system classifies itself as **"limited risk"** per Art. 6(2)

> **The UI displays a transparency notice before every assessment. By submitting the proposal, the user confirms they have acknowledged this.**

### 6.2 Art. 14 — Human Oversight

**Every Oracle assessment starts with the status `pending_review`.**

This means: **The result must NOT be used as a sole basis for decision-making** until a human reviewer has examined the assessment and updated its status.

**User Commitment:**

1. **Review the result** — The user must read through the stakeholder reasoning, resistance factors, and mitigations and verify plausibility
2. **Set the status** — The user must actively change the human oversight status:
   - `reviewed` — "I have read and understood the result"
   - `approved` — "I accept this result as a basis for decision-making"
   - `rejected` — "This result is not usable"
3. **Add notes** — For `approved` or `rejected`, a justification should be recorded

> **As long as the status remains `pending_review`, the assessment is a draft — not a decision.**

### 6.3 Art. 12 — Logging (Audit Trail)

Every assessment automatically logs:

| Data | What Is Stored | Purpose |
|---|---|---|
| **Initiator** | userId, userName, userEmail, authMethod, apiKeyPrefix | Who triggered the assessment? (GDPR Art. 6(1)(c)) |
| **Context Snapshot** | SHA-256 hash of architecture state, element/connection count | What was the data basis at timestamp T? |
| **System Prompts** | Complete prompt per stakeholder persona | What instructions did the AI receive? |
| **Raw LLM Responses** | Complete, unfiltered AI responses | What did the AI actually answer? |
| **Model Parameters** | Provider, model, temperature, maxTokens, fallback status | What AI configuration was used? |
| **Scoring Methodology** | Weights, raw scores, rounding | How was the score calculated? |

### 6.4 Art. 13 — Decision Logic Transparency

The complete decision chain is traceable:

```
Input (Proposal) → Prompt (per Persona) → LLM Response → Parsing → Score → Weighting → Aggregation
```

Every step is documented in the **JSON export** and the **PDF report**, including:
- The exact system prompt sent to the LLM
- The unfiltered response from the LLM
- The filtered architecture context each persona could "see"
- The weights and weighted risk contributions

### 6.5 Document Classification

All Oracle reports (PDF and JSON) are classified per **BSI IT-Grundschutz** (German Federal Office for Information Security):

```
KSU: C3 — CONFIDENTIAL | BSI Protection Level: high | Internal use only
```

**Rationale:** The reports contain:
- Internal architecture details (costs, risks, vulnerabilities)
- AI-generated assessments of internal decision processes
- Complete LLM prompts containing company data
- Personal data (initiator identity)

---

## 7. Export Formats

### 7.1 PDF Report

- **Filename:** `TA-ORA_{ProjectName}_{Date}_{ID}.pdf`
- **Contents:** Executive summary, stakeholder verdicts, resistance factors, mitigations, fatigue forecast, EU AI Act audit trail, full system prompts and LLM responses
- **KSU banner** on every page
- **Endpoint:** `GET /api/projects/:projectId/oracle/:assessmentId/report/pdf`

### 7.2 JSON Export (Machine-Readable)

- **Filename:** `TA-ORA_{ProjectName}_{Date}_{ID}.json`
- **Schema:** `oracle_acceptance_risk_assessment v2.0`
- **Purpose:** Import into databases, compliance systems, archiving
- **Endpoint:** `GET /api/projects/:projectId/oracle/:assessmentId/report/json`

### 7.3 History

- **Endpoint:** `GET /api/projects/:projectId/oracle/history`
- **Limit:** Last 20 assessments, sorted by creation date (newest first)

---

## 8. API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/projects/:projectId/oracle/assess` | JWT/API-Key + `ANALYTICS_SIMULATE` | Run new assessment |
| `GET` | `/api/projects/:projectId/oracle/history` | JWT/API-Key + `ANALYTICS_SIMULATE` | Fetch assessment history |
| `GET` | `/api/projects/:projectId/oracle/:assessmentId/report/pdf` | JWT/API-Key | Download PDF report |
| `GET` | `/api/projects/:projectId/oracle/:assessmentId/report/json` | JWT/API-Key | Download JSON export |

### Error Codes

| Code | Meaning |
|---|---|
| `400` | Validation error — proposal does not match schema |
| `401` | Not authenticated |
| `403` | Insufficient permissions (missing permission or project access) |
| `404` | Assessment or project not found |
| `503` | No LLM API key configured (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` missing) |

---

## 9. Checklist: Before Your First Oracle Assessment

- [ ] **LLM API key** set in `.env` (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
- [ ] **Project exists** with at least one architecture element in Neo4j
- [ ] **Elements have metadata** (annualCost, maturityLevel, riskLevel — recommended for precise assessment)
- [ ] **User is authenticated** and holds `ANALYTICS_SIMULATE` permission
- [ ] **User understands:** Oracle is AI-powered; results are recommendations, not decisions
- [ ] **User understands:** Every assessment must be manually reviewed (Human Oversight, Art. 14)
- [ ] **User understands:** Reports are classified KSU C3 / CONFIDENTIAL and must not be shared externally
