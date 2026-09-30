import { addDays } from "@/lib/demo-clock";
import {
  buildProjection,
  commitmentsBetween,
  defaultHorizon,
  incomeSpread,
  movableCents,
  savingsDates,
  type BillInput,
  type IncomeInput,
  type SavingsInput,
} from "@/lib/finance";
import { formatDate, formatEuro } from "@/lib/format";
import { VAT_SAFETY_CENTS, WEEKLY_STEP_CENTS } from "@/lib/fixtures";

export type Intent = "setup" | "defer" | "focus" | "invoice" | "other";

export type MemoryView = {
  key: string;
  value: string;
  status: string;
  expiresAt: string | null;
};

export type ProposalDraft = {
  type: "adjust_savings_plan" | "allocate_to_pot" | "reserve_vat";
  title: string;
  explanation: string;
  reasoning: string[];
  payload: {
    amountCents?: number;
    fromAccountId?: string;
    toAccountId?: string;
    goalKey?: string;
    savingsPlanId?: string;
    skipMonth?: string;
  };
};

export type PlanContext = {
  persona: string;
  asOf: string;
  intent: Intent;
  checkingCents: number;
  checkingId: string;
  pots: { id: string; purpose: string | null; balanceCents: number }[];
  bills: BillInput[];
  incomes: IncomeInput[];
  invoiceAmounts: number[];
  savingsPlan: (SavingsInput & { id: string }) | null;
  memories: MemoryView[];
  goalSavedCents: number;
};

function confirmed(memories: MemoryView[], key: string, asOf: string) {
  const item = memories.find((memory) => memory.key === key && memory.status === "confirmed");
  if (!item) return null;
  if (item.expiresAt && item.expiresAt < asOf) return null;
  return item.value;
}

export function describeCustomer(context: PlanContext) {
  const asOf = context.asOf;
  const moveDate = confirmed(context.memories, "moving_date", asOf);
  const bufferRaw = confirmed(context.memories, "buffer_cents", asOf);
  const depositRaw = confirmed(context.memories, "deposit_target_cents", asOf);
  const bufferCents = bufferRaw ? Number(bufferRaw) : 0;
  const depositCents = depositRaw ? Number(depositRaw) : 0;
  const horizon = moveDate ?? defaultHorizon(asOf);
  const vatPot = context.pots.find((pot) => pot.purpose === "vat");
  const projection = buildProjection({
    asOf,
    horizon,
    openingCents: context.checkingCents,
    bufferCents,
    bills: context.bills,
    incomes: context.incomes,
    savingsPlan: context.savingsPlan,
    vatPotCents: vatPot?.balanceCents ?? 0,
  });
  const nearTermCents = commitmentsBetween(context.bills, asOf, addDays(asOf, 7));
  const spread = incomeSpread(context.invoiceAmounts);
  return {
    moveDate,
    bufferCents,
    depositCents,
    horizon,
    projection,
    nearTermCents,
    spread,
    weekly: confirmed(context.memories, "review_cadence", asOf) === "weekly",
    deferred: confirmed(context.memories, "defer_plan_changes", asOf) === "true",
  };
}

export function planNextAction(context: PlanContext): ProposalDraft | null {
  if (context.persona === "freelance") {
    if (context.intent !== "invoice" && context.intent !== "focus") return null;
    return planVatReserve(context);
  }

  if (context.intent === "defer" || context.intent === "other" || context.intent === "invoice") {
    return null;
  }

  const picture = describeCustomer(context);
  if (!picture.depositCents || !picture.bufferCents || !picture.moveDate) return null;

  if (context.intent === "focus") {
    return planWeeklyAllocation(context, picture);
  }
  if (picture.deferred) return null;
  return planSavingsPause(context, picture);
}

function planSavingsPause(
  context: PlanContext,
  picture: ReturnType<typeof describeCustomer>,
): ProposalDraft | null {
  const plan = context.savingsPlan;
  if (!plan?.active) return null;
  const nextDate = savingsDates(
    plan.dayOfMonth,
    context.asOf,
    picture.horizon,
    plan.skipMonth,
  )[0];
  if (!nextDate) return null;

  const remaining = Math.max(0, picture.depositCents - context.goalSavedCents);
  const gap = remaining - picture.projection.availableAfterBufferCents;
  if (gap <= 0) return null;
  const skipMonth = nextDate.slice(0, 7);
  const paused = buildProjection({
    asOf: context.asOf,
    horizon: picture.horizon,
    openingCents: context.checkingCents,
    bufferCents: picture.bufferCents,
    bills: context.bills,
    incomes: context.incomes,
    savingsPlan: { ...plan, skipMonth },
    vatPotCents: 0,
  });

  const shortfall = picture.projection.nextShortfall;
  const reasoning = [
    `Moving on ${formatDate(picture.moveDate!)} and a ${formatEuro(picture.depositCents)} deposit are confirmed.`,
    `You want ${formatEuro(picture.bufferCents)} to stay available.`,
    `On ${formatDate(picture.horizon)} the current account projects to ${formatEuro(picture.projection.projectedEndCents)} after bills, the savings transfer, and expected income.`,
    `After the buffer, ${formatEuro(picture.projection.availableAfterBufferCents)} is left toward the deposit, which is ${formatEuro(gap)} short.`,
  ];
  if (shortfall) {
    reasoning.push(
      `Before that, the account is ${formatEuro(shortfall.amountCents)} short on ${formatDate(shortfall.date)} when ${shortfall.label.toLowerCase()} is paid.`,
    );
  }
  reasoning.push("The standing plan stays unchanged until you approve this.");

  const closesGap = paused.availableAfterBufferCents >= remaining;
  const avoidsShortfall = Boolean(shortfall) && !paused.nextShortfall;
  return {
    type: "adjust_savings_plan",
    title: `Pause the ${formatEuro(plan.amountCents)} savings transfer`,
    explanation: `Pausing the ${formatDate(nextDate)} transfer of ${formatEuro(plan.amountCents)} ${closesGap ? "closes" : "reduces"} the ${formatEuro(gap)} deposit gap${avoidsShortfall ? ` and avoids the ${formatEuro(shortfall!.amountCents)} shortfall on ${formatDate(shortfall!.date)}` : ""}.`,
    reasoning,
    payload: {
      savingsPlanId: plan.id,
      skipMonth,
      amountCents: plan.amountCents,
    },
  };
}

function planWeeklyAllocation(
  context: PlanContext,
  picture: ReturnType<typeof describeCustomer>,
): ProposalDraft | null {
  const pot = context.pots.find((item) => item.purpose === "deposit");
  if (!pot) return null;
  const remaining = Math.max(0, picture.depositCents - context.goalSavedCents);
  const spare = movableCents({
    checkingCents: context.checkingCents,
    bufferCents: picture.bufferCents,
    nearTermCents: picture.nearTermCents,
    fallbackSafetyCents: 0,
  });
  const amount = Math.min(WEEKLY_STEP_CENTS, spare, remaining);
  if (amount < 5_000) return null;

  const nextSavings = context.savingsPlan
    ? savingsDates(
        context.savingsPlan.dayOfMonth,
        context.asOf,
        picture.horizon,
        context.savingsPlan.skipMonth,
      )[0]
    : null;

  const reasoning = [
    picture.weekly
      ? `You are moving on ${formatDate(picture.moveDate!)} and asked to review weekly instead of changing the standing plan.`
      : `You are moving on ${formatDate(picture.moveDate!)}. This is a one-off step, not a change to the standing plan.`,
    `Bills due in the next 7 days come to ${formatEuro(picture.nearTermCents)}.`,
    `After those bills and the ${formatEuro(picture.bufferCents)} buffer, ${formatEuro(spare)} can move.`,
    nextSavings
      ? `This step leaves the ${formatEuro(context.savingsPlan!.amountCents)} transfer on ${formatDate(nextSavings)} untouched.`
      : "No standing savings transfer falls inside this horizon.",
    `${formatEuro(remaining)} of the deposit is still unfunded.`,
  ];

  return {
    type: "allocate_to_pot",
    title: `Move ${formatEuro(amount)} into the moving deposit`,
    explanation: `This weekly step moves ${formatEuro(amount)} to the deposit pot. Rent stays payable, the ${formatEuro(picture.bufferCents)} buffer stays in the current account, and the savings plan is not changed.`,
    reasoning,
    payload: {
      amountCents: amount,
      fromAccountId: context.checkingId,
      toAccountId: pot.id,
      goalKey: "deposit",
    },
  };
}

function planVatReserve(context: PlanContext): ProposalDraft | null {
  const picture = describeCustomer(context);
  const pot = context.pots.find((item) => item.purpose === "vat");
  const vatBill = context.bills.find((bill) => bill.purpose === "vat");
  if (!pot || !vatBill) return null;

  const spare = movableCents({
    checkingCents: context.checkingCents,
    bufferCents: picture.bufferCents,
    nearTermCents: picture.nearTermCents,
    fallbackSafetyCents: VAT_SAFETY_CENTS,
  });
  const uncovered = Math.max(0, vatBill.amountCents - pot.balanceCents);
  const amount = Math.min(spare, uncovered);
  if (amount < 5_000) return null;

  const spread = picture.spread;
  const reasoning = [
    spread
      ? `Recent invoices range from ${formatEuro(spread.min)} to ${formatEuro(spread.max)}, so a fixed monthly savings plan is a poor fit.`
      : "Income is not regular enough for a fixed monthly savings plan.",
    `Rent of ${formatEuro(picture.nearTermCents)} is due within 7 days and stays in the current account.`,
    `Quarterly VAT of ${formatEuro(vatBill.amountCents)} is due on ${formatDate(vatBill.dueOn)}.`,
    `Parking ${formatEuro(amount)} now leaves ${formatEuro(context.checkingCents - amount - picture.nearTermCents)} after rent.`,
  ];
  const stillOpen = uncovered - amount;
  if (stillOpen > 0) {
    reasoning.push(
      `${formatEuro(stillOpen)} of the VAT bill is still uncovered until the next invoice.`,
    );
  }
  reasoning.push("Nothing moves until you approve it.");

  return {
    type: "reserve_vat",
    title: `Set aside ${formatEuro(amount)} for VAT`,
    explanation: `This parks ${formatEuro(amount)} in a VAT pot after protecting rent. It does not create a monthly savings plan.`,
    reasoning,
    payload: {
      amountCents: amount,
      fromAccountId: context.checkingId,
      toAccountId: pot.id,
      goalKey: "vat",
    },
  };
}
