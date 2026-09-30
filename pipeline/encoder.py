"""Encoder and bend detection. No labels anywhere in this file.

Encoder
-------
A linear self-supervised encoder: PCA on soft-thresholded self-relative
features, fitted on TRAIN households only. PCA is the optimal linear
autoencoder, so this is a genuine learned representation, just a small one.
The scale-up path is a transformer over raw event sequences (Revolut PRAGMA,
Nubank nuFormer); the interface stays identical, only `fit_encoder` changes.

Bend detection
--------------
A bend is a SUSTAINED departure of a household from its own normal: two
consecutive evaluation points above threshold. The bend date is the second
point, because that is the first moment we could actually act on it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.decomposition import PCA

TAU = 2.0              # movement inside +/- 2 own-baseline units is treated as noise
NEW_WEIGHT = 3.0       # a category never seen before in this household
EMBED_DIM = 24
THRESHOLD_Q = 0.97     # bend threshold: 97th pct of TRAIN scores. Label-free.


def soft_threshold(x: np.ndarray) -> np.ndarray:
    """Keep only departures larger than ordinary week-to-week noise."""
    z = np.zeros_like(x)
    for off in (0, 2):  # rate_z, amount_z
        v = x[..., off::3]
        z[..., off::3] = np.sign(v) * np.maximum(np.abs(v) - TAU, 0.0)
    z[..., 1::3] = x[..., 1::3] * NEW_WEIGHT
    return z


@dataclass
class Encoder:
    pca: PCA

    def encode(self, x: np.ndarray) -> np.ndarray:
        shp = x.shape
        flat = x.reshape(-1, shp[-1])
        return self.pca.transform(flat).reshape(*shp[:-1], EMBED_DIM).astype(np.float32)


def fit_encoder(stack_t: np.ndarray, train_mask: np.ndarray, seed: int = 141,
                max_rows: int = 120_000) -> Encoder:
    """Fit on train households only. stack_t is [T, H, F] soft-thresholded."""
    rows = stack_t[:, train_mask, :].reshape(-1, stack_t.shape[-1])
    rng = np.random.default_rng(seed)
    if len(rows) > max_rows:
        rows = rows[rng.choice(len(rows), max_rows, replace=False)]
    pca = PCA(n_components=EMBED_DIM, random_state=seed).fit(rows)
    return Encoder(pca)


def bend_scores(stack_t: np.ndarray) -> np.ndarray:
    """[T, H] magnitude of departure from own normal."""
    return np.linalg.norm(stack_t, axis=2)


def fit_threshold(scores: np.ndarray, train_mask: np.ndarray) -> float:
    return float(np.quantile(scores[:, train_mask], THRESHOLD_Q))


from generator.vocabulary import INFLOW, ESSENTIAL_OUT, VOCAB

# A life event, in bank data, is when RECURRING income or FIXED commitments
# change. Not a purchase, not a browse: the structure of the month. This is
# defined from the vocabulary, not from labels.
STRUCTURAL = set(INFLOW + ESSENTIAL_OUT + ["elder_care_provider"])
STRUCT_COLS = np.array([3 * i + k for i, c in enumerate(VOCAB) if c in STRUCTURAL for k in (0, 1, 2)])
STRUCT_Q = 0.97


def structural_scores(stack_t: np.ndarray) -> np.ndarray:
    return np.linalg.norm(stack_t[:, :, STRUCT_COLS], axis=2)


@dataclass
class Bends:
    h_idx: np.ndarray        # household row index
    t_idx: np.ndarray        # evaluation index of the bend (the actionable point)
    week: np.ndarray         # calendar week of the bend
    score: np.ndarray        # score at bend
    signature: np.ndarray    # [N, F] mean soft-thresholded features over the 2 points
    peak_week: np.ndarray    # label-free: first structural change after the bend (-1 if none)


def detect_bends(stack_t: np.ndarray, scores: np.ndarray, weeks: np.ndarray,
                 threshold: float, struct: np.ndarray, struct_thr: float,
                 horizon: int = 20) -> Bends:
    """First sustained bend per household.

    peak_week is the first week, at or after the bend, where the household's
    recurring income or fixed commitments change beyond its own normal. That is
    our label-free estimate of when the life event lands, and bend-to-peak is
    the lead time the pipeline reports. Evaluation checks it against the truth.
    """
    T, H = scores.shape
    above = scores > threshold
    sustained = above[1:] & above[:-1]            # [T-1, H], True at the 2nd point

    h_list, t_list = [], []
    for h in range(H):
        hits = np.flatnonzero(sustained[:, h])
        if hits.size:
            h_list.append(h)
            t_list.append(hits[0] + 1)
    h_idx = np.array(h_list, dtype=int)
    t_idx = np.array(t_list, dtype=int)

    sig = 0.5 * (stack_t[t_idx, h_idx, :] + stack_t[t_idx - 1, h_idx, :])

    peak = np.full(len(h_idx), -1, dtype=int)
    s_above = struct > struct_thr
    for k, (h, t) in enumerate(zip(h_idx, t_idx)):
        hi = min(T, t + horizon)
        hit = np.flatnonzero(s_above[t:hi, h])
        if hit.size:
            peak[k] = weeks[t + hit[0]]

    return Bends(h_idx, t_idx, weeks[t_idx], scores[t_idx, h_idx], sig.astype(np.float32), peak)
