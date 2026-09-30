import { addDays, pad } from "@/lib/demo-clock";

type CashEvent = {
  date: string;
  label: string;
  amountCents: number;
  kind: "bill" | "savings" | "income";
};

export type Projection = {
  asOf: string;
  horizon: string;
  openingCents: number;
  projectedEndCents: number;
  bufferCents: number;
  availableAfterBufferCents: number;
  events: Array<CashEvent & { balanceAfterCents: number }>;
  nextShortfall: { date: string; amountCents: number; label: string } | null;
};

export type BillInput = {
  label: string;
  amountCents: number;
  dueOn: string;
  purpose: string | null;
};

export type IncomeInput = {
  label: string;
  amountCents: number;
  expectedOn: string;
};

export type SavingsInput = {
  amountCents: number;
  dayOfMonth: number;
  skipMonth: string | null;
  active: boolean;
};

export function savingsDates(
  dayOfMonth: number,
  asOf: string,
  horizon: string,
  skipMonth: string | null,
) {
  const dates: string[] = [];
  let year = Number(asOf.slice(0, 4));
  let month = Number(asOf.slice(5, 7));
  for (let index = 0; index < 8; index += 1) {
    const date = `${year}-${pad(month)}-${pad(dayOfMonth)}`;
    if (date > asOf && date <= horizon && (!skipMonth || !date.startsWith(skipMonth))) {
      dates.push(date);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

export function buildProjection(input: {
  asOf: string;
  horizon: string;
  openingCents: number;
  bufferCents: number;
  bills: BillInput[];
  incomes: IncomeInput[];
  savingsPlan: SavingsInput | null;
  vatPotCents: number;
}): Projection {
  const events: CashEvent[] = [];

  for (const bill of input.bills) {
    if (bill.dueOn <= input.asOf || bill.dueOn > input.horizon) continue;
    let amount = bill.amountCents;
    if (bill.purpose === "vat") {
      amount = Math.max(0, bill.amountCents - input.vatPotCents);
    }
    if (amount === 0) continue;
    events.push({
      date: bill.dueOn,
      label: bill.label,
      amountCents: -amount,
      kind: "bill",
    });
  }

  if (input.savingsPlan?.active) {
    for (const date of savingsDates(
      input.savingsPlan.dayOfMonth,
      input.asOf,
      input.horizon,
      input.savingsPlan.skipMonth,
    )) {
      events.push({
        date,
        label: "Savings plan",
        amountCents: -input.savingsPlan.amountCents,
        kind: "savings",
      });
    }
  }

  for (const income of input.incomes) {
    if (income.expectedOn <= input.asOf || income.expectedOn > input.horizon) continue;
    events.push({
      date: income.expectedOn,
      label: income.label,
      amountCents: income.amountCents,
      kind: "income",
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  let balance = input.openingCents;
  let nextShortfall: Projection["nextShortfall"] = null;
  const walked = events.map((event) => {
    balance += event.amountCents;
    if (balance < 0 && !nextShortfall) {
      nextShortfall = {
        date: event.date,
        amountCents: -balance,
        label: event.label,
      };
    }
    return { ...event, balanceAfterCents: balance };
  });

  return {
    asOf: input.asOf,
    horizon: input.horizon,
    openingCents: input.openingCents,
    projectedEndCents: balance,
    bufferCents: input.bufferCents,
    availableAfterBufferCents: balance - input.bufferCents,
    events: walked,
    nextShortfall,
  };
}

export function commitmentsBetween(bills: BillInput[], asOf: string, until: string) {
  return bills
    .filter(
      (bill) =>
        bill.purpose !== "vat" && bill.dueOn > asOf && bill.dueOn <= until,
    )
    .reduce((total, bill) => total + bill.amountCents, 0);
}

export function movableCents(input: {
  checkingCents: number;
  bufferCents: number;
  nearTermCents: number;
  fallbackSafetyCents: number;
}) {
  const safety = input.bufferCents > 0 ? input.bufferCents : input.fallbackSafetyCents;
  return input.checkingCents - input.nearTermCents - safety;
}

export function incomeSpread(amounts: number[]) {
  if (amounts.length < 2) return null;
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);
  return {
    min,
    max,
    variable: min > 0 && max >= min * 2,
  };
}

export function defaultHorizon(asOf: string) {
  return addDays(asOf, 32);
}
