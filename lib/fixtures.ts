export const SOFIE_CHECKING_CENTS = 220_000;
export const SOFIE_SAVINGS_CENTS = 420_000;
export const SOFIE_BUFFER_CENTS = 100_000;
export const SOFIE_DEPOSIT_CENTS = 150_000;
export const SOFIE_MOVE_DATE = "2026-11-01";
export const WEEKLY_STEP_CENTS = 15_000;
export const VAT_SAFETY_CENTS = 10_000;

export const SOFIE_BILLS = [
  { label: "Rent", amountCents: 98_000, dueOn: "2026-10-03", purpose: "rent" },
  { label: "Energy", amountCents: 32_000, dueOn: "2026-10-10", purpose: "energy" },
  { label: "Insurance", amountCents: 28_000, dueOn: "2026-10-18", purpose: "insurance" },
  { label: "Telecom", amountCents: 32_000, dueOn: "2026-10-22", purpose: "telecom" },
] as const;

export const SOFIE_SALARY = {
  label: "Salary",
  amountCents: 245_000,
  expectedOn: "2026-10-28",
};

export const SOFIE_SAVINGS_PLAN = {
  amountCents: 40_000,
  dayOfMonth: 5,
};

export const NOAH_CHECKING_CENTS = 145_000;
export const NOAH_SAVINGS_CENTS = 120_000;
export const NOAH_RENT = {
  label: "Rent",
  amountCents: 78_000,
  dueOn: "2026-10-05",
  purpose: "rent",
};
export const NOAH_VAT = {
  label: "Quarterly VAT",
  amountCents: 64_000,
  dueOn: "2026-10-21",
  purpose: "vat",
};

export const SOFIE_CHIPS = [
  "I'm moving in November. I need €1,500 for the deposit, and I want to keep €1,000 available.",
  "Don't change anything yet. I prefer reviewing this every week.",
  "What should I focus on this week?",
];

export const NOAH_CHIPS = [
  "I just got a small invoice this month. What should I do?",
  "What should I focus on this week?",
];

export const MILA_CHECKING_CENTS = 320_000;
export const MILA_SAVINGS_CENTS = 1_800_000;
export const MILA_MONTHLY_SAVE_CENTS = 90_000;
export const MILA_HOME_STEP_CENTS = 50_000;
export const MILA_HOME_TARGET_CENTS = 1_500_000;
