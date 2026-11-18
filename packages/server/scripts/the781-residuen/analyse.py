"""THE-781 — Residuen-Check SCF gegen ENISA (Analyse, eingefroren vor dem Download).

Eingabe: JSON aus dem Parser
  {"meta": {...}, "points": [{"cir": "3.3", "scf": ["5.19", ...], "enisa": ["6.8"]}, ...]}
Aufruf:  python -I analyse.py <points.json> <out.json>

Vorregistrierung: docs/evals/2026-11-17-the781-residuen-vorregistrierung.md
Bootstrap = Auswertungs-Bootstrap über Zeilen (Scores bleiben auf den vollen Daten gerechnet, kein Neu-Fit).
"""
import json
import sys

import numpy as np

ISO = (
    [f"5.{i}" for i in range(1, 38)]
    + [f"6.{i}" for i in range(1, 9)]
    + [f"7.{i}" for i in range(1, 15)]
    + [f"8.{i}" for i in range(1, 35)]
)
COL = {c: i for i, c in enumerate(ISO)}
SEED = 20261117
K = 5
NN = 5
N_BOOT = 1000
N_PERM = 200
N_MASK = 20


def cir_key(s):
    return tuple(int(x) for x in s.split("."))


def load(path):
    d = json.load(open(path))
    pts = [p for p in d["points"] if p["scf"] and p["enisa"]]
    pts.sort(key=lambda p: cir_key(p["cir"]))
    return d.get("meta", {}), pts


def reproduction(pts):
    rec = [len(set(p["scf"]) & set(p["enisa"])) / len(set(p["enisa"])) for p in pts]
    full = sum(1 for r in rec if r == 1)
    none = sum(1 for r in rec if r == 0)
    return {"points": len(pts), "mean_recall": float(np.mean(rec)), "full": full,
            "partial": len(pts) - full - none, "none": none}


def build(pts):
    X = np.zeros((len(pts), len(ISO)))
    E = np.zeros_like(X)
    for i, p in enumerate(pts):
        for c in p["scf"]:
            X[i, COL[c]] = 1
        for c in p["enisa"]:
            E[i, COL[c]] = 1
    return X, E


def score_ca(X, k):
    """Rang-k-Rekonstruktion der Korrespondenzanalyse; k = 0 ist das Unabhängigkeitsmodell (B0)."""
    out = np.zeros_like(X)
    rows = X.sum(1) > 0
    cols = X.sum(0) > 0
    Xc = X[np.ix_(rows, cols)]
    P = Xc / Xc.sum()
    r = P.sum(1)
    c = P.sum(0)
    rc = np.outer(r, c)
    S = (P - rc) / np.sqrt(rc)
    U, s, Vt = np.linalg.svd(S, full_matrices=False)
    rank = int((s > 1e-10).sum())
    kk = min(k, rank)
    Sk = (U[:, :kk] * s[:kk]) @ Vt[:kk]
    out[np.ix_(rows, cols)] = rc + np.sqrt(rc) * Sk
    return out, kk, s


def score_b1(X, nn=NN):
    n = X.shape[0]
    out = np.zeros_like(X)
    inter = X @ X.T
    sz = X.sum(1)
    union = sz[:, None] + sz[None, :] - inter
    J = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)
    for i in range(n):
        order = sorted((j for j in range(n) if j != i), key=lambda j: (-J[i, j], j))
        out[i] = X[order[:nn]].mean(0)
    return out


def rankdata(a):
    a = np.round(np.asarray(a, dtype=float), 12)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a))
    sa = a[order]
    i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and sa[j + 1] == sa[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def auroc(scores, labels):
    labels = np.asarray(labels) == 1
    npos = labels.sum()
    nneg = (~labels).sum()
    if npos == 0 or nneg == 0:
        return float("nan")
    r = rankdata(scores)
    return float((r[labels].sum() - npos * (npos + 1) / 2) / (npos * nneg))


def pooled(score, X, E, rows=None):
    rows = np.arange(X.shape[0]) if rows is None else rows
    T = X[rows] == 0
    return auroc(score[rows][T], E[rows][T])


def macro(score, X, E, rows=None):
    rows = np.arange(X.shape[0]) if rows is None else rows
    vals = []
    for i in rows:
        t = X[i] == 0
        a = auroc(score[i][t], E[i][t])
        if not np.isnan(a):
            vals.append(a)
    return float(np.mean(vals)) if vals else float("nan")


def all_scores(X, k=K):
    m, kk, s = score_ca(X, k)
    b0, _, _ = score_ca(X, 0)
    b1 = score_b1(X)
    return {"M": m, "B0": b0, "B1": b1}, kk, s


def precision_at(score, X, E, n=20):
    T = np.argwhere(X == 0)
    vals = score[T[:, 0], T[:, 1]]
    top = T[np.argsort(-vals, kind="mergesort")[:n]]
    return float(E[top[:, 0], top[:, 1]].mean())


def main(inp, outp):
    meta, pts = load(inp)
    res = {"meta": meta, "reproduction": reproduction(pts)}
    X, E = build(pts)
    cir = [p["cir"] for p in pts]
    sc, kk, s = all_scores(X)
    res["k_used"] = kk
    res["singular_values"] = [float(v) for v in s[:12]]
    res["inertia_share_k"] = float((s[:kk] ** 2).sum() / (s ** 2).sum())
    res["targets"] = int((X == 0).sum())
    res["positives"] = int(((X == 0) & (E == 1)).sum())

    # Positivkontrolle 2 — Mechanik
    ones = np.argwhere(X == 1)
    pc2 = {"M": [], "B0": [], "B1": []}
    for i in range(N_MASK):
        rng = np.random.default_rng(SEED + i)
        hide = ones[rng.choice(len(ones), size=round(0.1 * len(ones)), replace=False)]
        Xm = X.copy()
        Xm[hide[:, 0], hide[:, 1]] = 0
        H = np.zeros_like(X)
        H[hide[:, 0], hide[:, 1]] = 1
        scm, _, _ = all_scores(Xm)
        for name in pc2:
            pc2[name].append(pooled(scm[name], Xm, H))
    res["pos_control_2"] = {n: float(np.mean(v)) for n, v in pc2.items()}
    res["pos_control_2"]["passed"] = res["pos_control_2"]["M"] > res["pos_control_2"]["B0"]

    # Negativkontrolle — zeilenweise Permutation
    rng = np.random.default_rng(SEED)
    perm = []
    for _ in range(N_PERM):
        Ep = E.copy()
        for i in range(X.shape[0]):
            t = np.where(X[i] == 0)[0]
            Ep[i, t] = rng.permutation(E[i, t])
        perm.append(pooled(sc["M"], X, Ep))
    lo, hi = np.percentile(perm, [2.5, 97.5])
    metric_name = "pooled" if lo <= 0.5 <= hi else "macro"
    metric = pooled if metric_name == "pooled" else macro
    res["neg_control"] = {"perm_mean": float(np.mean(perm)), "ci": [float(lo), float(hi)], "metric": metric_name}

    # Hauptlauf
    main_auc = {n: metric(sc[n], X, E) for n in sc}
    best = "B0" if main_auc["B0"] >= main_auc["B1"] else "B1"
    rng = np.random.default_rng(SEED)
    diffs, ms = [], []
    n = X.shape[0]
    for _ in range(N_BOOT):
        rows = rng.integers(0, n, n)
        a_m = metric(sc["M"], X, E, rows)
        a_b = metric(sc[best], X, E, rows)
        ms.append(a_m)
        diffs.append(a_m - a_b)
    res["main"] = {
        "auroc": main_auc, "best_baseline": best,
        "auroc_M_ci": [float(np.nanpercentile(ms, 2.5)), float(np.nanpercentile(ms, 97.5))],
        "diff_point": main_auc["M"] - main_auc[best],
        "diff_ci": [float(np.nanpercentile(diffs, 2.5)), float(np.nanpercentile(diffs, 97.5))],
        "precision_at_20": {nm: precision_at(sc[nm], X, E) for nm in sc},
        "pooled_auroc": {nm: pooled(sc[nm], X, E) for nm in sc},
        "macro_auroc": {nm: macro(sc[nm], X, E) for nm in sc},
    }

    # Ohne Zeile 3.3
    keep = [i for i, c in enumerate(cir) if c != "3.3"]
    X3, E3 = X[keep], E[keep]
    sc3, _, _ = all_scores(X3)
    a3 = {nm: metric(sc3[nm], X3, E3) for nm in sc3}
    res["without_3_3"] = {"auroc": a3, "diff_point": a3["M"] - max(a3["B0"], a3["B1"])}

    # Sensitivität k
    res["sensitivity_k"] = {str(kv): metric(score_ca(X, kv)[0], X, E) for kv in (3, 8)}

    # Urteil
    c1 = main_auc["M"] >= 0.70
    c2 = res["main"]["diff_ci"][0] > 0
    c3 = a3["M"] >= 0.70 and res["without_3_3"]["diff_point"] > 0
    if not res["pos_control_2"]["passed"]:
        verdict = "STOPP (Positivkontrolle 2 nicht bestanden, kein Urteil)"
    else:
        verdict = "TRÄGT" if (c1 and c2 and c3) else "KILL"
    res["criteria"] = {"auroc_M_ge_070": c1, "diff_lower_gt_0": c2, "without_3_3": c3}
    res["verdict"] = verdict

    # Gold-Ausgang: Top-10 von M, die ENISA nicht nennt
    T = np.argwhere((X == 0) & (E == 0))
    vals = sc["M"][T[:, 0], T[:, 1]]
    top = T[np.argsort(-vals, kind="mergesort")[:10]]
    res["gold_exit_top10"] = [
        {"cir": cir[i], "iso27002": ISO[j], "score_M": float(sc["M"][i, j]),
         "score_B0": float(sc["B0"][i, j]), "score_B1": float(sc["B1"][i, j])}
        for i, j in top
    ]

    json.dump(res, open(outp, "w"), indent=2, ensure_ascii=False)
    print(json.dumps({k: res[k] for k in ("reproduction", "k_used", "inertia_share_k", "targets", "positives",
                                           "pos_control_2", "neg_control", "main", "without_3_3",
                                           "sensitivity_k", "criteria", "verdict")}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
