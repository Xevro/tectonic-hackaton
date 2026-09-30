"""Situation 141 API.

    uvicorn api.main:app --port 8141

Security model, written against what the Aikido AI audit checks
(authentication, authorization, IDOR, business logic):

  Authentication  Bearer tokens. Only SHA-256 hashes are configured, never raw
                  tokens, and comparison is constant time.
  Authorization   Three roles.
                    customer  sees ONLY their own household, via /me
                    analyst   reads situations, cannot change them
                    reviewer  reads and approves or rejects situations
  IDOR            No customer endpoint takes a household id. Identity comes
                  from the token, so there is nothing in a URL to tamper with.
  Business logic  A cohort blocked by the ethics gate cannot be approved. This
                  is enforced here, on the server, not only in the UI.
  Least surface   There is deliberately no endpoint to look up an arbitrary
                  household. An endpoint that does not exist cannot be abused.
  Audit           Every review and every customer correction is appended to
                  out/audit.log with who, what and when.

Configure principals with S141_PRINCIPALS (JSON), or run
`python -m api.make_tokens` which writes a gitignored .env for local use.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Literal

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Path, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

OUT = os.environ.get("S141_OUT", "out")
CANDIDATE_ID = r"^S[0-9]{3}$"
MAX_BODY = 4096
RATE_LIMIT = 60          # requests per minute per principal

# ---------------------------------------------------------------------------
# principals
# ---------------------------------------------------------------------------


def _load_principals() -> dict:
    """{sha256(token): {"sub": str, "role": str, "household_id": str|None}}"""
    raw = os.environ.get("S141_PRINCIPALS")
    if not raw and os.path.exists(".env"):
        for line in open(".env"):
            if line.startswith("S141_PRINCIPALS="):
                raw = line.split("=", 1)[1].strip()
    if not raw:
        return {}
    data = json.loads(raw)
    for p in data.values():
        if p.get("role") not in ("customer", "analyst", "reviewer"):
            raise ValueError("invalid role in S141_PRINCIPALS")
        if p["role"] == "customer" and not p.get("household_id"):
            raise ValueError("customer principal needs a household_id")
    return data


PRINCIPALS = _load_principals()
bearer = HTTPBearer(auto_error=False)


class Principal(BaseModel):
    sub: str
    role: Literal["customer", "analyst", "reviewer"]
    household_id: str | None = None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


_rate: dict = {}
_rate_lock = threading.Lock()


def current(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Principal:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Missing bearer token.", headers={"WWW-Authenticate": "Bearer"})
    h = _hash(creds.credentials)
    match = None
    for known, p in PRINCIPALS.items():
        if hmac.compare_digest(known, h):
            match = p
    if match is None:
        raise HTTPException(401, "Invalid token.", headers={"WWW-Authenticate": "Bearer"})
    now = time.time()
    with _rate_lock:
        window = [t for t in _rate.get(h, []) if now - t < 60]
        if len(window) >= RATE_LIMIT:
            raise HTTPException(429, "Too many requests. Try again in a minute.")
        window.append(now)
        _rate[h] = window
    return Principal(**match)


def require(*roles):
    def dep(p: Principal = Depends(current)) -> Principal:
        if p.role not in roles:
            raise HTTPException(403, "This role cannot perform this action.")
        return p
    return dep


# ---------------------------------------------------------------------------
# data, read-only except review state
# ---------------------------------------------------------------------------

_lock = threading.Lock()


def _load():
    cands = json.load(open(f"{OUT}/candidates.json"))
    dec = pd.read_parquet(f"{OUT}/decisions.parquet")
    state_path = f"{OUT}/review_state.json"
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}
    for c in cands:
        if c["candidate_id"] in state:
            c["review"] = state[c["candidate_id"]]
    return {c["candidate_id"]: c for c in cands}, dec


CANDS, DECISIONS = _load()


def _audit(who: Principal, action: str, target: str, detail: dict):
    rec = {"at": datetime.now(timezone.utc).isoformat(), "sub": who.sub, "role": who.role,
           "action": action, "target": target, "detail": detail}
    with _lock, open(f"{OUT}/audit.log", "a") as f:
        f.write(json.dumps(rec) + "\n")


def _persist_reviews():
    state = {cid: c["review"] for cid, c in CANDS.items()}
    tmp = f"{OUT}/review_state.json.tmp"
    json.dump(state, open(tmp, "w"), indent=1)
    os.replace(tmp, f"{OUT}/review_state.json")


# ---------------------------------------------------------------------------
# app
# ---------------------------------------------------------------------------

app = FastAPI(title="Situation 141", version="1.0.0",
              docs_url=None if os.environ.get("S141_ENV") == "prod" else "/docs",
              redoc_url=None, openapi_url=None if os.environ.get("S141_ENV") == "prod" else "/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("S141_CORS", "http://localhost:8141").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=False,
)


@app.middleware("http")
async def hardening(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Request body too large."}, status_code=413)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return resp


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReviewIn(Strict):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=500)


class CorrectionIn(Strict):
    correct: bool
    note: str | None = Field(default=None, max_length=300)


PUBLIC_FIELDS = ("candidate_id", "title", "description", "size", "median_lead_days",
                 "coverage", "rank_score", "stability", "top_features", "gate", "review")


def _public(c: dict) -> dict:
    return {k: c[k] for k in PUBLIC_FIELDS if k in c}


@app.get("/health")
def health():
    return {"status": "ok", "situations": len(CANDS)}


# --- staff ------------------------------------------------------------------

@app.get("/situations")
def list_situations(p: Principal = Depends(require("analyst", "reviewer"))):
    return [_public(c) for c in sorted(CANDS.values(), key=lambda x: -x["rank_score"])]


@app.get("/situations/{candidate_id}")
def get_situation(candidate_id: str = Path(pattern=CANDIDATE_ID),
                  p: Principal = Depends(require("analyst", "reviewer"))):
    c = CANDS.get(candidate_id)
    if c is None:
        raise HTTPException(404, "No situation with this id.")
    return _public(c)


@app.post("/situations/{candidate_id}/review")
def review(body: ReviewIn, candidate_id: str = Path(pattern=CANDIDATE_ID),
           p: Principal = Depends(require("reviewer"))):
    c = CANDS.get(candidate_id)
    if c is None:
        raise HTTPException(404, "No situation with this id.")
    if body.decision == "approve" and c["gate"]["status"] != "pass":
        # business rule, enforced server-side
        _audit(p, "review_refused", candidate_id, {"reason": c["gate"]})
        raise HTTPException(409, f"Blocked by the gate ({c['gate']['status']}, "
                                 f"{c['gate']['reason']}). This situation cannot be approved.")
    with _lock:
        c["review"] = {"state": "approved" if body.decision == "approve" else "rejected",
                       "reviewer": p.sub, "decided_at": datetime.now(timezone.utc).isoformat()}
        _persist_reviews()
    _audit(p, "review", candidate_id, {"decision": body.decision, "note": body.note})
    return _public(c)


# --- customer: the Glass Box ------------------------------------------------
# Identity comes from the token only. There is no household id in any path.

def _for_customer(top: list) -> str:
    """Second person, about this customer only. Never cohort sizes, never
    other people, never the internal description written for reviewers."""
    from pipeline.discover import READABLE
    GOODS = {"business_equipment", "retail_electronics", "baby_retail"}
    payees, goods = [], []
    for f in top[:6]:
        cat, stat = f["feature"].split("__")
        if f["weight"] <= 0 or cat.startswith("app_"):
            continue
        name = READABLE.get(cat, cat.replace("_", " "))
        (goods if cat in GOODS else payees).append(name)
    payees = list(dict.fromkeys(payees))[:3]
    goods = list(dict.fromkeys(goods))[:1]

    def _join(xs):
        return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]
    parts = []
    if payees:
        parts.append("you started paying " + _join(payees))
    if goods:
        parts.append("you have been buying " + _join(goods))
    if not parts:
        return "Kate noticed a change in your regular payments."
    return "Recently " + ", and ".join(parts) + "."


WHY = [
    # (categories that must appear in the signature, customer-facing explanation)
    ({"social_insurance_fund", "enterprise_counter_fee"},
     "If you are becoming self-employed, cover you have through your employer, such as "
     "hospitalisation insurance, may end, and quarterly social contributions begin. "
     "Kate can walk you through what changes and when."),
]


def _why(top: list) -> str:
    cats = {f["feature"].split("__")[0] for f in top}
    for need, text in WHY:
        if need & cats:
            return text
    return "Kate can help you plan for what may change. Nothing happens without your approval."


def _my_row(p: Principal):
    row = DECISIONS[DECISIONS.household_id == p.household_id]
    return None if row.empty else row.iloc[0]


@app.get("/me/insights")
def my_insights(p: Principal = Depends(require("customer"))):
    """What Kate currently believes about this customer, and why.

    Only APPROVED situations that pass the gate are ever attached to a person.
    Suppressed cohorts are never recorded against an individual, so there is
    nothing sensitive to leak here.
    """
    r = _my_row(p)
    if r is None or r.candidate_id is None or pd.isna(r.candidate_id):
        return {"insights": [], "message": "Kate has no proactive suggestions for you right now."}
    c = CANDS.get(r.candidate_id)
    if not c or c["gate"]["status"] != "pass" or c["review"]["state"] != "approved":
        return {"insights": [], "message": "Kate has no proactive suggestions for you right now."}
    return {"insights": [{
        "candidate_id": c["candidate_id"],
        "what_kate_noticed": _for_customer(c["top_features"]),
        "why_this_matters": _why(c["top_features"]),
        "noticed_on": r.decision_date,
        "you_can": ["confirm", "correct", "turn off suggestions like this"],
    }]}


@app.post("/me/insights/{candidate_id}/correct")
def correct_insight(body: CorrectionIn, candidate_id: str = Path(pattern=CANDIDATE_ID),
                    p: Principal = Depends(require("customer"))):
    r = _my_row(p)
    # the customer may only correct an insight that is actually theirs.
    # 404 rather than 403, so the endpoint does not reveal whether other ids exist.
    if r is None or r.candidate_id != candidate_id:
        raise HTTPException(404, "No insight with this id for your account.")
    _audit(p, "customer_correction", candidate_id, {"correct": body.correct, "note": body.note})
    return {"recorded": True, "message": "Thanks. Kate will use this to get better, for you only."}
