"""The eight planted life patterns.

SEALED. The modelling track must not import this module, and must not open
data/answer_key.json until evaluation. That blindness is the experiment: we are
not asking whether a classifier can detect what we planted, we are asking
whether unsupervised discovery can find structure it was never told exists.

Each pattern declares:
  prevalence        share of households that experience it
  precursors        (category, days_before_event, intensity) triples
  label_effects     what changes at and after the event date
  coverage          whether KBC publicly has a proactive situation for this
  expected_gate     what the ethics gate should do with it
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict


@dataclass
class Precursor:
    category: str
    start_days_before: int
    end_days_before: int
    n_events: Tuple[int, int]       # (min, max) occurrences in that window
    amount: Tuple[float, float]     # (min, max) euros


@dataclass
class Pattern:
    key: str
    label: str
    prevalence: float
    precursors: List[Precursor]
    coverage: str                   # existing_rule | partial_rule | no_existing_rule
    expected_gate: str              # pass | suppressed | protection_only
    archetypes: List[str] = field(default_factory=list)
    notes: str = ""


PATTERNS: List[Pattern] = [

    # -------------------------------------------------------------------
    # 1. The headline. Mechanically forced precursors, no KBC ecosphere.
    # -------------------------------------------------------------------
    Pattern(
        key="going_self_employed",
        label="A household member leaves employment to work for themselves",
        prevalence=0.055,
        archetypes=["young_starter", "single", "dual_no_kids", "family"],
        precursors=[
            Precursor("enterprise_counter_fee", 130, 80, (1, 1), (90, 130)),
            Precursor("social_insurance_fund", 120, 20, (1, 3), (400, 900)),
            Precursor("accountant_fee", 110, 15, (1, 3), (120, 400)),
            Precursor("professional_liability_ins", 90, 10, (1, 2), (150, 480)),
            Precursor("business_equipment", 120, 5, (2, 6), (200, 1800)),
            Precursor("coworking_out", 60, 5, (0, 3), (120, 320)),
            Precursor("app_loan_screen", 100, 20, (0, 4), (0, 0)),
        ],
        coverage="no_existing_rule",
        expected_gate="pass",
        notes=(
            "Registration is legally required and paid in advance, so the precursors "
            "are forced rather than merely correlated. Salary continues throughout the "
            "precursor window, which is the discriminator against ordinary equipment spend. "
            "At the event, employment income stops and irregular client inflows begin; "
            "group health cover and pension accrual lapse the same day."
        ),
    ),

    # -------------------------------------------------------------------
    # 2. Rediscovery beat. KBC already has MyHome, so finding this proves
    #    the engine works rather than that it is lucky.
    # -------------------------------------------------------------------
    Pattern(
        key="first_home_purchase",
        label="First home purchase",
        prevalence=0.045,
        archetypes=["young_starter", "dual_no_kids", "single"],
        precursors=[
            Precursor("property_platform", 150, 20, (3, 12), (0, 40)),
            Precursor("mortgage_simulator_session", 140, 15, (2, 8), (0, 0)),
            Precursor("app_loan_screen", 140, 10, (3, 10), (0, 0)),
            Precursor("surveyor_epc_fee", 60, 10, (1, 2), (150, 450)),
            Precursor("notary_escrow", 35, 5, (1, 1), (8000, 30000)),
            Precursor("registration_duty", 20, 0, (1, 1), (4000, 18000)),
        ],
        coverage="existing_rule",
        expected_gate="pass",
    ),

    # -------------------------------------------------------------------
    # 3. Partially covered. Sensitive enough to be worth watching.
    # -------------------------------------------------------------------
    Pattern(
        key="new_child",
        label="A child arrives in the household",
        prevalence=0.040,
        archetypes=["dual_no_kids", "family", "young_starter"],
        precursors=[
            Precursor("prenatal_care_out", 180, 10, (3, 9), (25, 120)),
            Precursor("baby_retail", 120, 5, (2, 10), (30, 400)),
            Precursor("app_insurance_screen", 120, 20, (1, 5), (0, 0)),
            Precursor("retail_electronics", 90, 20, (0, 2), (150, 900)),
        ],
        coverage="partial_rule",
        expected_gate="protection_only",
        notes="Prenatal care is in the health gate family, so the gate should "
              "force this to protection_only rather than a commercial candidate.",
    ),

    # -------------------------------------------------------------------
    # 4. Rediscovery beat two. MyMobility territory.
    # -------------------------------------------------------------------
    Pattern(
        key="vehicle_replacement",
        label="The household car reaches end of life and is replaced",
        prevalence=0.060,
        archetypes=["single", "dual_no_kids", "family", "pre_retirement"],
        precursors=[
            Precursor("garage_repair", 200, 20, (3, 8), (120, 1400)),
            Precursor("roadside_assistance", 150, 20, (1, 3), (0, 180)),
            Precursor("app_loan_screen", 90, 10, (1, 5), (0, 0)),
            Precursor("car_dealer", 40, 0, (1, 2), (300, 2500)),
        ],
        coverage="existing_rule",
        expected_gate="pass",
    ),

    # -------------------------------------------------------------------
    # 5. The unglamorous one Kate already does. Low value, high frequency.
    #    Included so the ranking has something real to push DOWN.
    # -------------------------------------------------------------------
    Pattern(
        key="subscription_creep",
        label="Recurring subscriptions accumulate past what the household uses",
        prevalence=0.090,
        archetypes=["young_starter", "single", "dual_no_kids", "family", "pre_retirement"],
        precursors=[
            Precursor("subscription_media", 180, 0, (2, 5), (8, 22)),
            Precursor("subscription_software", 180, 0, (1, 4), (6, 40)),
            Precursor("subscription_fitness", 150, 0, (0, 2), (25, 60)),
        ],
        coverage="existing_rule",
        expected_gate="pass",
        notes="Deliberately low lead-time value. If the ranker puts this above "
              "going_self_employed, the ranker is wrong.",
    ),

    # -------------------------------------------------------------------
    # 6. High value, genuinely uncovered, crosses bank and insurance.
    # -------------------------------------------------------------------
    Pattern(
        key="caring_for_ageing_parent",
        label="The household starts carrying care costs for an older relative",
        prevalence=0.035,
        archetypes=["family", "pre_retirement", "dual_no_kids"],
        precursors=[
            Precursor("care_transport", 150, 10, (4, 14), (15, 90)),
            Precursor("home_care_service", 120, 5, (2, 8), (180, 900)),
            Precursor("elder_care_provider", 90, 0, (1, 4), (600, 2400)),
            Precursor("fuel", 150, 10, (6, 20), (40, 90)),
        ],
        coverage="no_existing_rule",
        expected_gate="protection_only",
        notes="Care categories sit in the health gate family. The engine should "
              "still FIND it, and the gate should stop it being sold against. "
              "This is the slide that shows the gate working on a valuable cohort, "
              "not just a convenient one.",
    ),

    # -------------------------------------------------------------------
    # 7 and 8. Must be found and must be suppressed.
    # -------------------------------------------------------------------
    Pattern(
        key="separation",
        label="A couple separates",
        prevalence=0.030,
        archetypes=["dual_no_kids", "family"],
        precursors=[
            Precursor("legal_fee", 150, 10, (2, 6), (200, 1200)),
            Precursor("mediation_fee", 120, 20, (1, 4), (120, 600)),
            Precursor("rent_out", 60, 0, (1, 2), (700, 1300)),
            Precursor("restaurant", 180, 30, (0, 3), (20, 70)),
        ],
        coverage="no_existing_rule",
        expected_gate="suppressed",
    ),

    Pattern(
        key="financial_distress",
        label="The household slides into persistent shortfall",
        prevalence=0.045,
        archetypes=["young_starter", "single", "family"],
        precursors=[
            Precursor("overdraft_interest", 180, 0, (3, 10), (5, 60)),
            Precursor("failed_direct_debit", 150, 0, (2, 8), (0, 15)),
            Precursor("app_balance_check", 180, 0, (20, 90), (0, 0)),
            Precursor("debt_collection_out", 90, 0, (0, 3), (80, 500)),
        ],
        coverage="no_existing_rule",
        expected_gate="suppressed",
        notes="The EU AI Act prohibits exploiting a person's economic situation. "
              "This cohort must never surface as a commercial candidate. It routes "
              "to protection or nowhere.",
    ),
]

PATTERN_BY_KEY = {p.key: p for p in PATTERNS}


def summary() -> Dict:
    return {
        "n_patterns": len(PATTERNS),
        "keys": [p.key for p in PATTERNS],
        "expected_pass": [p.key for p in PATTERNS if p.expected_gate == "pass"],
        "expected_protection_only": [p.key for p in PATTERNS if p.expected_gate == "protection_only"],
        "expected_suppressed": [p.key for p in PATTERNS if p.expected_gate == "suppressed"],
        "no_existing_rule": [p.key for p in PATTERNS if p.coverage == "no_existing_rule"],
    }
