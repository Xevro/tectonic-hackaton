"""Tests. Run with:  python -m pytest -q

Three groups:
  leakage   the cut function can never see week t or later
  gate      prohibited evidence and prohibited inferences are blocked
  api       authentication, authorization, IDOR and the gate business rule
"""

import hashlib
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------- leakage

def test_cut_never_sees_the_future():
    """Scramble everything at and after week t. Features at t must not change."""
    from pipeline.features import _cumsum, features_at

    rng = np.random.default_rng(0)
    H, W, C = 20, 104, 59
    counts = rng.poisson(1.0, (H, W, C)).astype(np.float32)
    amt = rng.gamma(2.0, 1.0, (H, W, C)).astype(np.float32)
    t = 60

    def feats(c, a):
        return features_at(_cumsum(c), _cumsum(a), _cumsum(c ** 2), t)

    before = feats(counts, amt)
    c2, a2 = counts.copy(), amt.copy()
    c2[:, t:, :] = rng.poisson(50.0, c2[:, t:, :].shape)
    a2[:, t:, :] = 999.0
    after = feats(c2, a2)
    assert np.array_equal(before, after), "features at week t changed when the future changed"


def test_cut_does_see_the_past():
    """Sanity: changing the recent past MUST change features, or the test above is vacuous."""
    from pipeline.features import _cumsum, features_at

    rng = np.random.default_rng(1)
    counts = rng.poisson(1.0, (5, 104, 59)).astype(np.float32)
    amt = np.ones_like(counts)
    t = 60
    f1 = features_at(_cumsum(counts), _cumsum(amt), _cumsum(counts ** 2), t)
    counts[:, t - 2, 0] += 30
    f2 = features_at(_cumsum(counts), _cumsum(amt), _cumsum(counts ** 2), t)
    assert not np.array_equal(f1, f2)


def test_pipeline_never_opens_the_answer_key():
    """Static check: no pipeline file reads the sealed key or imports the planted patterns."""
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline")
    for fn in os.listdir(root):
        if not fn.endswith(".py"):
            continue
        src = open(os.path.join(root, fn)).read()
        assert "generator.patterns" not in src, f"{fn} imports the planted patterns"
        for line in src.splitlines():
            if "answer_key" in line:
                assert not any(k in line for k in ("open(", "load(", "read_")), \
                    f"{fn} reads the answer key: {line.strip()}"


# ---------------------------------------------------------------- gate

def _feat(cat, w, stat="rate_z"):
    return {"feature": f"{cat}__{stat}", "weight": w}


def test_gate_suppresses_distress():
    from pipeline.discover import apply_gate
    assert apply_gate([_feat("overdraft_interest", 5), _feat("app_balance_check", 3)])[0] == "suppressed"


def test_gate_suppresses_separation():
    from pipeline.discover import apply_gate
    assert apply_gate([_feat("legal_fee", 4), _feat("mediation_fee", 3)]) == ("suppressed", "separation")


def test_gate_blocks_pregnancy_inference_not_just_health_evidence():
    """The Target lesson: baby-shop spend alone implies pregnancy. Must not pass."""
    from pipeline.discover import apply_gate
    status, reason = apply_gate([_feat("baby_retail", 5, "amount_z"), _feat("app_insurance_screen", 1, "new")])
    assert status == "protection_only" and reason == "health"


def test_gate_passes_self_employment():
    from pipeline.discover import apply_gate
    top = [_feat("business_equipment", 4, "amount_z"), _feat("accountant_fee", 3, "new"),
           _feat("social_insurance_fund", 3, "new")]
    assert apply_gate(top) == ("pass", None)


# ---------------------------------------------------------------- api

TOKENS = {"reviewer": "rev-token-test", "analyst": "ana-token-test",
          "customer": "cus-token-test", "customer2": "cus2-token-test"}


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    out = tmp_path_factory.mktemp("out")
    import pandas as pd
    cands = [
        {"candidate_id": "S141", "cohort_id": "C00", "title": "Business equipment and an accountant",
         "description": "d", "size": 10, "median_lead_days": 56, "coverage": "no_existing_rule",
         "rank_score": 5.0, "stability": 0.99, "top_features": [_feat("accountant_fee", 3, "new")],
         "gate": {"status": "pass", "reason": None},
         "review": {"state": "approved", "reviewer": None, "decided_at": None}},
        {"candidate_id": "S149", "cohort_id": "C09", "title": "Overdraft interest",
         "description": "d", "size": 10, "median_lead_days": 0, "coverage": "no_existing_rule",
         "rank_score": 0.0, "stability": 0.99, "top_features": [_feat("overdraft_interest", 5)],
         "gate": {"status": "suppressed", "reason": "financial_distress"},
         "review": {"state": "blocked", "reviewer": None, "decided_at": None}},
    ]
    json.dump(cands, open(out / "candidates.json", "w"))
    pd.DataFrame({"household_id": ["HH000001", "HH000002"], "decision_date": ["2025-04-21", None],
                  "candidate_id": ["S141", None], "rung": ["ask", "silent"], "score": [7.1, 0.0],
                  "reason": ["approved", "none"], "threshold": [6.4, 6.4]}
                 ).to_parquet(out / "decisions.parquet")

    principals = {
        hashlib.sha256(TOKENS["reviewer"].encode()).hexdigest(): {"sub": "r1", "role": "reviewer"},
        hashlib.sha256(TOKENS["analyst"].encode()).hexdigest(): {"sub": "a1", "role": "analyst"},
        hashlib.sha256(TOKENS["customer"].encode()).hexdigest():
            {"sub": "c1", "role": "customer", "household_id": "HH000001"},
        hashlib.sha256(TOKENS["customer2"].encode()).hexdigest():
            {"sub": "c2", "role": "customer", "household_id": "HH000002"},
    }
    os.environ["S141_OUT"] = str(out)
    os.environ["S141_PRINCIPALS"] = json.dumps(principals)
    import importlib
    import api.main as m
    importlib.reload(m)
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def H(role):
    return {"Authorization": f"Bearer {TOKENS[role]}"}


def test_no_token_is_401(client):
    assert client.get("/situations").status_code == 401


def test_bad_token_is_401(client):
    assert client.get("/situations", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_customer_cannot_see_console(client):
    assert client.get("/situations", headers=H("customer")).status_code == 403


def test_analyst_can_read_but_not_approve(client):
    assert client.get("/situations", headers=H("analyst")).status_code == 200
    r = client.post("/situations/S141/review", json={"decision": "approve"}, headers=H("analyst"))
    assert r.status_code == 403


def test_gate_cannot_be_overridden_by_reviewer(client):
    r = client.post("/situations/S149/review", json={"decision": "approve"}, headers=H("reviewer"))
    assert r.status_code == 409


def test_malformed_id_rejected(client):
    r = client.get("/situations/..%2Fanswer_key", headers=H("reviewer"))
    assert r.status_code in (404, 422)


def test_extra_fields_rejected(client):
    r = client.post("/situations/S141/review", json={"decision": "approve", "role": "admin"},
                    headers=H("reviewer"))
    assert r.status_code == 422


def test_customer_sees_only_own_insight(client):
    mine = client.get("/me/insights", headers=H("customer")).json()
    assert [i["candidate_id"] for i in mine["insights"]] == ["S141"]
    other = client.get("/me/insights", headers=H("customer2")).json()
    assert other["insights"] == []


def test_customer_cannot_correct_someone_elses_insight(client):
    """IDOR: customer2 has no S141 insight, so correcting it must fail."""
    r = client.post("/me/insights/S141/correct", json={"correct": False}, headers=H("customer2"))
    assert r.status_code == 404
    r = client.post("/me/insights/S141/correct", json={"correct": False}, headers=H("customer"))
    assert r.status_code == 200


def test_security_headers(client):
    r = client.get("/health")
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["X-Content-Type-Options"] == "nosniff"
