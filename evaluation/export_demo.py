"""Export a handful of HOLDOUT households for the console's timeline view.

    python -m evaluation.export_demo

The console plays each household forward week by week: its departure score
rises, the flag fires when the sustained-bend rule trips, and then the true
event date is revealed from the sealed answer key. Because this reveal uses
the answer key, this script lives in evaluation/, not in pipeline/.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from pipeline.features import build_weekly_tensor, build_feature_stack, week_to_date, feature_names
from pipeline.encoder import soft_threshold, bend_scores

DATA, OUT = "data", "out"

PICK = [
    ("going_self_employed", 3, "The headline: registration payments while the salary still arrives"),
    ("hard_negative", 1, "A lookalike: side income while still employed. Grouped apart, kept silent"),
    ("financial_distress", 1, "Found, and blocked by the gate. Kate says nothing commercial"),
    ("control", 1, "An ordinary household. Nothing changes, so nothing is said"),
]


def main():
    key = json.load(open(f"{DATA}/answer_key.json"))
    labels, hard = key["labels"], key["hard_negatives"]
    hh = pd.read_parquet(f"{DATA}/households.parquet")
    bends = pd.read_parquet(f"{OUT}/bends.parquet").set_index("household_id")
    dec = pd.read_parquet(f"{OUT}/decisions.parquet").set_index("household_id")
    meta = json.load(open(f"{OUT}/run_meta.json"))
    names = feature_names()

    wt = build_weekly_tensor(f"{DATA}/events", hh)
    weeks, stack = build_feature_stack(wt); del wt
    st = soft_threshold(stack); del stack
    sc = bend_scores(st)
    weeks = np.array(weeks)
    idx = {h: i for i, h in enumerate(hh.household_id)}

    def truth(h):
        if h in labels:
            return labels[h]["pattern"]
        return "hard_negative" if h in hard else "control"

    ho = hh[hh.split == "holdout"].copy()
    ho["truth"] = ho.household_id.map(truth)
    rng = np.random.default_rng(3)

    demo = []
    for kind, n, caption in PICK:
        pool = ho[ho.truth == kind].household_id.tolist()
        if kind == "going_self_employed":
            pool = [h for h in pool if h in bends.index and bends.at[h, "candidate_id"] == "S141"]
        elif kind == "hard_negative":
            pool = [h for h in pool if hard.get(h) == "side_income" and h in bends.index]
        elif kind == "financial_distress":
            pool = [h for h in pool if h in bends.index and pd.notna(bends.at[h, "candidate_id"])]
        elif kind == "control":
            pool = [h for h in pool if h not in bends.index]
        for h in rng.permutation(pool)[:n]:
            i = idx[h]
            b = bends.loc[h] if h in bends.index else None
            top = []
            if b is not None:
                t = int(np.flatnonzero(weeks == b.bend_week)[0])
                v = 0.5 * (st[t, i] + st[t - 1, i])
                for j in np.argsort(-np.abs(v))[:5]:
                    if abs(v[j]) > 0.05:
                        top.append({"feature": names[j], "weight": round(float(v[j]), 2)})
            ev = labels.get(h, {}).get("event_date")
            demo.append({
                "household_id": h,
                "archetype": hh.archetype.iat[i],
                "caption": caption,
                "truth": kind,
                "weeks": [week_to_date(int(w)).isoformat() for w in weeks],
                "score": np.round(sc[:, i], 2).tolist(),
                "threshold": meta["threshold"],
                "bend_date": None if b is None else b.bend_date,
                "candidate_id": None if b is None or pd.isna(b.candidate_id) else b.candidate_id,
                "decision": dec.at[h, "rung"] if h in dec.index else "silent",
                "decision_reason": dec.at[h, "reason"] if h in dec.index else "",
                "signature": top,
                "true_event_date": ev,
            })
    json.dump(demo, open(f"{OUT}/demo_households.json", "w"), indent=1)
    print(f"exported {len(demo)} holdout households")
    for d in demo:
        print(f"  {d['household_id']} {d['truth']:22s} bend={d['bend_date']} event={d['true_event_date']} "
              f"decision={d['decision']}")


if __name__ == "__main__":
    main()
