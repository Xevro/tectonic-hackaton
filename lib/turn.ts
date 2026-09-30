import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { addDays, dateKey, demoNow, DEMO_TODAY } from "@/lib/demo-clock";
import {
  detectIntent,
  extractDeterministic,
  dedupe,
  isAllowedMemoryKey,
  type MemoryUpdate,
} from "@/lib/extract";
import type { DemoCustomerId } from "@/lib/profiles";
import { commitmentsBetween, movableCents } from "@/lib/finance";
import { extractWithGemini } from "@/lib/gemini";
import { describeCustomer, planNextAction, type MemoryView, type PlanContext } from "@/lib/planner";
import { buildReply } from "@/lib/replies";
import { MILA_HOME_STEP_CENTS, MILA_HOME_TARGET_CENTS, VAT_SAFETY_CENTS } from "@/lib/fixtures";
import { laterQuote } from "@/lib/population";

const textSchema = z.string().trim().min(1).max(2000);
const customerIdSchema = z.enum(["mila", "sofie", "noah"]);
const actionTypeSchema = z.enum(["adjust_savings_plan", "allocate_to_pot", "reserve_vat"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const safeIdSchema = z.string().regex(SAFE_ID);
const moveSchema = z.object({
  amountCents: z.number().int().positive().max(10_000_000),
  fromAccountId: safeIdSchema,
  toAccountId: safeIdSchema,
  goalKey: z.enum(["deposit", "vat", "home"]),
});
const adjustSchema = z.object({
  savingsPlanId: safeIdSchema,
  skipMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export class CompassError extends Error {}

function requireCustomerId(value: unknown): DemoCustomerId {
  const parsed = customerIdSchema.safeParse(value);
  if (!parsed.success) throw new CompassError("Customer not found");
  return parsed.data;
}

function requireSafeId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new CompassError("Invalid id");
  }
  return value;
}

function requireGoalKey(value: unknown): "deposit" | "vat" | "home" {
  if (value !== "deposit" && value !== "vat" && value !== "home") {
    throw new CompassError("Goal not found");
  }
  return value;
}

function requireCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 10_000_000) {
    throw new CompassError("Invalid amount");
  }
  return value;
}

function requireActionType(
  value: unknown,
): "adjust_savings_plan" | "allocate_to_pot" | "reserve_vat" {
  const parsed = actionTypeSchema.safeParse(value);
  if (!parsed.success) throw new CompassError("Unknown action");
  return parsed.data;
}

type Graph = NonNullable<Awaited<ReturnType<typeof loadGraph>>>;

export async function handleUserMessage(untrustedCustomerId: string, raw: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const text = textSchema.parse(raw);
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new CompassError("Customer not found");

  const conversation = await openConversation(customerId);
  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: text },
  });

  const intent = detectIntent(text, customer.persona);
  let updates = extractDeterministic(text);
  let geminiReply: string | null = null;
  if (intent === "other") {
    const gemini = await extractWithGemini(text);
    updates = dedupe([...gemini.updates, ...updates]);
    geminiReply = gemini.reply;
  }

  const saved = await applyUpdates(customerId, updates);
  if (intent === "defer") {
    await prisma.proposedAction.updateMany({
      where: { customerId: { equals: customerIdSchema.parse(customerId) }, status: "pending" },
      data: { status: "declined", resolvedAt: new Date() },
    });
  }

  const graph = await loadGraph(customerId);
  if (!graph) throw new CompassError("Customer not found");
  const context = toContext(graph, intent);
  const draft = intent === "defer" ? null : planNextAction(context);
  if (draft) await upsertProposal(customerId, draft);

  const picture = describeCustomer(context);
  const reply = buildReply({
    intent,
    saved,
    projection: picture.projection,
    draft,
    geminiReply,
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: reply,
    },
  });
}

export async function openNewSession(untrustedCustomerId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  await prisma.conversation.updateMany({
    where: { customerId: { equals: customerIdSchema.parse(customerId) }, closedAt: null },
    data: { closedAt: new Date() },
  });
  await prisma.conversation.create({ data: { customerId } });
}

export async function confirmProposal(untrustedCustomerId: string, actionId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const id = requireSafeId(actionId);
  await prisma.$transaction(async (tx) => {
    const action = await tx.proposedAction.findFirst({ where: { id, customerId } });
    if (!action) throw new CompassError("Action not found");
    if (action.status === "approved") return;
    if (action.status !== "pending") {
      throw new CompassError("This step is no longer waiting for approval");
    }

    if (action.type === "adjust_savings_plan") {
      const payload = adjustSchema.parse(action.payload);
      const savingsPlanId = requireSafeId(payload.savingsPlanId);
      const plan = await tx.savingsPlan.findFirst({
        where: { id: savingsPlanId, customerId },
      });
      if (!plan) throw new CompassError("Savings plan not found");
      await tx.savingsPlan.update({
        where: { id: plan.id },
        data: { skipMonth: payload.skipMonth },
      });
    } else if (action.type === "allocate_to_pot" || action.type === "reserve_vat") {
      await applyTransfer(tx, customerId, moveSchema.parse(action.payload), action.type);
    } else {
      throw new CompassError("Unknown action");
    }

    await tx.proposedAction.update({
      where: { id: action.id },
      data: { status: "approved", resolvedAt: new Date() },
    });
  });
}

export async function declineProposal(untrustedCustomerId: string, actionId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const id = requireSafeId(actionId);
  const action = await prisma.proposedAction.findFirst({ where: { id, customerId } });
  if (!action) throw new CompassError("Action not found");
  if (action.status !== "pending") return;
  await prisma.proposedAction.update({
    where: { id: action.id },
    data: { status: "declined", resolvedAt: new Date() },
  });
}

export async function confirmMemory(untrustedCustomerId: string, memoryId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const id = requireSafeId(memoryId);
  const memory = await prisma.memoryItem.findFirst({ where: { id, customerId } });
  if (!memory) throw new CompassError("Memory not found");
  await prisma.memoryItem.update({
    where: { id: memory.id },
    data: { status: "confirmed", source: "customer_statement" },
  });
}

async function applyUpdates(untrustedCustomerId: string, updates: MemoryUpdate[]) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const saved: MemoryUpdate[] = [];
  for (const update of updates) {
    if (typeof update.key !== "string" || !isAllowedMemoryKey(update.key)) continue;
    if (typeof update.value !== "string" || !update.value || update.value.length > 200) continue;
    if (typeof update.label !== "string" || update.label.length > 80) continue;
    if (typeof update.kind !== "string" || typeof update.status !== "string") continue;
    if (typeof update.source !== "string") continue;
    const key = update.key;
    const value = update.value;
    const label = update.label;
    const kind = update.kind;
    const status = update.status;
    const source = update.source;
    await prisma.memoryItem.upsert({
      where: { customerId_key: { customerId, key } },
      create: {
        customerId,
        key,
        label,
        value,
        kind,
        status,
        source,
        observedAt: demoNow(),
      },
      update: {
        label,
        value,
        kind,
        status,
        source,
        observedAt: demoNow(),
      },
    });
    saved.push(update);
  }
  if (saved.length) await syncGoals(customerId);
  return saved;
}

async function syncGoals(untrustedCustomerId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const memories = await prisma.memoryItem.findMany({ where: { customerId } });
  const deposit = memories.find(
    (memory) => memory.key === "deposit_target_cents" && memory.status === "confirmed",
  );
  const move = memories.find(
    (memory) => memory.key === "moving_date" && memory.status === "confirmed",
  );
  if (deposit) {
    const dueOn = move ? new Date(`${move.value}T00:00:00.000Z`) : null;
    await prisma.goal.upsert({
      where: { customerId_key: { customerId, key: "deposit" } },
      create: {
        customerId,
        key: "deposit",
        label: "Moving deposit",
        targetCents: Number(deposit.value),
        dueOn,
      },
      update: { targetCents: Number(deposit.value), dueOn },
    });
  }

  const note = memories.find((memory) => memory.key === "income_note");
  if (!note) return;
  await prisma.memoryItem.updateMany({
    where: {
      customerId: { equals: customerIdSchema.parse(customerId) },
      key: "variable_income",
      status: "hypothesis",
    },
    data: { status: "confirmed", source: "customer_statement" },
  });
  const vat = await prisma.bill.findFirst({ where: { customerId, purpose: "vat" } });
  const pot = await prisma.account.findFirst({ where: { customerId, purpose: "vat" } });
  if (!vat) return;
  await prisma.goal.upsert({
    where: { customerId_key: { customerId, key: "vat" } },
    create: {
      customerId,
      key: "vat",
      label: "VAT reserve",
      targetCents: vat.amountCents,
      savedCents: pot?.balanceCents ?? 0,
      dueOn: vat.dueOn,
    },
    update: { targetCents: vat.amountCents, dueOn: vat.dueOn },
  });
}

async function upsertProposal(
  untrustedCustomerId: string,
  draft: NonNullable<ReturnType<typeof planNextAction>>,
) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const type = requireActionType(draft.type);
  await prisma.proposedAction.updateMany({
    where: {
      customerId: { equals: customerIdSchema.parse(customerId) },
      status: "pending",
      NOT: { type: { equals: actionTypeSchema.parse(type) } },
    },
    data: { status: "replaced", resolvedAt: new Date() },
  });
  const existing = await prisma.proposedAction.findFirst({
    where: { customerId, status: "pending", type },
  });
  const data = {
    title: draft.title,
    explanation: draft.explanation,
    reasoning: draft.reasoning,
    payload: draft.payload,
  };
  if (existing) {
    await prisma.proposedAction.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.proposedAction.create({
    data: { customerId, type, status: "pending", ...data },
  });
}

async function applyTransfer(
  tx: Prisma.TransactionClient,
  untrustedCustomerId: string,
  payload: z.infer<typeof moveSchema>,
  type: string,
) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const fromAccountId = requireSafeId(payload.fromAccountId);
  const toAccountId = requireSafeId(payload.toAccountId);
  const goalKey = requireGoalKey(payload.goalKey);
  const amountCents = requireCents(payload.amountCents);
  const from = await tx.account.findFirst({
    where: { id: fromAccountId, customerId, kind: "checking" },
  });
  const to = await tx.account.findFirst({
    where: { id: toAccountId, customerId },
  });
  if (!from || !to || to.id === from.id) throw new CompassError("Account not found");
  if (amountCents > from.balanceCents) {
    throw new CompassError("That amount is no longer available");
  }

  const bills = await tx.bill.findMany({ where: { customerId, paid: false } });
  const buffer = await tx.memoryItem.findFirst({
    where: { customerId, key: "buffer_cents", status: "confirmed" },
  });
  const nearTerm = commitmentsBetween(
    bills.map((bill) => ({
      label: bill.label,
      amountCents: bill.amountCents,
      dueOn: dateKey(bill.dueOn),
      purpose: bill.purpose,
    })),
    DEMO_TODAY,
    addDays(DEMO_TODAY, 7),
  );
  const spare = movableCents({
    checkingCents: from.balanceCents,
    bufferCents: buffer ? Number(buffer.value) : 0,
    nearTermCents: nearTerm,
    fallbackSafetyCents: type === "reserve_vat" ? VAT_SAFETY_CENTS : 0,
  });
  if (amountCents > spare) {
    throw new CompassError("That would break the buffer or the bills due this week");
  }

  const goal = await tx.goal.findFirst({ where: { customerId, key: goalKey } });
  if (!goal) throw new CompassError("Goal not found");

  await tx.account.update({
    where: { id: from.id },
    data: { balanceCents: { decrement: amountCents } },
  });
  await tx.account.update({
    where: { id: to.id },
    data: { balanceCents: { increment: amountCents } },
  });
  await tx.transaction.createMany({
    data: [
      {
        accountId: from.id,
        amountCents: -amountCents,
        label: `To ${to.name}`,
        bookedOn: demoNow(),
        posted: true,
        kind: "allocation",
      },
      {
        accountId: to.id,
        amountCents,
        label: `From ${from.name}`,
        bookedOn: demoNow(),
        posted: true,
        kind: "allocation",
      },
    ],
  });
  await tx.goal.update({
    where: { id: goal.id },
    data: { savedCents: { increment: amountCents } },
  });
}

async function openConversation(untrustedCustomerId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  const existing = await prisma.conversation.findFirst({
    where: { customerId, closedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { customerId } });
}

async function loadGraph(untrustedCustomerId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  return prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      accounts: { include: { transactions: true } },
      bills: { where: { paid: false } },
      savingsPlans: true,
      goals: true,
      memories: true,
    },
  });
}

function toContext(graph: Graph, intent: PlanContext["intent"]): PlanContext {
  const checking = graph.accounts.find((account) => account.kind === "checking");
  if (!checking) throw new CompassError("Current account not found");
  const plan = graph.savingsPlans[0] ?? null;
  const goalKey = graph.persona === "freelance" ? "vat" : "deposit";
  return {
    persona: graph.persona,
    asOf: DEMO_TODAY,
    intent,
    checkingCents: checking.balanceCents,
    checkingId: checking.id,
    pots: graph.accounts
      .filter((account) => account.kind === "pot")
      .map((account) => ({
        id: account.id,
        purpose: account.purpose,
        balanceCents: account.balanceCents,
      })),
    bills: graph.bills.map((bill) => ({
      label: bill.label,
      amountCents: bill.amountCents,
      dueOn: dateKey(bill.dueOn),
      purpose: bill.purpose,
    })),
    incomes: checking.transactions
      .filter((transaction) => !transaction.posted && transaction.amountCents > 0)
      .map((transaction) => ({
        label: transaction.label,
        amountCents: transaction.amountCents,
        expectedOn: dateKey(transaction.bookedOn),
      })),
    invoiceAmounts: checking.transactions
      .filter((transaction) => transaction.posted && transaction.kind === "income")
      .map((transaction) => transaction.amountCents),
    savingsPlan: plan
      ? {
          id: plan.id,
          amountCents: plan.amountCents,
          dayOfMonth: plan.dayOfMonth,
          skipMonth: plan.skipMonth,
          active: plan.active,
        }
      : null,
    memories: graph.memories.map(
      (memory): MemoryView => ({
        key: memory.key,
        value: memory.value,
        status: memory.status,
        expiresAt: memory.expiresAt ? dateKey(memory.expiresAt) : null,
      }),
    ),
    goalSavedCents: graph.goals.find((goal) => goal.key === goalKey)?.savedCents ?? 0,
  };
}

export async function openHomeOffer(untrustedCustomerId: string) {
  const customerId = requireCustomerId(untrustedCustomerId);
  if (customerId !== "mila") throw new CompassError("This story is only for Mila");
  const checking = await prisma.account.findFirst({
    where: { customerId, kind: "checking" },
  });
  const pot = await prisma.account.findFirst({
    where: { customerId, purpose: "home" },
  });
  if (!checking || !pot) throw new CompassError("Accounts not found");

  await prisma.goal.upsert({
    where: { customerId_key: { customerId, key: "home" } },
    create: {
      customerId,
      key: "home",
      label: "Home deposit",
      targetCents: MILA_HOME_TARGET_CENTS,
      savedCents: pot.balanceCents,
    },
    update: { targetCents: MILA_HOME_TARGET_CENTS },
  });

  await prisma.memoryItem.upsert({
    where: { customerId_key: { customerId, key: "looking_at_apartments" } },
    create: {
      customerId,
      key: "looking_at_apartments",
      label: "Looking at apartments",
      value: laterQuote,
      kind: "confirmed_context",
      source: "customer_statement",
      status: "confirmed",
      observedAt: demoNow(),
    },
    update: { status: "confirmed", observedAt: demoNow() },
  });

  const existing = await prisma.proposedAction.findFirst({
    where: { customerId, status: "pending", type: "allocate_to_pot" },
  });
  if (existing) return;

  await prisma.proposedAction.create({
    data: {
      customerId,
      type: "allocate_to_pot",
      status: "pending",
      title: "Move €500 into a home deposit",
      explanation: "Puts €500 into a home deposit. Nothing else changes.",
      reasoning: [
        "She mentioned apartments.",
        "People in a similar life usually open a deposit first.",
      ],
      payload: {
        amountCents: MILA_HOME_STEP_CENTS,
        fromAccountId: checking.id,
        toAccountId: pot.id,
        goalKey: "home",
      },
    },
  });
}
