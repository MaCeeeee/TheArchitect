"""Element-Similarity PoC — embedding + cosine search.

Two phases:
  - --build-index : load elements.json, embed each, save embeddings.npz
  - --query       : load embeddings, run the 5 hand-picked test queries,
                    print top-10 per query

Usage:
    python embed.py --build-index
    python embed.py --query

Decision-gate: each of the 5 queries scored PASS/FAIL by a human
reviewer; >=4 PASS = green-light for production embedding service.
See README.md for the full plan.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List

import numpy as np

POC_DIR = Path(__file__).parent
DATA_DIR = POC_DIR / "data"
ELEMENTS_PATH = DATA_DIR / "elements.json"
EMBEDDINGS_PATH = DATA_DIR / "embeddings.npz"

MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"

# 5 hand-picked test-queries — see README.md "The 5 Test-Queries"
TEST_QUERIES: list[tuple[str, str, str]] = [
    (
        "Q1 Direct synonym match (semantic)",
        "Emissions data record for greenhouse gas reporting",
        "Top-3 should include Emissions-Record / GHG Accounting (without literal token overlap)",
    ),
    (
        "Q2 Cross-project capability",
        "Customer-Master data with PII",
        "Top-5 should include any customer/client/user master record across projects",
    ),
    (
        "Q3 Different layer, similar function",
        "Audit trail logging for compliance",
        "Top-10 should span audit-log data-objects + audit-process business processes",
    ),
    (
        "Q4 Compliance-anchor matching",
        "Verify supplier complies with LkSG due diligence obligations",
        "Top-10 should include LkSG supplier-due-diligence requirements + related processes",
    ),
    (
        "Q5 Negative test (false-positive avoidance)",
        "Coffee mug ordering system",
        "Top-10 should be NOTICEABLY worse — flatter score distribution, top-1 a stretch",
    ),
]


@dataclass
class Element:
    id: str
    name: str
    description: str
    type: str
    layer: str
    project_id: str

    @classmethod
    def from_dict(cls, d: dict) -> "Element":
        return cls(
            id=d["id"],
            name=d["name"],
            description=d.get("description", "") or "",
            type=d.get("type", "unknown") or "unknown",
            layer=d.get("layer", "unknown") or "unknown",
            project_id=d.get("projectId", "unknown") or "unknown",
        )

    def to_embedding_input(self) -> str:
        """Single-line representation fed to the embedding model.

        Lossy on purpose: skip noise (cost, position) so embeddings
        capture WHAT this is + what it does.
        """
        desc = self.description.strip()
        if len(desc) > 400:
            desc = desc[:400] + "..."
        prefix = f"{self.name} — {self.type} ({self.layer})"
        return f"{prefix}. {desc}" if desc else prefix


def load_elements() -> list[Element]:
    if not ELEMENTS_PATH.exists():
        print(f"[error] {ELEMENTS_PATH} not found — run extract.ts first", file=sys.stderr)
        sys.exit(1)
    payload = json.loads(ELEMENTS_PATH.read_text())
    return [Element.from_dict(e) for e in payload["elements"]]


def cmd_build_index() -> None:
    from sentence_transformers import SentenceTransformer

    elements = load_elements()
    print(f"[build] loaded {len(elements)} elements")

    print(f"[build] loading model {MODEL_NAME} (first run downloads ~400MB)…")
    model = SentenceTransformer(MODEL_NAME)

    inputs = [e.to_embedding_input() for e in elements]
    print(f"[build] encoding {len(inputs)} elements (batch=32)…")
    vectors = model.encode(
        inputs,
        batch_size=32,
        show_progress_bar=True,
        normalize_embeddings=True,  # so dot-product == cosine
    )
    print(f"[build] embedded shape: {vectors.shape}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(
        EMBEDDINGS_PATH,
        vectors=vectors.astype(np.float32),
        ids=np.array([e.id for e in elements]),
        names=np.array([e.name for e in elements]),
        types=np.array([e.type for e in elements]),
        layers=np.array([e.layer for e in elements]),
        project_ids=np.array([e.project_id for e in elements]),
        descriptions=np.array([e.description[:300] for e in elements]),
    )
    print(f"[build] wrote {EMBEDDINGS_PATH}")


def cmd_query() -> None:
    from sentence_transformers import SentenceTransformer

    if not EMBEDDINGS_PATH.exists():
        print(f"[error] {EMBEDDINGS_PATH} not found — run --build-index first", file=sys.stderr)
        sys.exit(1)

    arr = np.load(EMBEDDINGS_PATH, allow_pickle=False)
    vectors = arr["vectors"]
    names = arr["names"]
    types = arr["types"]
    layers = arr["layers"]
    project_ids = arr["project_ids"]
    descriptions = arr["descriptions"]
    print(f"[query] loaded index: {vectors.shape[0]} elements x {vectors.shape[1]} dims\n")

    print(f"[query] loading model {MODEL_NAME}…")
    model = SentenceTransformer(MODEL_NAME)

    # Map projectId → short label for compact display
    unique_pids = list(dict.fromkeys(project_ids.tolist()))
    short_pid = {pid: f"P{i + 1}" for i, pid in enumerate(unique_pids)}

    for idx, (label, query, expectation) in enumerate(TEST_QUERIES, start=1):
        print("=" * 80)
        print(f"{label}")
        print(f"  Query: {query!r}")
        print(f"  Expectation: {expectation}")
        print("-" * 80)

        q_vec = model.encode(query, normalize_embeddings=True)
        scores = vectors @ q_vec  # cosine since both normalized
        top_k = np.argsort(-scores)[:10]

        print(f"  {'rank':>4}  {'score':>6}  {'pid':>3}  {'type':<22}  {'layer':<12}  name")
        for rank, i in enumerate(top_k, start=1):
            pid_label = short_pid.get(str(project_ids[i]), "?")
            type_str = str(types[i])[:22]
            layer_str = str(layers[i])[:12]
            name_str = str(names[i])[:60]
            print(
                f"  {rank:>4}  {scores[i]:.4f}  {pid_label:>3}  {type_str:<22}  {layer_str:<12}  {name_str}"
            )
        # Score-distribution snapshot for negative-test analysis
        gap = scores[top_k[0]] - scores[top_k[9]]
        print(f"  [score-gap top1-top10: {gap:.4f}  — large gap = sharper signal]")
        print()

    print("=" * 80)
    print("[verdict] Score each query PASS/FAIL in findings.md per the README criteria.")
    print("           >=4 PASS = green-light. <=2 PASS = fall back to Pattern-Mining.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Element-similarity PoC")
    parser.add_argument("--build-index", action="store_true", help="embed elements + save")
    parser.add_argument("--query", action="store_true", help="run the 5 test-queries")
    args = parser.parse_args()

    if not (args.build_index or args.query):
        parser.print_help()
        sys.exit(1)

    if args.build_index:
        cmd_build_index()
    if args.query:
        cmd_query()


if __name__ == "__main__":
    main()
