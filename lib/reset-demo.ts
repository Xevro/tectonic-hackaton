import { prisma } from "@/lib/db";
import { demoNow } from "@/lib/demo-clock";
import {
  NOAH_CHECKING_CENTS,
  NOAH_RENT,
  NOAH_SAVINGS_CENTS,
  NOAH_VAT,
  MILA_CHECKING_CENTS,
  MILA_HOME_TARGET_CENTS,
  MILA_MONTHLY_SAVE_CENTS,
  MILA_SAVINGS_CENTS,
  SOFIE_BILLS,
  SOFIE_CHECKING_CENTS,
  SOFIE_SALARY,
  SOFIE_SAVINGS_CENTS,
  SOFIE_SAVINGS_PLAN,
} from "@/lib/fixtures";

function utc(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function resetDemo() {
  await prisma.customer.deleteMany({ where: { id: { in: ["mila", "sofie", "noah"] } } });

  await prisma.customer.create({
    data: {
      id: "sofie",
      name: "Sofie Martens",
      firstName: "Sofie",
      email: "sofie.martens@example.com",
      persona: "salaried",
      blurb: "Salaried · standing savings plan",
      accounts: {
        create: [
          {
            name: "Current account",
            kind: "checking",
            iban: "BE68539007547034",
            balanceCents: SOFIE_CHECKING_CENTS,
            transactions: {
              create: [
                {
                  amountCents: SOFIE_SALARY.amountCents,
                  label: "Salary",
                  bookedOn: utc("2026-09-28"),
                  posted: true,
                  kind: "income",
                },
                {
                  amountCents: -SOFIE_BILLS[0].amountCents,
                  label: "Rent",
                  bookedOn: utc("2026-09-03"),
                  posted: true,
                  kind: "bill",
                },
                {
                  amountCents: -SOFIE_SAVINGS_PLAN.amountCents,
                  label: "Savings plan",
                  bookedOn: utc("2026-09-05"),
                  posted: true,
                  kind: "transfer",
                },
                {
                  amountCents: -8_640,
                  label: "Groceries",
                  bookedOn: utc("2026-09-12"),
                  posted: true,
                  kind: "card",
                },
                {
                  amountCents: SOFIE_SALARY.amountCents,
                  label: "Salary",
                  bookedOn: utc(SOFIE_SALARY.expectedOn),
                  posted: false,
                  kind: "income",
                },
              ],
            },
          },
          {
            name: "Savings account",
            kind: "savings",
            iban: "BE71096123456769",
            balanceCents: SOFIE_SAVINGS_CENTS,
          },
          {
            name: "Moving deposit",
            kind: "pot",
            purpose: "deposit",
            iban: "BE62510007547061",
            balanceCents: 0,
          },
        ],
      },
      bills: {
        create: SOFIE_BILLS.map((bill) => ({
          label: bill.label,
          amountCents: bill.amountCents,
          dueOn: utc(bill.dueOn),
          purpose: bill.purpose,
        })),
      },
      savingsPlans: {
        create: {
          name: "Monthly savings",
          amountCents: SOFIE_SAVINGS_PLAN.amountCents,
          dayOfMonth: SOFIE_SAVINGS_PLAN.dayOfMonth,
        },
      },
      memories: {
        create: [
          {
            key: "work",
            label: "Work",
            value: "Salaried",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
          {
            key: "housing",
            label: "Housing",
            value: "Rents an apartment",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
        ],
      },
      conversations: { create: {} },
    },
  });

  await prisma.customer.create({
    data: {
      id: "noah",
      name: "Noah Peeters",
      firstName: "Noah",
      email: "noah.peeters@example.com",
      persona: "freelance",
      blurb: "Freelance · variable invoices",
      accounts: {
        create: [
          {
            name: "Current account",
            kind: "checking",
            iban: "BE68539007547012",
            balanceCents: NOAH_CHECKING_CENTS,
            transactions: {
              create: [
                {
                  amountCents: 210_000,
                  label: "Client invoice",
                  bookedOn: utc("2026-07-15"),
                  posted: true,
                  kind: "income",
                },
                {
                  amountCents: 180_000,
                  label: "Client invoice",
                  bookedOn: utc("2026-08-18"),
                  posted: true,
                  kind: "income",
                },
                {
                  amountCents: 42_000,
                  label: "Client invoice",
                  bookedOn: utc("2026-09-12"),
                  posted: true,
                  kind: "income",
                },
                {
                  amountCents: -NOAH_RENT.amountCents,
                  label: "Rent",
                  bookedOn: utc("2026-09-05"),
                  posted: true,
                  kind: "bill",
                },
              ],
            },
          },
          {
            name: "Savings account",
            kind: "savings",
            iban: "BE71096123456702",
            balanceCents: NOAH_SAVINGS_CENTS,
          },
          {
            name: "VAT reserve",
            kind: "pot",
            purpose: "vat",
            iban: "BE62510007547088",
            balanceCents: 0,
          },
        ],
      },
      bills: {
        create: [
          {
            label: NOAH_RENT.label,
            amountCents: NOAH_RENT.amountCents,
            dueOn: utc(NOAH_RENT.dueOn),
            purpose: NOAH_RENT.purpose,
          },
          {
            label: NOAH_VAT.label,
            amountCents: NOAH_VAT.amountCents,
            dueOn: utc(NOAH_VAT.dueOn),
            purpose: NOAH_VAT.purpose,
          },
        ],
      },
      memories: {
        create: [
          {
            key: "work",
            label: "Work",
            value: "Freelance",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
          {
            key: "housing",
            label: "Housing",
            value: "Rents",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
          {
            key: "variable_income",
            label: "Uneven income",
            value:
              "Invoices swung from €2,100 to €420. A fixed monthly savings plan is a poor fit until you confirm otherwise.",
            kind: "confirmed_context",
            source: "account_data",
            status: "hypothesis",
            observedAt: demoNow(),
            expiresAt: utc("2026-12-31"),
          },
        ],
      },
      conversations: { create: {} },
    },
  });

  await prisma.customer.create({
    data: {
      id: "mila",
      name: "Mila Janssen",
      firstName: "Mila",
      email: "mila.janssen@example.com",
      persona: "saver",
      blurb: "28, lives alone, owns a car, and saves more than people her age",
      accounts: {
        create: [
          {
            name: "Current account",
            kind: "checking",
            iban: "BE68539007547055",
            balanceCents: MILA_CHECKING_CENTS,
            transactions: {
              create: [
                {
                  amountCents: 240_000,
                  label: "Salary",
                  bookedOn: utc("2026-09-27"),
                  posted: true,
                  kind: "income",
                },
                {
                  amountCents: -MILA_MONTHLY_SAVE_CENTS,
                  label: "To savings",
                  bookedOn: utc("2026-09-02"),
                  posted: true,
                  kind: "transfer",
                },
                {
                  amountCents: -MILA_MONTHLY_SAVE_CENTS,
                  label: "To savings",
                  bookedOn: utc("2026-08-02"),
                  posted: true,
                  kind: "transfer",
                },
                {
                  amountCents: -MILA_MONTHLY_SAVE_CENTS,
                  label: "To savings",
                  bookedOn: utc("2026-07-02"),
                  posted: true,
                  kind: "transfer",
                },
              ],
            },
          },
          {
            name: "Savings account",
            kind: "savings",
            iban: "BE71096123456755",
            balanceCents: MILA_SAVINGS_CENTS,
          },
          {
            name: "Home deposit",
            kind: "pot",
            purpose: "home",
            iban: "BE62510007547055",
            balanceCents: 0,
          },
        ],
      },
      memories: {
        create: [
          {
            key: "age",
            label: "Age",
            value: "28",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
          {
            key: "household",
            label: "Household",
            value: "Lives alone",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
          {
            key: "car",
            label: "Car",
            value: "Owns a car",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
          {
            key: "work",
            label: "Work",
            value: "Employed",
            kind: "confirmed_context",
            source: "profile",
            status: "confirmed",
            observedAt: demoNow(),
          },
        ],
      },
      goals: {
        create: {
          key: "home",
          label: "Home deposit",
          targetCents: MILA_HOME_TARGET_CENTS,
          savedCents: 0,
        },
      },
      conversations: { create: {} },
    },
  });
}
