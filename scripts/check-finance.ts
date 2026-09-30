import { DEMO_TODAY } from "../lib/demo-clock";
import { buildProjection } from "../lib/finance";
import {
  SOFIE_BILLS,
  SOFIE_BUFFER_CENTS,
  SOFIE_CHECKING_CENTS,
  SOFIE_DEPOSIT_CENTS,
  SOFIE_MOVE_DATE,
  SOFIE_SALARY,
  SOFIE_SAVINGS_PLAN,
} from "../lib/fixtures";
import { planNextAction } from "../lib/planner";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const base = {
  asOf: DEMO_TODAY,
  horizon: SOFIE_MOVE_DATE,
  openingCents: SOFIE_CHECKING_CENTS,
  bufferCents: SOFIE_BUFFER_CENTS,
  bills: SOFIE_BILLS.map((bill) => ({ ...bill })),
  incomes: [SOFIE_SALARY],
  vatPotCents: 0,
};

const withPlan = buildProjection({
  ...base,
  savingsPlan: { ...SOFIE_SAVINGS_PLAN, skipMonth: null, active: true },
});
assert(withPlan.projectedEndCents === 235_000, `end ${withPlan.projectedEndCents}`);
assert(withPlan.availableAfterBufferCents === 135_000, `available ${withPlan.availableAfterBufferCents}`);
assert(withPlan.nextShortfall?.amountCents === 10_000, "shortfall amount");
assert(withPlan.nextShortfall?.date === "2026-10-22", "shortfall date");

const paused = buildProjection({
  ...base,
  savingsPlan: { ...SOFIE_SAVINGS_PLAN, skipMonth: "2026-10", active: true },
});
assert(paused.projectedEndCents === 275_000, `paused end ${paused.projectedEndCents}`);
assert(paused.nextShortfall === null, "pause should clear the shortfall");

const draft = planNextAction({
  persona: "salaried",
  asOf: DEMO_TODAY,
  intent: "setup",
  checkingCents: SOFIE_CHECKING_CENTS,
  checkingId: "checking",
  pots: [{ id: "pot", purpose: "deposit", balanceCents: 0 }],
  bills: SOFIE_BILLS.map((bill) => ({ ...bill })),
  incomes: [SOFIE_SALARY],
  invoiceAmounts: [],
  savingsPlan: { id: "plan", ...SOFIE_SAVINGS_PLAN, skipMonth: null, active: true },
  memories: [
    { key: "moving_date", value: SOFIE_MOVE_DATE, status: "confirmed", expiresAt: null },
    { key: "deposit_target_cents", value: String(SOFIE_DEPOSIT_CENTS), status: "confirmed", expiresAt: null },
    { key: "buffer_cents", value: String(SOFIE_BUFFER_CENTS), status: "confirmed", expiresAt: null },
  ],
  goalSavedCents: 0,
});
assert(draft?.type === "adjust_savings_plan", "expected a savings pause");
assert(draft?.payload.skipMonth === "2026-10", "expected October pause");

const weekly = planNextAction({
  persona: "salaried",
  asOf: DEMO_TODAY,
  intent: "focus",
  checkingCents: SOFIE_CHECKING_CENTS,
  checkingId: "checking",
  pots: [{ id: "pot", purpose: "deposit", balanceCents: 0 }],
  bills: SOFIE_BILLS.map((bill) => ({ ...bill })),
  incomes: [SOFIE_SALARY],
  invoiceAmounts: [],
  savingsPlan: { id: "plan", ...SOFIE_SAVINGS_PLAN, skipMonth: null, active: true },
  memories: [
    { key: "moving_date", value: SOFIE_MOVE_DATE, status: "confirmed", expiresAt: null },
    { key: "deposit_target_cents", value: String(SOFIE_DEPOSIT_CENTS), status: "confirmed", expiresAt: null },
    { key: "buffer_cents", value: String(SOFIE_BUFFER_CENTS), status: "confirmed", expiresAt: null },
    { key: "review_cadence", value: "weekly", status: "confirmed", expiresAt: null },
  ],
  goalSavedCents: 0,
});
assert(weekly?.type === "allocate_to_pot", "expected a weekly allocation");
assert(weekly?.payload.amountCents === 15_000, `allocation ${weekly?.payload.amountCents}`);

console.log("Finance checks passed");
