"""Discovery. Turns bends into candidate situations a human can review.

No labels in this file. Everything here would run unchanged on KBC's real data.

Steps
  1. cluster bend DIRECTIONS (what changed, not how much) on train households
  2. stability: re-cluster early and late bends separately, check centroids agree
  3. signature: which features distinguish this cohort from all other bends
  4. gate: suppress or route to protection if the signature leans on health,
     separation or financial distress evidence
  5. coverage: compare against a register of KBC's published proactive situations
  6. name it in plain language, from the signature, never invented
  7. rank. Silence falls out of ranking: below the cutoff, nobody is contacted.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.cluster import HDBSCAN

from generator.vocabulary import VOCAB, GATE_FAMILIES
from pipeline.features import feature_names

FEATURES = feature_names()

# ---------------------------------------------------------------------------
# Register of KBC's published proactive coverage.
# Source: KBC newsroom (Kate five year milestone, MyHome, MyMobility releases).
# This is OUR reading of public material, not KBC's internal catalogue.
# ---------------------------------------------------------------------------
COVERAGE_REGISTER = {
    "existing_rule": {
        # MyHome ecosphere
        "property_platform", "mortgage_simulator_session", "surveyor_epc_fee",
        "notary_escrow", "registration_duty", "moving_company",
        # MyMobility ecosphere
        "garage_repair", "car_dealer", "roadside_assistance",
        # Kate's published everyday situations (duplicate payments, subscriptions)
        "subscription_media", "subscription_software", "subscription_fitness",
    },
    "partial_rule": {
        # Kate suggests adding a child to insurance once known
        "baby_retail",
    },
}

READABLE = {
    "salary_in": "salary", "salary_in_partner": "partner's salary",
    "client_payment_in": "irregular client payments", "benefit_in": "state benefits",
    "pension_in": "pension income", "windfall_in": "one-off windfalls",
    "rent_out": "rent", "mortgage_out": "mortgage payments",
    "childcare_out": "childcare", "insurance_car_out": "car insurance",
    "insurance_health_out": "health insurance",
    "social_insurance_fund": "a social insurance fund",
    "accountant_fee": "an accountant", "enterprise_counter_fee": "enterprise registration",
    "professional_liability_ins": "professional liability cover",
    "business_equipment": "business equipment", "coworking_out": "coworking space",
    "property_platform": "property platforms", "mortgage_simulator_session": "the mortgage simulator",
    "surveyor_epc_fee": "a surveyor or EPC certificate", "notary_escrow": "a notary escrow deposit",
    "registration_duty": "registration duties", "baby_retail": "baby shops",
    "prenatal_care_out": "prenatal care", "garage_repair": "garage repairs",
    "roadside_assistance": "roadside assistance", "car_dealer": "a car dealer",
    "elder_care_provider": "an elder care provider", "home_care_service": "home care",
    "care_transport": "care transport", "legal_fee": "legal fees",
    "mediation_fee": "mediation", "debt_collection_out": "debt collection",
    "overdraft_interest": "overdraft interest", "failed_direct_debit": "failed direct debits",
    "app_loan_screen": "loan screens in the app", "app_insurance_screen": "insurance screens in the app",
    "app_balance_check": "balance checks", "subscription_media": "media subscriptions",
    "subscription_software": "software subscriptions", "subscription_fitness": "fitness subscriptions",
    "retail_electronics": "electronics", "fuel": "fuel", "restaurant": "restaurants",
}


def _read(cat: str) -> str:
    return READABLE.get(cat, cat.replace("_", " "))


@dataclass
class Cohort:
    cohort_id: str
    members: np.ndarray                  # indices into the TRAIN bend arrays
    centroid: np.ndarray                 # unit vector, embedding space
    top_features: list = field(default_factory=list)
    stability: float = 0.0
    median_lead_days: float = 0.0
    gate_status: str = "pass"
    gate_reason: str | None = None
    coverage: str = "no_existing_rule"
    title: str = ""
    description: str = ""
    rank_score: float = 0.0


def _unit(x: np.ndarray) -> np.ndarray:
    return x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)


def cluster_directions(emb: np.ndarray, min_size: int = 45, min_samples: int = 10):
    """HDBSCAN on unit bend directions. Label -1 is noise, and noise is fine."""
    u = _unit(emb)
    labels = HDBSCAN(min_cluster_size=min_size, min_samples=min_samples,
                     metric="euclidean").fit_predict(u)
    return labels, u


def _centroids(u: np.ndarray, labels: np.ndarray):
    out = {}
    for c in sorted(set(labels) - {-1}):
        v = u[labels == c].mean(axis=0)
        out[c] = v / (np.linalg.norm(v) + 1e-9)
    return out


def stability(u: np.ndarray, labels: np.ndarray, weeks: np.ndarray,
              min_size: int = 25) -> dict:
    """Split bends by calendar time, re-cluster each half independently,
    and ask whether the same directions reappear. 1.0 = identical."""
    cut = np.median(weeks)
    halves = [weeks < cut, weeks >= cut]
    half_cents = []
    for m in halves:
        lab = HDBSCAN(min_cluster_size=min_size, min_samples=8).fit_predict(u[m])
        half_cents.append(list(_centroids(u[m], lab).values()))
    out = {}
    for c, v in _centroids(u, labels).items():
        scores = []
        for cents in half_cents:
            scores.append(max((float(v @ w) for w in cents), default=0.0))
        out[c] = float(min(scores))
    return out


def signature(sig: np.ndarray, members: np.ndarray, k: int = 6) -> list:
    """What moved, for these households, relative to their own normal.

    Features are already self-relative (0 = no change for that household), so
    the cohort mean is the honest signature. Contrasting against other bends
    leaks big cohorts into small ones and invents changes that did not happen.
    This is the analyst output: the ordered list of what moved.
    """
    m = sig[members].mean(axis=0)
    order = np.argsort(-np.abs(m))[:k]
    return [{"feature": FEATURES[i], "weight": round(float(m[i]), 3)} for i in order
            if abs(m[i]) > 0.05]


def apply_gate(top: list, share: float = 0.20):
    """If gate-family evidence carries a meaningful share of the signature,
    this cohort never reaches a human as a commercial opportunity."""
    total = sum(abs(t["weight"]) for t in top) + 1e-9
    fam_w = {f: 0.0 for f in GATE_FAMILIES}
    for t in top:
        base = t["feature"].split("__")[0]
        for fam, cats in GATE_FAMILIES.items():
            if base in cats:
                fam_w[fam] += abs(t["weight"])
    for fam in ("financial_distress", "separation"):
        if fam_w[fam] / total >= share:
            return "suppressed", fam
    if fam_w["health"] / total >= share:
        return "protection_only", "health"
    return "pass", None


def coverage_of(top: list, k: int = 4) -> str:
    cats = {t["feature"].split("__")[0] for t in top[:k] if t["weight"] > 0}
    if cats & COVERAGE_REGISTER["existing_rule"]:
        return "existing_rule"
    if cats & COVERAGE_REGISTER["partial_rule"]:
        return "partial_rule"
    return "no_existing_rule"


def describe(top: list, size: int, lead_days: float) -> tuple[str, str]:
    """Plain language from the signature. Nothing here is invented: every
    phrase maps to a feature the cohort actually moved on."""
    from generator.vocabulary import INFLOW, APP_EVENTS
    by_cat = {}
    for t in top:
        cat, stat = t["feature"].split("__")
        if cat in by_cat:
            continue
        name = _read(cat)
        if t["weight"] < 0:
            ph = f"see {name} fall or stop"
        elif cat in INFLOW:
            ph = f"start receiving {name}" if stat == "new" else f"receive more {name}"
        elif cat in APP_EVENTS or cat.endswith("_session"):
            ph = f"start using {name}" if stat == "new" else f"use {name} far more often"
        elif stat == "new":
            ph = f"start paying {name}"
        else:
            ph = f"pay {name} more often"
        by_cat[cat] = ph
    uniq = list(by_cat.values())
    cats = list(by_cat.keys())[:2]
    names = [_read(c) for c in cats]
    title = " and ".join(names)
    title = title[0].upper() + title[1:]
    if len(title) > 80:                      # contract limit, cut on a word
        title = title[:80].rsplit(" ", 1)[0]
    body = (f"{size} households " + "; ".join(uniq[:4]) +
            f". The largest change in recurring income or fixed costs follows a median of "
            f"{int(round(lead_days))} days later (pipeline estimate).")
    return title, body


COVERAGE_WEIGHT = {"no_existing_rule": 1.0, "partial_rule": 0.55, "existing_rule": 0.25}


def rank(c: Cohort) -> float:
    if c.gate_status != "pass":
        return 0.0
    lead = np.clip(c.median_lead_days / 90.0, 0, 1.5)
    return round(float(np.log1p(len(c.members)) * lead * COVERAGE_WEIGHT[c.coverage] * c.stability), 4)


def discover(emb: np.ndarray, sig: np.ndarray, bend_weeks: np.ndarray,
             peak_weeks: np.ndarray, min_size: int = 45) -> tuple[list, np.ndarray, np.ndarray]:
    labels, u = cluster_directions(emb, min_size=min_size)
    stab = stability(u, labels, bend_weeks)
    cents = _centroids(u, labels)
    cohorts = []
    for c in sorted(cents):
        m = np.flatnonzero(labels == c)
        top = signature(sig, m)
        has = peak_weeks[m] >= 0
        lead = float(np.median((peak_weeks[m][has] - bend_weeks[m][has]) * 7)) if has.any() else 0.0
        co = Cohort(cohort_id=f"C{c:02d}", members=m, centroid=cents[c], top_features=top,
                    stability=round(stab.get(c, 0.0), 3), median_lead_days=lead)
        co.gate_status, co.gate_reason = apply_gate(top)
        co.coverage = coverage_of(top)
        co.title, co.description = describe(top, len(m), lead)
        co.rank_score = rank(co)
        cohorts.append(co)
    cohorts.sort(key=lambda x: -x.rank_score)
    return cohorts, labels, u


def assign(u_new: np.ndarray, cohorts: list, u_train: np.ndarray, labels_train: np.ndarray,
           q: float = 0.10) -> np.ndarray:
    """Assign unseen households to discovered cohorts. A household only joins a
    cohort if it is at least as close as that cohort's own looser members.
    Otherwise it stays unassigned, which means silence."""
    if not cohorts:
        return np.full(len(u_new), -1)
    C = np.stack([c.centroid for c in cohorts])
    cut = []
    for c in cohorts:
        sims = u_train[c.members] @ c.centroid
        cut.append(np.quantile(sims, q))
    cut = np.array(cut)
    sims = u_new @ C.T
    best = sims.argmax(axis=1)
    ok = sims[np.arange(len(u_new)), best] >= cut[best]
    return np.where(ok, best, -1)
