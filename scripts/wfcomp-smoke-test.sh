#!/usr/bin/env bash
#
# wfcomp-smoke-test.sh — exercise the UC-WFCOMP-001 Art.-30 assessment API end-to-end.
#
# WHAT THIS PROVES (today, via the backend API — there is NO frontend page yet):
#   A user brings an n8n workflow (as JSON over the API) into a project; the tool
#   maps it against the applicable regulation's requirement set (GDPR Art. 30) and
#   returns an honest gap report — present / missing / needs-human — plus lets a
#   person ATTEST a field so it flips to present (never the LLM).
#
# IMPORTANT SCOPE NOTE (read this):
#   "Which laws apply" is NOT discovered dynamically yet. The tool currently maps
#   every workflow against ONE fixed regulation (Art. 30), referenced by
#   regulationKey 'dsgvo:art-30'. True "search the DB for all applicable laws and
#   map them" needs the corpus read-path (THE-368) + a regulation-selector — see
#   the note printed at the end.
#
# Usage:
#   EMAIL=you@example.com PASSWORD=secret ./scripts/wfcomp-smoke-test.sh
# Optional env:
#   BASE_URL   (default http://localhost:4000/api)
#   PROJECT_ID (default: first project the user can access)
#
set -uo pipefail

BASE="${BASE_URL:-http://localhost:4000/api}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
PROJECT_ID="${PROJECT_ID:-}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
hr()   { printf '\033[2m%s\033[0m\n' "────────────────────────────────────────────────────────"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || die "curl not found"
command -v jq   >/dev/null || die "jq not found (brew install jq)"
[ -n "$EMAIL" ] && [ -n "$PASSWORD" ] || die "set EMAIL and PASSWORD env vars (a real login on $BASE)"

# Pretty-print a verdict response from stdin.
show_verdict() {
  jq -r '
    if (.success == false) or (.error and (.data | not)) then
      "  [31mHTTP error:[0m \(.error // "unknown")"
    else
      (.data // .) as $d
      | "  GDPR scope: \($d.gdprScope)"
      + (if $d.gdprScope then
           "\n" + ([ $d.fields[]
             | "    lit. \(.litera)  [\(.criticality)]  →  \(.status)"
               + (if .mode then "   (mode=\(.mode))" else "" end)
               + (if .suggestion then "\n        ↳ LLM suggests: \"\(.suggestion.value)\" (conf \(.suggestion.confidence))" else "" end)
           ] | join("\n"))
         else
           "\n  → Art. 30 NOT applicable (no personal data detected) — honest \"not in scope\""
         end)
    end'
}

assess() { # $1=label  $2=workflowId  $3=json  [$4=query suffix e.g. "&infer=true"]
  bold "▶ $1"
  curl -s -X POST "$BASE/projects/$PROJECT_ID/wfcomp/assess?workflowId=$2${4:-}" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$3" | show_verdict
  echo
}

# ── n8n workflow fixtures (embedded, so this script is self-contained) ─────────
WF_MISSING_RECIPIENT='{"name":"Internal Survey Store","nodes":[{"parameters":{"path":"survey","httpMethod":"POST"},"name":"Survey Webhook","type":"n8n-nodes-base.webhook","typeVersion":1,"position":[200,300]},{"parameters":{"values":{"string":[{"name":"email","value":""},{"name":"answer","value":""}]}},"name":"Map Answer","type":"n8n-nodes-base.set","typeVersion":2,"position":[420,300]},{"parameters":{"operation":"insert","table":"survey_answers"},"name":"Store Answer","type":"n8n-nodes-base.postgres","typeVersion":2,"position":[640,300]}],"connections":{"Survey Webhook":{"main":[[{"node":"Map Answer","type":"main","index":0}]]},"Map Answer":{"main":[[{"node":"Store Answer","type":"main","index":0}]]}}}'

WF_CLEAN='{"name":"Newsletter Signup (compliant)","nodes":[{"parameters":{"path":"signup","httpMethod":"POST"},"name":"Signup Webhook","type":"n8n-nodes-base.webhook","typeVersion":1,"position":[200,300]},{"parameters":{"values":{"string":[{"name":"email","value":""},{"name":"firstName","value":""}]}},"name":"Map Subscriber Fields","type":"n8n-nodes-base.set","typeVersion":2,"position":[420,300]},{"parameters":{"url":"https://api.cleverreach.de/v3/receivers","method":"POST"},"name":"CleverReach (EU)","type":"n8n-nodes-base.httpRequest","typeVersion":4,"position":[640,300]},{"parameters":{"operation":"insert","table":"subscribers"},"name":"Store Subscriber","type":"n8n-nodes-base.postgres","typeVersion":2,"position":[860,300]}],"connections":{"Signup Webhook":{"main":[[{"node":"Map Subscriber Fields","type":"main","index":0}]]},"Map Subscriber Fields":{"main":[[{"node":"CleverReach (EU)","type":"main","index":0}]]},"CleverReach (EU)":{"main":[[{"node":"Store Subscriber","type":"main","index":0}]]}}}'

WF_THIRDCOUNTRY='{"name":"CRM Sync to US (no safeguard)","nodes":[{"parameters":{"path":"contact","httpMethod":"POST"},"name":"Contact Webhook","type":"n8n-nodes-base.webhook","typeVersion":1,"position":[200,300]},{"parameters":{"values":{"string":[{"name":"email","value":""},{"name":"fullName","value":""}]}},"name":"Map Contact","type":"n8n-nodes-base.set","typeVersion":2,"position":[420,300]},{"parameters":{"url":"https://api.mailchimp.com/3.0/lists/members","method":"POST"},"name":"Mailchimp (US)","type":"n8n-nodes-base.httpRequest","typeVersion":4,"position":[640,300]}],"connections":{"Contact Webhook":{"main":[[{"node":"Map Contact","type":"main","index":0}]]},"Map Contact":{"main":[[{"node":"Mailchimp (US)","type":"main","index":0}]]}}}'

WF_NO_PII='{"name":"Nightly Backup Move","nodes":[{"parameters":{"triggerTimes":{"item":[{"mode":"everyDay"}]}},"name":"Nightly Trigger","type":"n8n-nodes-base.scheduleTrigger","typeVersion":1,"position":[200,300]},{"parameters":{"operation":"download","bucketName":"backups-src"},"name":"S3 Download","type":"n8n-nodes-base.awsS3","typeVersion":1,"position":[420,300]},{"parameters":{"operation":"upload","bucketName":"backups-archive"},"name":"S3 Archive","type":"n8n-nodes-base.awsS3","typeVersion":1,"position":[640,300]}],"connections":{"Nightly Trigger":{"main":[[{"node":"S3 Download","type":"main","index":0}]]},"S3 Download":{"main":[[{"node":"S3 Archive","type":"main","index":0}]]}}}'

# ── 1. Login ───────────────────────────────────────────────────────────────────
hr; bold "Login → $BASE"
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.accessToken // empty')
ROLE=$(echo "$LOGIN" | jq -r '.user.role // "?"')
[ -n "$TOKEN" ] || die "login failed: $(echo "$LOGIN" | jq -r '.error // .' )"
printf '  ✓ logged in as %s (role: %s)\n' "$EMAIL" "$ROLE"

# ── 2. Resolve a project ───────────────────────────────────────────────────────
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(curl -s "$BASE/projects" -H "Authorization: Bearer $TOKEN" \
    | jq -r 'def pick:(.data // .projects // .); (pick | if type=="array" then .[0] else empty end) | (._id // .id) // empty')
fi
[ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ] || die "no project found — pass PROJECT_ID=<id>"
printf '  ✓ using project %s\n' "$PROJECT_ID"

# ── USE CASE 1 (the headline): bring a workflow as JSON → map to the law ───────
hr
bold "USE CASE 1 — Import workflow by JSON, map to the applicable regulation (Art. 30)"
echo "  A survey workflow stores personal data but names no recipient. The tool maps"
echo "  it to Art. 30(1)'s required fields and shows what is present / missing / human."
echo
assess "Assess 'Internal Survey Store'" "demo-survey" "$WF_MISSING_RECIPIENT"
echo "  Reading: lit. d (Recipients, HART) = missing → a deterministic, honest red."
echo "  lit. a/b/c/f/g = needs_attestation → only a human/LLM can produce these."

# ── USE CASE 2: a clean, well-formed workflow ─────────────────────────────────
hr
bold "USE CASE 2 — A compliant newsletter signup (EU recipient present)"
assess "Assess 'Newsletter Signup'" "demo-newsletter" "$WF_CLEAN"
echo "  Reading: lit. d present (CleverReach .de = EU recipient). The remaining"
echo "  needs_attestation fields are the honest 'we never sign these for you' seam."

# ── USE CASE 3: third-country transfer without safeguard ──────────────────────
hr
bold "USE CASE 3 — Conditional gap: transfer to a US service, no safeguard"
assess "Assess 'CRM Sync to US'" "demo-uscrm" "$WF_THIRDCOUNTRY"
echo "  Reading: lit. e (Third-country transfer, BEDINGT) surfaces because a non-EU"
echo "  recipient (mailchimp.com) is detected — the conditional guard fires."

# ── USE CASE 4: nothing personal → law not applicable ─────────────────────────
hr
bold "USE CASE 4 — Honest 'not in scope': a backup job with no personal data"
assess "Assess 'Nightly Backup Move'" "demo-backup" "$WF_NO_PII"
echo "  Reading: gdprScope=false. The tool does NOT invent an Art. 30 obligation."

# ── USE CASE 5: LLM-assisted suggestions (graceful if no LLM configured) ───────
hr
bold "USE CASE 5 — LLM-assisted field suggestions (?infer=true)"
echo "  Adds guarded suggestions for purpose/categories (lit. b/c). If no LLM is"
echo "  configured the API degrades gracefully (fields stay 'ask', never a 500)."
assess "Assess 'Newsletter Signup' with inference" "demo-newsletter" "$WF_CLEAN" "&infer=true"

# ── USE CASE 6: human attestation flips the verdict (Notar loop) ──────────────
hr
bold "USE CASE 6 — A human attests the missing recipient → it flips to 'present'"
echo "  Re-uses workflowId 'demo-survey' from Use Case 1 (the one missing lit. d)."
echo "  Requires GOVERNANCE_APPROVE — a viewer cannot do this."
RECO=$(curl -s -X POST "$BASE/projects/$PROJECT_ID/wfcomp/recompute" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"workflowId":"demo-survey","attestations":[{"litera":"d","value":"ACME Processing GmbH (AVV signed)"}]}')
echo
echo "$RECO" | jq -e '.data' >/dev/null 2>&1 \
  && { echo "$RECO" | show_verdict; echo "  Reading: lit. d is now 'present' — a PERSON made it green (persisted, provenance:user)."; } \
  || echo "  → $(echo "$RECO" | jq -r '.error // .')  (need a role with governance:approve, and Use Case 1 must have run first)"

# ── Closing note ──────────────────────────────────────────────────────────────
hr
bold "Scope reminder — what is and isn't built"
cat <<'NOTE'
  ✓ Built: workflow (JSON/API) → mapped to ONE fixed regulation (Art. 30) →
           honest gap report → human attestation persists the verdict.
  ✗ Not yet: "search the DB for ALL laws that apply and map them." Today the
           regulation is fixed to 'dsgvo:art-30'. Dynamic multi-law discovery
           needs the corpus read-path (THE-368, in progress) + a regulation
           selector. The corpus already stores the law canonically; the assess
           call references it by {regulationKey, versionHash}, not a copy.
  ✗ Not yet: a FRONTEND page. WfcompVerdict.tsx exists but is mounted nowhere.
           To click this in the UI we need a small "Assess Workflow" page.
NOTE
