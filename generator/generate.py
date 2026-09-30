"""Synthetic Belgian household generator.

Produces 24 months of economic events for N households, with planted life
patterns at known dates, plus HARD NEGATIVES: households that show a similar
surface behaviour and do not experience the event.

Writes:
  data/households.parquet
  data/events.parquet
  data/answer_key.json      <- SEALED. Evaluation only.

Run:
  python -m generator.generate --n 10000 --seed 141
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta

import numpy as np
import pandas as pd

from generator.patterns import PATTERNS, summary
from generator.vocabulary import (
    DISCRETIONARY_OUT,
    ESSENTIAL_OUT,
    APP_EVENTS,
)

START = date(2024, 1, 1)
MONTHS = 24
END = START + timedelta(days=MONTHS * 30)

ARCHETYPES = {
    #                     weight  adults  children  income   income_cv  disc_share
    "young_starter":     (0.20,   1,      0,        2400,    0.05,      0.38),
    "single":            (0.18,   1,      0,        3100,    0.04,      0.30),
    "dual_no_kids":      (0.22,   2,      0,        5200,    0.05,      0.32),
    "family":            (0.28,   2,      2,        5600,    0.06,      0.26),
    "pre_retirement":    (0.12,   2,      0,        4800,    0.04,      0.24),
}

REGIONS = ["flanders", "brussels", "wallonia"]
REGION_W = [0.58, 0.12, 0.30]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _seasonal(d: date) -> float:
    """Belgian spending seasonality. Summer holiday and December."""
    m = d.month
    return {1: 0.92, 2: 0.95, 3: 1.00, 4: 1.02, 5: 1.03, 6: 1.06,
            7: 1.18, 8: 1.14, 9: 1.00, 10: 0.99, 11: 1.01, 12: 1.22}[m]


def _rand_dates(rng, anchor: date, start_before: int, end_before: int, n: int):
    if n <= 0:
        return []
    lo, hi = min(start_before, end_before), max(start_before, end_before)
    offs = rng.integers(end_before, start_before, size=n) if start_before > end_before \
        else rng.integers(lo, hi + 1, size=n)
    return [anchor - timedelta(days=int(o)) for o in offs]


# ---------------------------------------------------------------------------
# core generation
# ---------------------------------------------------------------------------

def make_households(n: int, rng) -> pd.DataFrame:
    keys = list(ARCHETYPES.keys())
    w = np.array([ARCHETYPES[k][0] for k in keys])
    w = w / w.sum()
    arch = rng.choice(keys, size=n, p=w)

    rows = []
    for i in range(n):
        a = arch[i]
        _, adults, kids, inc, cv, disc = ARCHETYPES[a]
        kids_actual = int(rng.integers(1, 4)) if kids else 0
        rows.append({
            "household_id": f"HH{i:06d}",
            "archetype": a,
            "members_adults": adults,
            "members_children": kids_actual,
            "region": rng.choice(REGIONS, p=REGION_W),
            "opened_at": (START - timedelta(days=int(rng.integers(400, 4000)))).isoformat(),
            # latent parameters, never exposed to the model
            "_income": float(inc * rng.normal(1.0, 0.22)),
            "_income_cv": float(np.clip(cv * rng.normal(1.0, 0.3), 0.01, 0.20)),
            "_disc_share": float(np.clip(disc * rng.normal(1.0, 0.18), 0.12, 0.55)),
            "_pay_day": int(rng.integers(24, 29)),
            "_housing": "mortgage" if rng.random() < 0.55 else "rent",
        })
    df = pd.DataFrame(rows)
    df["split"] = np.where(rng.random(n) < 0.3, "holdout", "train")
    return df


def base_events(hh: dict, rng, overrides: dict | None = None) -> list:
    """The household's ordinary economic life, 24 months."""
    ev = []
    ov = overrides or {}
    salary_stop = ov.get("salary_stop")
    partner_stop = ov.get("partner_salary_stop")
    rent_stop = ov.get("rent_stop")
    hid = hh["household_id"]
    inc = hh["_income"]
    cv = hh["_income_cv"]
    disc_share = hh["_disc_share"]
    payday = hh["_pay_day"]
    adults = hh["members_adults"]
    kids = hh["members_children"]

    housing_amt = inc * rng.uniform(0.22, 0.34)
    util = inc * rng.uniform(0.04, 0.07)
    telecom = rng.uniform(35, 85)

    d = START
    while d < END:
        s = _seasonal(d)

        # --- inflows -------------------------------------------------
        if d.day == min(payday, 28):
            if salary_stop is None or d < salary_stop:
                ev.append((hid, d, "salary_in", "in", round(inc * rng.normal(1, cv), 2), "transfer"))
            if adults == 2 and (partner_stop is None or d < partner_stop):
                ev.append((hid, d, "salary_in_partner", "in",
                           round(inc * rng.uniform(0.55, 0.95) * rng.normal(1, cv), 2), "transfer"))
        if hh["archetype"] == "pre_retirement" and d.day == 5 and rng.random() < 0.25:
            ev.append((hid, d, "pension_in", "in", round(inc * 0.3, 2), "transfer"))
        if rng.random() < 0.004:
            ev.append((hid, d, "windfall_in", "in", round(inc * rng.uniform(0.4, 2.5), 2), "transfer"))

        # --- essentials ----------------------------------------------
        if d.day == 1:
            cat = "mortgage_out" if hh["_housing"] == "mortgage" else "rent_out"
            if not (cat == "rent_out" and rent_stop is not None and d >= rent_stop):
                ev.append((hid, d, cat, "out", round(housing_amt, 2), "direct_debit"))
            ev.append((hid, d, "utilities_out", "out", round(util * s, 2), "direct_debit"))
            ev.append((hid, d, "telecom_out", "out", round(telecom, 2), "direct_debit"))
        if d.day == 3:
            ev.append((hid, d, "insurance_home_out", "out", round(rng.uniform(25, 70), 2), "direct_debit"))
            ev.append((hid, d, "insurance_car_out", "out", round(rng.uniform(40, 110), 2), "direct_debit"))
            ev.append((hid, d, "insurance_health_out", "out", round(rng.uniform(20, 60) * adults, 2), "direct_debit"))
        if kids and d.day == 6:
            ev.append((hid, d, "childcare_out", "out", round(rng.uniform(120, 420) * kids, 2), "direct_debit"))
            if d.month in (9, 1):
                ev.append((hid, d, "school_out", "out", round(rng.uniform(60, 260) * kids, 2), "transfer"))

        # groceries and transport, several a week
        for _ in range(int(rng.poisson(0.30 + 0.08 * (adults + kids)))):
            ev.append((hid, d, "grocery", "out", round(rng.gamma(4, 11) * s, 2), "card"))
        if rng.random() < 0.30:
            ev.append((hid, d, "fuel", "out", round(rng.uniform(40, 95), 2), "card"))
        if rng.random() < 0.18:
            ev.append((hid, d, "public_transport", "out", round(rng.uniform(2, 14), 2), "card"))

        # --- discretionary -------------------------------------------
        budget = inc * disc_share / 30.0 * s
        for cat, p in [("restaurant", 0.30), ("retail_clothing", 0.12),
                       ("leisure", 0.16), ("retail_electronics", 0.03)]:
            if rng.random() < p:
                ev.append((hid, d, cat, "out", round(max(4.0, rng.gamma(2.2, budget / 2.2)), 2), "card"))
        if d.day == 15 and rng.random() < 0.7:
            ev.append((hid, d, "subscription_media", "out", round(rng.uniform(8, 20), 2), "direct_debit"))
        if d.day == 18 and rng.random() < 0.35:
            ev.append((hid, d, "subscription_fitness", "out", round(rng.uniform(25, 55), 2), "direct_debit"))
        if d.month in (7, 8) and d.day == 9 and rng.random() < 0.45:
            ev.append((hid, d, "travel", "out", round(rng.uniform(300, 2200), 2), "card"))

        # --- app behaviour -------------------------------------------
        for _ in range(int(rng.poisson(0.25))):
            ev.append((hid, d, "app_open", "out", 0.0, "app"))
        if rng.random() < 0.12:
            ev.append((hid, d, "app_balance_check", "out", 0.0, "app"))
        if rng.random() < 0.03:
            ev.append((hid, d, rng.choice(["app_investment_screen", "app_search"]), "out", 0.0, "app"))

        d += timedelta(days=1)

    return ev


def inject_pattern(hh: dict, pattern, event_date: date, rng) -> list:
    """Plant the precursors, then the structural change at event_date."""
    ev = []
    hid = hh["household_id"]

    for p in pattern.precursors:
        n = int(rng.integers(p.n_events[0], p.n_events[1] + 1))
        for dt in _rand_dates(rng, event_date, p.start_days_before, p.end_days_before, n):
            if dt < START:
                continue
            amt = 0.0 if p.amount[1] == 0 else round(rng.uniform(*p.amount), 2)
            ch = "app" if p.category.startswith("app_") or p.category.endswith("_session") else "transfer"
            ev.append((hid, dt, p.category, "out", amt, ch))

    # --- what changes at the event -----------------------------------
    d = event_date
    inc = hh["_income"]
    while d < END:
        if pattern.key == "going_self_employed":
            # employment income stops; irregular client inflows replace it
            if rng.random() < 0.13:
                ev.append((hid, d, "client_payment_in", "in",
                           round(inc * rng.uniform(0.15, 1.3), 2), "transfer"))
            if d.day == 20 and d.month in (3, 6, 9, 12):
                ev.append((hid, d, "social_insurance_fund", "out",
                           round(rng.uniform(440, 900), 2), "transfer"))
        elif pattern.key == "first_home_purchase":
            if d.day == 1:
                ev.append((hid, d, "mortgage_out", "out", round(inc * rng.uniform(0.26, 0.36), 2), "direct_debit"))
        elif pattern.key == "new_child":
            if d.day == 6:
                ev.append((hid, d, "childcare_out", "out", round(rng.uniform(180, 520), 2), "direct_debit"))
            if rng.random() < 0.12:
                ev.append((hid, d, "baby_retail", "out", round(rng.uniform(15, 120), 2), "card"))
        elif pattern.key == "vehicle_replacement":
            if d.day == 12:
                ev.append((hid, d, "insurance_car_out", "out", round(rng.uniform(70, 160), 2), "direct_debit"))
        elif pattern.key == "subscription_creep":
            if d.day in (5, 15, 25) and rng.random() < 0.5:
                ev.append((hid, d, rng.choice(["subscription_media", "subscription_software"]),
                           "out", round(rng.uniform(6, 30), 2), "direct_debit"))
        elif pattern.key == "caring_for_ageing_parent":
            if d.day == 8:
                ev.append((hid, d, "elder_care_provider", "out", round(rng.uniform(600, 2200), 2), "transfer"))
            if rng.random() < 0.2:
                ev.append((hid, d, "care_transport", "out", round(rng.uniform(15, 80), 2), "card"))
        elif pattern.key == "separation":
            if d.day == 1:
                ev.append((hid, d, "rent_out", "out", round(rng.uniform(700, 1300), 2), "direct_debit"))
            if rng.random() < 0.05:
                ev.append((hid, d, "legal_fee", "out", round(rng.uniform(150, 800), 2), "transfer"))
        elif pattern.key == "financial_distress":
            if rng.random() < 0.25:
                ev.append((hid, d, "overdraft_interest", "out", round(rng.uniform(4, 55), 2), "direct_debit"))
            if rng.random() < 0.10:
                ev.append((hid, d, "failed_direct_debit", "out", 0.0, "direct_debit"))
            for _ in range(int(rng.poisson(0.6))):
                ev.append((hid, d, "app_balance_check", "out", 0.0, "app"))
        d += timedelta(days=1)

    return ev


def inject_hard_negative(hh: dict, rng) -> list:
    """Households that look like they are about to change, and do not.

    This is what precision is measured against. Random households would make
    every number look good and mean nothing.
    """
    ev = []
    hid = hh["household_id"]
    anchor = START + timedelta(days=int(rng.integers(300, 700)))
    kind = rng.choice(["equipment_spender", "house_browser", "car_trouble", "side_income"])

    if kind == "equipment_spender":
        for dt in _rand_dates(rng, anchor, 120, 10, int(rng.integers(2, 6))):
            ev.append((hid, dt, "business_equipment", "out", round(rng.uniform(150, 1400), 2), "card"))
        for dt in _rand_dates(rng, anchor, 100, 20, int(rng.integers(0, 3))):
            ev.append((hid, dt, "accountant_fee", "out", round(rng.uniform(100, 300), 2), "transfer"))
    elif kind == "house_browser":
        for dt in _rand_dates(rng, anchor, 150, 10, int(rng.integers(3, 11))):
            ev.append((hid, dt, "property_platform", "out", 0.0, "app"))
        for dt in _rand_dates(rng, anchor, 130, 20, int(rng.integers(1, 6))):
            ev.append((hid, dt, "mortgage_simulator_session", "out", 0.0, "app"))
    elif kind == "car_trouble":
        for dt in _rand_dates(rng, anchor, 180, 20, int(rng.integers(3, 8))):
            ev.append((hid, dt, "garage_repair", "out", round(rng.uniform(100, 900), 2), "card"))
    else:  # side_income, irregular inflow without leaving employment
        for dt in _rand_dates(rng, anchor, 200, 0, int(rng.integers(6, 20))):
            ev.append((hid, dt, "client_payment_in", "in", round(rng.uniform(80, 700), 2), "transfer"))

    return ev, kind


# ---------------------------------------------------------------------------

def main(n: int, seed: int, outdir: str):
    rng = np.random.default_rng(seed)
    hh = make_households(n, rng)

    all_events = []
    key = {}
    hard_neg = {}

    hh_records = hh.to_dict("records")

    # assign patterns
    assigned = {r["household_id"]: [] for r in hh_records}
    for pat in PATTERNS:
        eligible = [r for r in hh_records
                    if (not pat.archetypes or r["archetype"] in pat.archetypes)
                    and not assigned[r["household_id"]]]
        k = int(len(hh_records) * pat.prevalence)
        chosen = rng.choice(len(eligible), size=min(k, len(eligible)), replace=False)
        for ci in chosen:
            assigned[eligible[ci]["household_id"]].append(pat.key)

    os.makedirs(f"{outdir}/events", exist_ok=True)
    for f_ in os.listdir(f"{outdir}/events"):
        os.remove(os.path.join(f"{outdir}/events", f_))

    CHUNK = 500
    buf = []
    part = 0
    n_events = 0
    cols = ["household_id", "date", "category", "direction", "amount", "channel"]

    def flush(buf, part):
        df = pd.DataFrame(buf, columns=cols)
        df["date"] = pd.to_datetime(df["date"])
        df["category"] = df["category"].astype("category")
        df["direction"] = df["direction"].astype("category")
        df["channel"] = df["channel"].astype("category")
        df["amount"] = df["amount"].astype("float32")
        df = df.sort_values(["household_id", "date"])
        df.to_parquet(f"{outdir}/events/part-{part:03d}.parquet", index=False)
        return len(df)

    for i, r in enumerate(hh_records):
        hid = r["household_id"]
        pats = assigned[hid]
        if pats:
            pat = next(p for p in PATTERNS if p.key == pats[0])
            # event lands in months 13..23 so there is always >=12m of history
            ed = START + timedelta(days=int(rng.integers(380, 690)))
            ov = {}
            if pat.key == "going_self_employed":
                ov["salary_stop"] = ed
            elif pat.key == "separation" and r["members_adults"] == 2:
                ov["partner_salary_stop"] = ed
            elif pat.key == "first_home_purchase":
                r["_housing"] = "rent"
                ov["rent_stop"] = ed
            ev = base_events(r, rng, ov)
            ev += inject_pattern(r, pat, ed, rng)
            key[hid] = {"pattern": pat.key, "event_date": ed.isoformat(),
                        "coverage": pat.coverage, "expected_gate": pat.expected_gate}
        else:
            ev = base_events(r, rng)
            if rng.random() < 0.18:
                neg, kind = inject_hard_negative(r, rng)
                ev += neg
                hard_neg[hid] = kind
        buf += ev
        if (i + 1) % CHUNK == 0:
            n_events += flush(buf, part)
            buf = []
            part += 1
    if buf:
        n_events += flush(buf, part)

    public = hh[["household_id", "archetype", "members_adults", "members_children",
                 "region", "opened_at", "split"]]
    public.to_parquet(f"{outdir}/households.parquet", index=False)

    with open(f"{outdir}/answer_key.json", "w") as f:
        json.dump({
            "_warning": "SEALED. Evaluation only. The modelling track must not read this.",
            "seed": seed,
            "n_households": int(n),
            "patterns": summary(),
            "labels": key,
            "hard_negatives": hard_neg,
        }, f, indent=1)

    print(f"households      {len(hh):,}")
    print(f"events          {n_events:,}  in {len(os.listdir(outdir + '/events'))} parts")
    print(f"labelled        {len(key):,}  ({len(key)/len(hh):.1%})")
    print(f"hard negatives  {len(hard_neg):,}")
    print(f"clean controls  {len(hh)-len(key)-len(hard_neg):,}")
    print("\nby pattern:")
    for p in PATTERNS:
        c = sum(1 for v in key.values() if v["pattern"] == p.key)
        print(f"  {p.key:28s} {c:5d}   {p.coverage:17s} gate={p.expected_gate}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=141)
    ap.add_argument("--out", type=str, default="data")
    a = ap.parse_args()
    main(a.n, a.seed, a.out)
