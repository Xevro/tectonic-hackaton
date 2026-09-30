"""Run the full discovery pipeline. Label-free end to end.

    python -m pipeline.run

Reads   data/households.parquet, data/events/
Never   data/answer_key.json
Writes  out/candidates.json    what the console shows a reviewer
        out/cohorts.json       cohort internals (members, signature, stability)
        out/bends.parquet      one row per household with a sustained bend
        out/decisions.parquet  one row per holdout household: speak or stay silent
        out/trajectories.json  2D embedding paths for the console visual
        out/run_meta.json      thresholds, sizes, timings
"""

from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

from pipeline.features import build_weekly_tensor, build_feature_stack, week_to_date
from pipeline.encoder import (soft_threshold, fit_encoder, bend_scores, fit_threshold,
                              detect_bends, structural_scores, THRESHOLD_Q, STRUCT_Q, EMBED_DIM)
from pipeline.discover import discover, assign

DATA = "data"
OUT = "out"
APPROVE_FRACTION = 0.40   # a cohort is auto-marked for review if rank >= 40% of the best


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)

    hh = pd.read_parquet(f"{DATA}/households.parquet")
    wt = build_weekly_tensor(f"{DATA}/events", hh)
    weeks, stack = build_feature_stack(wt)
    weeks = np.array(weeks)
    del wt
    print(f"[1] features      {stack.shape}  {time.time()-t0:.0f}s")

    st = soft_threshold(stack); del stack
    train = (hh["split"] == "train").to_numpy()
    enc = fit_encoder(st, train)
    scores = bend_scores(st)
    thr = fit_threshold(scores, train)
    print(f"[2] encoder       PCA-{EMBED_DIM}, explained {enc.pca.explained_variance_ratio_.sum():.2f}; "
          f"threshold q{THRESHOLD_Q} = {thr:.2f}")

    struct = structural_scores(st)
    s_thr = float(np.quantile(struct[:, train], STRUCT_Q))
    bends = detect_bends(st, scores, weeks, thr, struct, s_thr)
    emb_sig = enc.encode(bends.signature)
    is_train = train[bends.h_idx]
    print(f"[3] bends         {len(bends.h_idx):,} households bent "
          f"({len(bends.h_idx)/len(hh):.1%}); train {is_train.sum():,} / holdout {(~is_train).sum():,}")

    # --- discovery on TRAIN bends only ---------------------------------
    tr = np.flatnonzero(is_train)
    cohorts, labels_tr, u_tr = discover(emb_sig[tr], bends.signature[tr],
                                        bends.week[tr], bends.peak_week[tr])
    print(f"[4] discovery     {len(cohorts)} cohorts, {int((labels_tr==-1).sum())} train bends left as noise")

    # --- assign HOLDOUT bends to discovered cohorts --------------------
    ho = np.flatnonzero(~is_train)
    u_ho = emb_sig[ho] / (np.linalg.norm(emb_sig[ho], axis=1, keepdims=True) + 1e-9)
    ho_assign = assign(u_ho, cohorts, u_tr, labels_tr)

    # --- review state: silence falls out of the ranking ------------------
    best = max((c.rank_score for c in cohorts), default=0.0)
    for c in cohorts:
        if c.gate_status != "pass":
            c.review = "blocked"
        elif c.rank_score >= APPROVE_FRACTION * best and best > 0:
            c.review = "approved"
        else:
            c.review = "pending"

    # --- write candidates (contract: CandidateSituation) -----------------
    candidates = []
    for i, c in enumerate(cohorts):
        candidates.append({
            "candidate_id": f"S{141 + i}",
            "cohort_id": c.cohort_id,
            "title": c.title,
            "description": c.description,
            "size": int(len(c.members)),
            "median_lead_days": round(c.median_lead_days, 1),
            "coverage": c.coverage,
            "rank_score": c.rank_score,
            "stability": c.stability,
            "top_features": c.top_features,
            "gate": {"status": c.gate_status, "reason": c.gate_reason},
            "review": {"state": c.review, "reviewer": None, "decided_at": None},
        })
    json.dump(candidates, open(f"{OUT}/candidates.json", "w"), indent=1)

    # --- bends table ----------------------------------------------------
    cohort_of = np.full(len(bends.h_idx), -1)
    cohort_of[tr] = labels_tr
    # map raw HDBSCAN labels to position in the ranked cohort list
    raw_to_pos = {int(c.cohort_id[1:]): p for p, c in enumerate(cohorts)}
    cohort_pos = np.array([raw_to_pos.get(int(x), -1) if x >= 0 else -1 for x in cohort_of])
    cohort_pos[ho] = ho_assign
    b = pd.DataFrame({
        "household_id": hh["household_id"].to_numpy()[bends.h_idx],
        "split": np.where(is_train, "train", "holdout"),
        "bend_week": bends.week,
        "bend_date": [week_to_date(int(w)).isoformat() for w in bends.week],
        "peak_week": bends.peak_week,
        "score": np.round(bends.score, 3),
        "cohort": [cohorts[p].cohort_id if p >= 0 else None for p in cohort_pos],
        "candidate_id": [f"S{141+p}" if p >= 0 else None for p in cohort_pos],
    })
    b.to_parquet(f"{OUT}/bends.parquet", index=False)

    # --- decisions for every HOLDOUT household (contract: Decision) ------
    # silence is logged exactly like speech
    bh = b[b.split == "holdout"].set_index("household_id")
    rows = []
    for hid in hh.loc[hh.split == "holdout", "household_id"]:
        if hid not in bh.index or pd.isna(bh.at[hid, "candidate_id"]):
            rows.append((hid, None, None, "silent", 0.0, "no sustained departure from own normal"
                         if hid not in bh.index else "bend did not match an approved situation"))
            continue
        cid = bh.at[hid, "candidate_id"]
        c = cohorts[int(cid[1:]) - 141]
        date_ = bh.at[hid, "bend_date"]
        if c.review == "blocked":
            rung = "prepare" if c.gate_status == "protection_only" else "silent"
            reason = f"gate: {c.gate_status} ({c.gate_reason})"
        elif c.review == "approved":
            rung = "ask" if c.coverage == "no_existing_rule" else "prepare"
            reason = "approved situation, sustained bend"
        else:
            rung, reason = "silent", "situation below review cutoff"
        rows.append((hid, date_, cid, rung, float(bh.at[hid, "score"]), reason))
    dec = pd.DataFrame(rows, columns=["household_id", "decision_date", "candidate_id",
                                      "rung", "score", "reason"])
    dec["threshold"] = round(thr, 3)
    dec.to_parquet(f"{OUT}/decisions.parquet", index=False)

    # --- trajectories for the console visual (400 sampled households) ---
    rng = np.random.default_rng(7)
    sample = rng.choice(len(hh), 400, replace=False)
    emb_t = enc.encode(st[:, sample, :])            # [T, 400, D]
    from sklearn.decomposition import PCA
    p2 = PCA(2, random_state=7).fit(emb_t.reshape(-1, EMBED_DIM))
    xy = p2.transform(emb_t.reshape(-1, EMBED_DIM)).reshape(len(weeks), len(sample), 2)
    bent = set(b.household_id)
    traj = [{"household_id": hh.household_id.iat[i],
             "bent": hh.household_id.iat[i] in bent,
             "path": np.round(xy[:, k, :], 3).tolist()} for k, i in enumerate(sample)]
    json.dump({"weeks": weeks.tolist(), "households": traj}, open(f"{OUT}/trajectories.json", "w"))

    meta = {
        "n_households": int(len(hh)), "n_eval_points": int(len(weeks)),
        "embed_dim": EMBED_DIM, "threshold_quantile": THRESHOLD_Q, "threshold": round(thr, 3),
        "n_bends": int(len(bends.h_idx)), "n_cohorts": len(cohorts),
        "holdout_households": int((hh.split == "holdout").sum()),
        "holdout_messaged": int((dec.rung.isin(["ask", "inform"])).sum()),
        "holdout_prepared_quietly": int((dec.rung == "prepare").sum()),
        "holdout_silent": int((dec.rung == "silent").sum()),
        "seconds": round(time.time() - t0, 1),
    }
    json.dump(meta, open(f"{OUT}/run_meta.json", "w"), indent=1)

    print(f"[5] review        " + ", ".join(f"{c.cohort_id}:{c.review}" for c in cohorts))
    print(f"[6] decisions     holdout {meta['holdout_households']:,}: messaged "
          f"{meta['holdout_messaged']:,}, prepared quietly {meta['holdout_prepared_quietly']:,}, "
          f"silent {meta['holdout_silent']:,}")
    print(f"done in {meta['seconds']}s\n")
    for i, c in enumerate(candidates):
        print(f"  {c['candidate_id']}  rank={c['rank_score']:<6} size={c['size']:<4} "
              f"lead={c['median_lead_days']:>5}d stab={c['stability']:<5} "
              f"{c['coverage']:16s} gate={c['gate']['status']:15s} {c['title']}")


if __name__ == "__main__":
    main()
