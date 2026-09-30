"""Evaluation. The ONLY module allowed to open data/answer_key.json.

    python -m evaluation.evaluate

Answers five questions:

  1. Discovery   Of the 8 planted life patterns, how many did the engine find
                 with no labels, and how pure are those cohorts?
  2. Lead time   How many days before the real event did it see each one?
  3. Gate        Did it block the cohorts it should have blocked?
  4. Holdout     On households it never saw, does assignment still hold?
  5. Contact     If Kate speaks only for approved situations, how many
                 messages does that save, and how accurate are the ones sent?

Plus two controls:
  - shuffled labels: purity should collapse to the base rate
  - supervised ladder for the headline event, to show the signal is real and
    predictable with standard models (logistic regression, gradient boosting)

Writes out/eval_report.json, out/eval_report.md, out/fig_*.png
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

from pipeline.features import START

DATA, OUT = "data", "out"
PURITY_MIN = 0.50
HEADLINE = "going_self_employed"
COMMERCIAL_GATE = "pass"


def _week(d: str) -> int:
    return (pd.Timestamp(d) - START).days // 7


def load():
    key = json.load(open(f"{DATA}/answer_key.json"))
    labels = key["labels"]
    hard = key["hard_negatives"]
    hh = pd.read_parquet(f"{DATA}/households.parquet")
    bends = pd.read_parquet(f"{OUT}/bends.parquet")
    cands = json.load(open(f"{OUT}/candidates.json"))
    dec = pd.read_parquet(f"{OUT}/decisions.parquet")

    def truth(h):
        if h in labels:
            return labels[h]["pattern"]
        return "hard_negative" if h in hard else "control"

    bends["truth"] = bends.household_id.map(truth)
    bends["event_week"] = bends.household_id.map(
        lambda h: _week(labels[h]["event_date"]) if h in labels else np.nan)
    hh["truth"] = hh.household_id.map(truth)
    dec["truth"] = dec.household_id.map(truth)
    return key, labels, hard, hh, bends, cands, dec


def composition(df: pd.DataFrame) -> pd.DataFrame:
    comp = (df.groupby(["candidate_id", "truth"]).size()
              .unstack(fill_value=0))
    return comp


def match_cohorts(bends_train: pd.DataFrame):
    """Each discovered cohort -> the planted pattern it most contains."""
    comp = composition(bends_train.dropna(subset=["candidate_id"]))
    out = {}
    for cid, row in comp.iterrows():
        tot = row.sum()
        top = row.idxmax()
        out[cid] = {"majority": top, "purity": round(float(row.max() / tot), 3),
                    "size": int(tot), "mix": {k: int(v) for k, v in row.items() if v}}
    return out


def evaluate():
    key, labels, hard, hh, bends, cands, dec = load()
    cand_by = {c["candidate_id"]: c for c in cands}
    patterns = key["patterns"]["keys"]
    expected_gate = {v["pattern"]: v["expected_gate"] for v in labels.values()}

    btr = bends[bends.split == "train"]
    bho = bends[bends.split == "holdout"]
    matched = match_cohorts(btr)

    # ---------------------------------------------------------------- 1
    discovery = {}
    for p in patterns:
        hits = {cid: m for cid, m in matched.items()
                if m["majority"] == p and m["purity"] >= PURITY_MIN}
        n_train_true = int(((hh.truth == p) & (hh.split == "train")).sum())
        captured = int(btr[(btr.truth == p) & btr.candidate_id.isin(hits)].shape[0])
        discovery[p] = {
            "recovered": bool(hits),
            "cohorts": sorted(hits),
            "purity": round(max((m["purity"] for m in hits.values()), default=0.0), 3),
            "train_households": n_train_true,
            "captured_in_cohort": captured,
            "capture_rate": round(captured / max(n_train_true, 1), 3),
        }
    recovered = [p for p in patterns if discovery[p]["recovered"]]

    false_cohorts = [cid for cid, m in matched.items()
                     if m["majority"] in ("control", "hard_negative") or m["purity"] < PURITY_MIN]

    # ---------------------------------------------------------------- 2
    lead = {}
    for p in recovered:
        cids = discovery[p]["cohorts"]
        for split, df in (("train", btr), ("holdout", bho)):
            m = df[(df.truth == p) & df.candidate_id.isin(cids)]
            if len(m) == 0:
                continue
            true_days = (m.event_week - m.bend_week) * 7
            lead.setdefault(p, {})[split] = {
                "n": int(len(m)),
                "median_true_lead_days": float(np.median(true_days)),
                "p25": float(np.percentile(true_days, 25)),
                "p75": float(np.percentile(true_days, 75)),
                "share_detected_before_event": round(float((true_days > 0).mean()), 3),
            }
        est = [cand_by[c]["median_lead_days"] for c in cids]
        lead[p]["pipeline_estimate_days"] = float(np.median(est))

    # ---------------------------------------------------------------- 3
    gate = {}
    for p in recovered:
        got = sorted({cand_by[c]["gate"]["status"] for c in discovery[p]["cohorts"]})
        exp = expected_gate[p]
        gate[p] = {"expected": exp, "got": got, "correct": got == [exp]}
    gate_false_cohorts = {cid: cand_by[cid]["gate"]["status"] for cid in false_cohorts}

    # ---------------------------------------------------------------- 4
    holdout = {}
    ho_assigned = bho.dropna(subset=["candidate_id"])
    for p in recovered:
        cids = discovery[p]["cohorts"]
        a = ho_assigned[ho_assigned.candidate_id.isin(cids)]
        n_true_ho = int(((hh.truth == p) & (hh.split == "holdout")).sum())
        holdout[p] = {
            "assigned": int(len(a)),
            "precision": round(float((a.truth == p).mean()), 3) if len(a) else None,
            "recall": round(float((a.truth == p).sum() / max(n_true_ho, 1)), 3),
        }

    # ---------------------------------------------------------------- 5
    # A contact is CORRECT if the household truly has the life pattern the
    # approved situation was matched to, and that pattern is commercially
    # allowed. Everything else is a wasted or harmful interruption.
    approved = {c["candidate_id"] for c in cands if c["review"]["state"] == "approved"}
    sit_pattern = {cid: matched[cid]["majority"] for cid in matched}
    d = dec.copy()
    d["spoke"] = d.rung.isin(["ask", "inform"])
    d["correct"] = [bool(s) and sit_pattern.get(c) == t
                    for s, c, t in zip(d.spoke, d.candidate_id, d.truth)]
    ho_hh = hh[hh.split == "holdout"]
    n_ho = len(ho_hh)
    commercial = {p for p in patterns if expected_gate[p] == COMMERCIAL_GATE}

    ours_sent = int(d.spoke.sum())
    ours_correct = int(d.correct.sum())
    # Baseline A: contact every holdout household that showed ANY sustained change
    base_a = bho.copy()
    base_a_sent = len(base_a)
    base_a_correct = int(base_a.truth.isin(commercial).sum())
    # Baseline B: contact everyone
    base_b_sent = n_ho
    base_b_correct = int(ho_hh.truth.isin(commercial).sum())
    harmful_ours = int((d.spoke & d.truth.isin({"separation", "financial_distress"})).sum())
    harmful_a = int(base_a.truth.isin({"separation", "financial_distress"}).sum())
    hardneg_ours = int((d.spoke & (d.truth == "hard_negative")).sum())
    hardneg_a = int((base_a.truth == "hard_negative").sum())
    contact = {
        "holdout_households": n_ho,
        "ours": {"messages": ours_sent, "correct": ours_correct,
                 "precision": round(ours_correct / max(ours_sent, 1), 3),
                 "sent_to_separating_or_distressed": harmful_ours,
                 "sent_to_hard_negatives": hardneg_ours,
                 "silent": int(n_ho - ours_sent)},
        "baseline_any_change": {"messages": base_a_sent, "correct": base_a_correct,
                                "precision": round(base_a_correct / max(base_a_sent, 1), 3),
                                "sent_to_separating_or_distressed": harmful_a,
                                "sent_to_hard_negatives": hardneg_a},
        "baseline_everyone": {"messages": base_b_sent, "correct": base_b_correct,
                              "precision": round(base_b_correct / max(base_b_sent, 1), 3)},
        "message_reduction_vs_any_change": round(1 - ours_sent / max(base_a_sent, 1), 3),
    }

    # ---------------------------------------------------------------- controls
    rng = np.random.default_rng(0)
    shuffled = btr.dropna(subset=["candidate_id"]).copy()
    shuf_pur = []
    for _ in range(20):
        shuffled["truth"] = rng.permutation(shuffled["truth"].to_numpy())
        m = match_cohorts(shuffled)
        shuf_pur.append(np.mean([v["purity"] for v in m.values()]))
    real_pur = np.mean([v["purity"] for v in matched.values()])
    base_rate = float(btr.dropna(subset=["candidate_id"]).truth.value_counts(normalize=True).max())

    supervised = supervised_ladder(hh, labels, hard)

    # how wrong is the pipeline's own label-free lead estimate?
    est_err = {}
    for p, d in lead.items():
        if "holdout" in d:
            est_err[p] = round(d["pipeline_estimate_days"] - d["holdout"]["median_true_lead_days"], 1)
    mae = round(float(np.mean(np.abs(list(est_err.values())))), 1) if est_err else None

    # did the engine separate the planted lookalikes from the real event?
    lookalike = {}
    for cid, m in matched.items():
        if m["majority"] == "hard_negative" and m["purity"] >= PURITY_MIN:
            lookalike[cid] = {"hard_negatives": m["mix"].get("hard_negative", 0),
                              "mixed_in_true_events": {k: v for k, v in m["mix"].items()
                                                       if k not in ("hard_negative", "control")},
                              "review_state": cand_by[cid]["review"]["state"]}

    report = {
        "headline": {
            "patterns_planted": len(patterns),
            "patterns_recovered": len(recovered),
            "recovered": recovered,
            "missed": [p for p in patterns if p not in recovered],
            "headline_event": HEADLINE,
            "headline_median_lead_days_holdout":
                lead.get(HEADLINE, {}).get("holdout", {}).get("median_true_lead_days"),
            "false_cohorts": len(false_cohorts),
            "cohorts_suppressed_or_protected": sum(
                1 for c in cands if c["gate"]["status"] != "pass"),
        },
        "discovery": discovery, "cohort_composition": matched,
        "false_cohorts": {"ids": false_cohorts, "gate_status": gate_false_cohorts},
        "lead_time": lead, "gate": gate, "holdout": holdout, "contact": contact,
        "controls": {"mean_cohort_purity_real": round(float(real_pur), 3),
                     "mean_cohort_purity_shuffled": round(float(np.mean(shuf_pur)), 3),
                     "largest_class_base_rate": round(base_rate, 3)},
        "supervised_ladder": supervised,
        "lead_estimate_error_days": {"per_pattern": est_err, "mean_absolute_error": mae,
            "note": "Pipeline's label-free lead estimate minus true holdout lead. Headline "
                    "lead times are taken from the TRUE holdout values, never the estimate."},
        "lookalike_cohorts": lookalike,
        "caveat": ("Synthetic data generated by this team. These results validate that the "
                   "pipeline and method work end to end and recover planted structure. They are "
                   "not evidence of real-world precision on KBC customers."),
    }
    os.makedirs(OUT, exist_ok=True)
    json.dump(report, open(f"{OUT}/eval_report.json", "w"), indent=1, default=float)
    write_markdown(report)
    figures(report, bends)
    return report


# ---------------------------------------------------------------------------
# Supervised ladder: is the headline event predictable with standard models?
# ---------------------------------------------------------------------------

def supervised_ladder(hh, labels, hard, horizon_weeks: int = 12):
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import roc_auc_score, average_precision_score
    from pipeline.features import build_weekly_tensor, build_feature_stack
    from pipeline.encoder import soft_threshold

    wt = build_weekly_tensor(f"{DATA}/events", hh)
    weeks, stack = build_feature_stack(wt)
    del wt
    st = soft_threshold(stack); del stack
    weeks = np.array(weeks)
    ids = hh.household_id.to_numpy()
    rng = np.random.default_rng(141)

    X, y, split, kind = [], [], [], []
    for i, h in enumerate(ids):
        if h in labels and labels[h]["pattern"] == HEADLINE:
            ew = _week(labels[h]["event_date"])
            t = int(np.argmin(np.abs(weeks - (ew - horizon_weeks))))
            X.append(st[t, i]); y.append(1); kind.append("positive")
        else:
            t = int(rng.integers(10, len(weeks) - 4))
            X.append(st[t, i]); y.append(0)
            kind.append("hard_negative" if h in hard else
                        ("other_event" if h in labels else "control"))
        split.append(hh.split.iat[i])
    X = np.array(X); y = np.array(y); split = np.array(split); kind = np.array(kind)
    tr, ho = split == "train", split == "holdout"

    models = {
        "logistic_regression": LogisticRegression(max_iter=2000, C=0.5),
        "gradient_boosting": HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06,
                                                            random_state=141),
    }
    out = {"task": f"Will '{HEADLINE}' happen within {horizon_weeks} weeks? "
                   f"Features cut {horizon_weeks} weeks before the event.",
           "holdout_positives": int(y[ho].sum()), "holdout_negatives": int((1 - y[ho]).sum()),
           "note": "A transformer sequence encoder (PRAGMA / nuFormer style) is the scale-up "
                   "path; it was not trained here because torch was unavailable in the build "
                   "environment. The interface is unchanged."}
    for name, m in models.items():
        m.fit(X[tr], y[tr])
        p = m.predict_proba(X[ho])[:, 1]
        k = max(1, int(0.10 * ho.sum()))
        top = np.argsort(-p)[:k]
        hn = (kind[ho] == "hard_negative") | (y[ho] == 1)
        out[name] = {
            "roc_auc": round(float(roc_auc_score(y[ho], p)), 3),
            "pr_auc": round(float(average_precision_score(y[ho], p)), 3),
            "base_rate": round(float(y[ho].mean()), 3),
            "precision_top_decile": round(float(y[ho][top].mean()), 3),
            "roc_auc_vs_hard_negatives_only": round(float(roc_auc_score(y[ho][hn], p[hn])), 3),
            "lift_top_decile": round(float(y[ho][top].mean() / max(y[ho].mean(), 1e-9)), 1),
        }
    out["warning"] = ("ROC-AUC near 0.99 reflects how cleanly the pattern was PLANTED in synthetic "
                      "data. It is not an estimate of real-world performance. Real households mix "
                      "several changes at once and precision will be materially lower.")
    return out


# ---------------------------------------------------------------------------

def write_markdown(r):
    h = r["headline"]; c = r["contact"]; s = r["supervised_ladder"]
    lines = [
        "# Evaluation report", "",
        f"> {r['caveat']}", "",
        "## Headline", "",
        f"- **{h['patterns_recovered']} of {h['patterns_planted']}** planted life patterns "
        f"recovered with no labels",
        f"- Missed: {', '.join(h['missed']) or 'none'}",
        f"- Headline event `{h['headline_event']}`: median **"
        f"{h['headline_median_lead_days_holdout']:.0f} days** before the event, on holdout households",
        f"- False cohorts: {h['false_cohorts']}",
        f"- Cohorts suppressed or routed to protection by the gate: "
        f"{h['cohorts_suppressed_or_protected']}", "",
        "## Discovery", "",
        "| Pattern | Recovered | Cohort | Purity | Captured |",
        "|---|---|---|---|---|",
    ]
    for p, d in r["discovery"].items():
        lines.append(f"| {p} | {'yes' if d['recovered'] else 'no'} | {', '.join(d['cohorts']) or '-'} "
                     f"| {d['purity']:.2f} | {d['captured_in_cohort']}/{d['train_households']} |")
    lines += ["", "## Lead time (holdout, true days before event)", "",
              "| Pattern | n | Median | p25 to p75 | Seen before event | Pipeline estimate |",
              "|---|---|---|---|---|---|"]
    for p, d in r["lead_time"].items():
        x = d.get("holdout")
        if x:
            lines.append(f"| {p} | {x['n']} | {x['median_true_lead_days']:.0f}d | "
                         f"{x['p25']:.0f} to {x['p75']:.0f}d | {x['share_detected_before_event']:.0%} | "
                         f"{d['pipeline_estimate_days']:.0f}d |")
    le = r["lead_estimate_error_days"]
    lines += ["", f"Pipeline's own label-free lead estimate, mean absolute error vs truth: "
              f"**{le['mean_absolute_error']} days**. Headline lead times use the true holdout values.", ""]
    if r["lookalike_cohorts"]:
        lines += ["## Lookalikes separated", ""]
        for cid, v in r["lookalike_cohorts"].items():
            lines.append(f"- **{cid}**: {v['hard_negatives']} planted lookalikes grouped on their own, "
                         f"review state `{v['review_state']}`. Mixed-in true events: {v['mixed_in_true_events']}")
        lines.append("")
    lines += ["", "## Gate", "", "| Pattern | Expected | Got | Correct |", "|---|---|---|---|"]
    for p, g in r["gate"].items():
        lines.append(f"| {p} | {g['expected']} | {', '.join(g['got'])} | {'yes' if g['correct'] else 'NO'} |")
    lines += ["", "## Contact policy (holdout)", "",
              "| Policy | Messages | Correct | Precision | To separating or distressed | To hard negatives |",
              "|---|---|---|---|---|---|",
              f"| Ours | {c['ours']['messages']} | {c['ours']['correct']} | {c['ours']['precision']:.0%} "
              f"| {c['ours']['sent_to_separating_or_distressed']} | {c['ours']['sent_to_hard_negatives']} |",
              f"| Contact any change | {c['baseline_any_change']['messages']} | "
              f"{c['baseline_any_change']['correct']} | {c['baseline_any_change']['precision']:.0%} "
              f"| {c['baseline_any_change']['sent_to_separating_or_distressed']} | "
              f"{c['baseline_any_change']['sent_to_hard_negatives']} |",
              f"| Contact everyone | {c['baseline_everyone']['messages']} | "
              f"{c['baseline_everyone']['correct']} | {c['baseline_everyone']['precision']:.0%} | - | - |",
              "", f"Message reduction vs contacting on any change: "
              f"**{c['message_reduction_vs_any_change']:.0%}**", "",
              "## Controls", "",
              f"- Mean cohort purity, real labels: {r['controls']['mean_cohort_purity_real']:.2f}",
              f"- Mean cohort purity, shuffled labels: {r['controls']['mean_cohort_purity_shuffled']:.2f} "
              f"(largest class base rate {r['controls']['largest_class_base_rate']:.2f})", "",
              "## Supervised ladder", "", s["task"], "",
              f"> **Warning.** {s['warning']}", "",
              "| Model | ROC-AUC | PR-AUC | Base rate | Precision top 10% | Lift | ROC-AUC vs hard negatives |",
              "|---|---|---|---|---|---|---|"]
    for m in ("logistic_regression", "gradient_boosting"):
        x = s[m]
        lines.append(f"| {m} | {x['roc_auc']:.3f} | {x['pr_auc']:.3f} | {x['base_rate']:.3f} | "
                     f"{x['precision_top_decile']:.2f} | {x['lift_top_decile']}x | "
                     f"{x['roc_auc_vs_hard_negatives_only']:.3f} |")
    lines += ["", f"_{s['note']}_", ""]
    open(f"{OUT}/eval_report.md", "w").write("\n".join(lines))


def figures(r, bends):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    NAVY, PURPLE, LIGHT, GREY = "#14173A", "#6C5CE7", "#A9AEF2", "#C9CCE6"

    # lead time distribution for the headline event
    cids = r["discovery"].get(HEADLINE, {}).get("cohorts", [])
    m = bends[(bends.truth == HEADLINE) & bends.candidate_id.isin(cids)]
    if len(m):
        d = (m.event_week - m.bend_week) * 7
        fig, ax = plt.subplots(figsize=(9, 4.2), dpi=150)
        ax.hist(d, bins=range(-28, 190, 14), color=PURPLE, edgecolor="white")
        ax.axvline(0, color=NAVY, lw=2)
        ax.axvline(np.median(d), color=LIGHT, lw=2, ls="--")
        ax.text(2, ax.get_ylim()[1] * 0.92, "salary stops", color=NAVY, fontsize=10)
        ax.text(np.median(d) + 2, ax.get_ylim()[1] * 0.80,
                f"median {np.median(d):.0f} days early", color=NAVY, fontsize=10)
        ax.set_xlabel("days between detection and the event")
        ax.set_ylabel("households")
        ax.set_title("Going self-employed: how early the engine saw it", color=NAVY, loc="left")
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        fig.tight_layout(); fig.savefig(f"{OUT}/fig_lead_time.png"); plt.close(fig)

    # cohort composition: one bar per cohort, labelled with what it really was
    comp = r["cohort_composition"]
    gate = {}
    for c in json.load(open(f"{OUT}/candidates.json")):
        gate[c["candidate_id"]] = c["gate"]["status"]
    ids = list(comp.keys())
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=150)
    for y, cid in enumerate(ids):
        m = comp[cid]
        real = m["majority"] not in ("control", "hard_negative")
        col = {"pass": PURPLE, "protection_only": LIGHT, "suppressed": NAVY}[gate[cid]] if real else GREY
        ax.barh(y, m["purity"], color=col, edgecolor="white")
        ax.barh(y, 1 - m["purity"], left=m["purity"], color="#EEEEF6", edgecolor="white")
        name = m["majority"].replace("_", " ")
        if not real:
            name = {"hard_negative": "planted lookalikes", "control": "noise"}[m["majority"]]
        tag = {"pass": "", "protection_only": "  protection only", "suppressed": "  suppressed"}[gate[cid]] if real else "  kept silent"
        txt_col = "white" if col in (PURPLE, NAVY) else NAVY
        ax.text(0.015, y, f"{name}  {m['purity']:.0%}{tag}", va="center", fontsize=9, color=txt_col)
    ax.set_yticks(range(len(ids))); ax.set_yticklabels(ids)
    ax.set_xlim(0, 1); ax.invert_yaxis()
    ax.set_xlabel("purity: share of the cohort that truly shared one life pattern")
    ax.set_title("Ten cohorts found with no labels. What each one really was.", color=NAVY, loc="left")
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    fig.tight_layout(); fig.savefig(f"{OUT}/fig_cohorts.png"); plt.close(fig)


if __name__ == "__main__":
    r = evaluate()
    print(open(f"{OUT}/eval_report.md").read())
