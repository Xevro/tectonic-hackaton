"""Feature layer.

Two rules this module enforces, and nothing else in the pipeline may bypass:

1. THE CUT. Every feature at evaluation week t is computed from weeks strictly
   before t. There is exactly one function that slices time: `window_sums`.
   If you need history, you go through it.

2. SELF-RELATIVE. Every feature compares a household to its OWN past, never to
   the population. A family of five and a single starter are not comparable, so
   we never compare them. The question is always: how far has this household
   moved away from its own normal?

Storage is a weekly tensor [household, week, category] built once from the
event parts, so a 16M event dataset fits in memory.
"""

from __future__ import annotations

import glob
import os
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from generator.vocabulary import VOCAB, VOCAB_INDEX

START = pd.Timestamp("2024-01-01")
N_WEEKS = 104

RECENT_WEEKS = 8          # the window we look at
BASELINE_WEEKS = 44       # the household's own normal, ending before RECENT
MIN_BASELINE = 16         # never score a household with less own history than this
EVAL_EVERY = 2            # score every 2 weeks


@dataclass
class WeeklyTensor:
    household_ids: np.ndarray        # [H]
    counts: np.ndarray               # [H, W, C] float32
    log_amount: np.ndarray           # [H, W, C] float32, sum of log1p(amount)
    categories: list

    @property
    def shape(self):
        return self.counts.shape


def build_weekly_tensor(events_dir: str, households: pd.DataFrame) -> WeeklyTensor:
    ids = households["household_id"].to_numpy()
    idx = {h: i for i, h in enumerate(ids)}
    H, W, C = len(ids), N_WEEKS, len(VOCAB)
    counts = np.zeros((H, W, C), dtype=np.float32)
    logamt = np.zeros((H, W, C), dtype=np.float32)

    for part in sorted(glob.glob(os.path.join(events_dir, "part-*.parquet"))):
        df = pd.read_parquet(part, columns=["household_id", "date", "category", "amount"])
        h = df["household_id"].map(idx).to_numpy()
        w = ((df["date"] - START).dt.days // 7).clip(0, W - 1).to_numpy()
        c = df["category"].astype(str).map(VOCAB_INDEX).to_numpy()
        a = np.log1p(df["amount"].to_numpy(dtype=np.float32))
        ok = ~pd.isna(c)
        h, w, c, a = h[ok], w[ok], c[ok].astype(int), a[ok]
        np.add.at(counts, (h, w, c), 1.0)
        np.add.at(logamt, (h, w, c), a)
        del df

    return WeeklyTensor(ids, counts, logamt, list(VOCAB))


# ---------------------------------------------------------------------------
# THE cut. The only function that decides which weeks a feature may see.
# ---------------------------------------------------------------------------

def window_sums(cum: np.ndarray, t: int):
    """Return (recent, baseline, n_baseline_weeks) using weeks strictly before t.

    cum is the cumulative sum along the week axis, with a leading zero row, so
    sum of weeks [a, b) is cum[:, b] - cum[:, a]. Nothing at or after week t is
    ever touched.
    """
    r0 = max(0, t - RECENT_WEEKS)
    b1 = r0
    b0 = max(0, b1 - BASELINE_WEEKS)
    recent = cum[:, t] - cum[:, r0]
    base = cum[:, b1] - cum[:, b0]
    return recent, base, (b1 - b0), (t - r0)


def _cumsum(x: np.ndarray) -> np.ndarray:
    H, W, C = x.shape
    out = np.zeros((H, W + 1, C), dtype=np.float32)
    np.cumsum(x, axis=1, out=out[:, 1:, :])
    return out


def feature_names() -> list:
    names = []
    for c in VOCAB:
        names += [f"{c}__rate_z", f"{c}__new", f"{c}__amount_z"]
    return names


def features_at(cum_counts, cum_amt, cum_sq, t: int) -> np.ndarray:
    """Self-relative feature matrix [H, 3C] at evaluation week t.

    rate_z   : change in weekly frequency vs own baseline, in units of that
               household's own week-to-week variability
    new      : the category appears in the recent window and never in the
               household's own baseline. The strongest precursor signal there is.
    amount_z : same as rate_z, on log amounts
    """
    rc, bc, nb, nr = window_sums(cum_counts, t)
    ra, ba, _, _ = window_sums(cum_amt, t)
    rsq, bsq, _, _ = window_sums(cum_sq, t)

    nb = max(nb, 1)
    rate_r = rc / nr
    rate_b = bc / nb
    var_b = np.maximum(bsq / nb - rate_b ** 2, 0.0)
    se = np.sqrt(var_b / nr + 0.02)
    rate_z = np.clip((rate_r - rate_b) / se, -8, 8)

    new = ((rc > 0) & (bc == 0)).astype(np.float32)

    amt_r = ra / nr
    amt_b = ba / nb
    amt_z = np.clip((amt_r - amt_b) / (np.abs(amt_b) * 0.35 + 0.35), -8, 8)

    H, C = rc.shape
    out = np.empty((H, 3 * C), dtype=np.float32)
    out[:, 0::3] = rate_z
    out[:, 1::3] = new
    out[:, 2::3] = amt_z
    return out


def eval_weeks() -> list:
    first = RECENT_WEEKS + MIN_BASELINE
    return list(range(first, N_WEEKS + 1, EVAL_EVERY))


def build_feature_stack(wt: WeeklyTensor):
    """All self-relative feature matrices, one per evaluation week.

    Returns (weeks, stack[T, H, F]).
    """
    cc = _cumsum(wt.counts)
    ca = _cumsum(wt.log_amount)
    cs = _cumsum(wt.counts ** 2)
    weeks = eval_weeks()
    stack = np.stack([features_at(cc, ca, cs, t) for t in weeks], axis=0)
    return weeks, stack


def week_to_date(w: int) -> date:
    return (START + pd.Timedelta(days=7 * w)).date()
