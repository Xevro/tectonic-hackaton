"""Controlled event vocabulary.

Shared by the generator and the feature layer. The pipeline never sees a category
that is not in here, and never sees a label.

GATE_FAMILIES marks categories that the ethics gate treats as prohibited evidence.
A discovered cohort whose signature leans on these is suppressed or routed to
protection before any human sees it as a commercial opportunity.
"""

INFLOW = [
    "salary_in",
    "salary_in_partner",
    "client_payment_in",          # irregular, self-employed
    "benefit_in",                 # state benefit
    "pension_in",
    "transfer_in_other_bank",
    "refund_in",
    "windfall_in",                # bonus, inheritance, sale
]

ESSENTIAL_OUT = [
    "rent_out",
    "mortgage_out",
    "utilities_out",
    "telecom_out",
    "insurance_home_out",
    "insurance_car_out",
    "insurance_health_out",
    "grocery",
    "fuel",
    "public_transport",
    "childcare_out",
    "school_out",
]

DISCRETIONARY_OUT = [
    "restaurant",
    "retail_clothing",
    "retail_electronics",
    "leisure",
    "travel",
    "subscription_media",
    "subscription_software",
    "subscription_fitness",
]

# Precursor categories. These are ordinary merchant/counterparty types that
# happen to precede structural changes. Nothing here is labelled as such.
PRECURSOR = [
    "social_insurance_fund",      # Acerta / Partena / Xerius / Liantis
    "accountant_fee",
    "enterprise_counter_fee",
    "professional_liability_ins",
    "business_equipment",
    "coworking_out",
    "property_platform",
    "mortgage_simulator_session",
    "surveyor_epc_fee",
    "notary_escrow",
    "registration_duty",
    "moving_company",
    "baby_retail",
    "prenatal_care_out",
    "garage_repair",
    "roadside_assistance",
    "car_dealer",
    "elder_care_provider",
    "home_care_service",
    "care_transport",
    "legal_fee",
    "mediation_fee",
    "debt_collection_out",
    "overdraft_interest",
    "failed_direct_debit",
]

APP_EVENTS = [
    "app_open",
    "app_balance_check",
    "app_investment_screen",
    "app_loan_screen",
    "app_insurance_screen",
    "app_search",
]

VOCAB = INFLOW + ESSENTIAL_OUT + DISCRETIONARY_OUT + PRECURSOR + APP_EVENTS

VOCAB_INDEX = {c: i for i, c in enumerate(VOCAB)}

# ---------------------------------------------------------------------------
# Ethics gate
# ---------------------------------------------------------------------------
# These are NOT hidden from the encoder. A bank sees them, and pretending
# otherwise would be dishonest. They are blocked at the point where a discovered
# cohort would be shown to a human as an opportunity.

GATE_FAMILIES = {
    "health": [
        "insurance_health_out",
        "prenatal_care_out",
        "home_care_service",
        "care_transport",
        # Not health evidence, but a health INFERENCE. Before a birth, a new
        # pattern of baby-shop spending means "we think you are pregnant".
        # Inferred health data is still health data under GDPR. This is the
        # Target lesson, and the gate checks what a cohort infers, not only
        # what it reads.
        "baby_retail",
    ],
    "separation": [
        "legal_fee",
        "mediation_fee",
    ],
    "financial_distress": [
        "debt_collection_out",
        "overdraft_interest",
        "failed_direct_debit",
    ],
}

GATE_LOOKUP = {cat: fam for fam, cats in GATE_FAMILIES.items() for cat in cats}


def gate_family(feature_name: str):
    """Map a feature name back to a prohibited family, if any.

    Feature names are of the form '<category>__<stat>', so we strip the stat.
    """
    base = feature_name.split("__")[0]
    return GATE_LOOKUP.get(base)
