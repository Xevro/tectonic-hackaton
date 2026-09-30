import { prisma } from "@/lib/db";
import { displayMemory } from "@/lib/replies";
import { NOAH_CHIPS, SOFIE_CHIPS } from "@/lib/fixtures";
import { formatEuro } from "@/lib/format";

export type Snapshot = {
  customer: {
    name: string;
    blurb: string;
  };
  memories: {
    id: string;
    label: string;
    status: string;
  }[];
  messages: { id: string; role: string; content: string }[];
  pending: {
    id: string;
    title: string;
    explanation: string;
  } | null;
  receipt: { title: string } | null;
  about: string;
  prompt: string | null;
  checkingCents: number;
  savingsCents: number | null;
  goalLine: string | null;
};

export async function getSnapshot(customerId: string): Promise<Snapshot | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      accounts: true,
      goals: { orderBy: { label: "asc" } },
      memories: { orderBy: { observedAt: "desc" } },
      conversations: {
        where: { closedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
      actions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) return null;

  const checking = customer.accounts.find((account) => account.kind === "checking");
  const savings = customer.accounts.find((account) => account.kind === "savings");
  const pending = customer.actions.find((action) => action.status === "pending");
  const approved = customer.actions.find((action) => action.status === "approved");
  const messages = customer.conversations[0]?.messages ?? [];

  return {
    customer: {
      name: customer.name,
      blurb: customer.blurb,
    },
    memories: customer.memories.map((memory) => ({
      id: memory.id,
      label: memory.label,
      status: memory.status,
    })),
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
    pending: pending
      ? {
          id: pending.id,
          title: pending.title,
          explanation: pending.explanation,
        }
      : null,
    receipt: !pending && approved ? { title: approved.title } : null,
    about: aboutLine(customer.memories, customer.blurb),
    prompt: nextPrompt(
      customer.persona,
      customer.memories.map((memory) => memory.key),
      messages.map((message) => ({ role: message.role, content: message.content })),
    ),
    checkingCents: checking?.balanceCents ?? 0,
    savingsCents: savings?.balanceCents ?? null,
    goalLine: goalLine(customer.goals),
  };
}

function aboutLine(
  memories: { key: string; value: string; status: string }[],
  blurb: string,
) {
  const confirmed = (key: string) =>
    memories.find((memory) => memory.key === key && memory.status === "confirmed");
  const parts: string[] = [];
  const move = confirmed("moving_date");
  if (move) parts.push(`Moving ${displayMemory(move.key, move.value)}`);
  const deposit = confirmed("deposit_target_cents");
  if (deposit) parts.push(`${displayMemory(deposit.key, deposit.value)} deposit`);
  const buffer = confirmed("buffer_cents");
  if (buffer) parts.push(`keep ${displayMemory(buffer.key, buffer.value)} available`);
  if (confirmed("review_cadence")) parts.push("weekly check-in");
  if (confirmed("income_note")) parts.push("smaller invoice this month");
  return parts.length ? parts.join(" · ") : blurb;
}

function goalLine(goals: { label: string; savedCents: number; targetCents: number }[]) {
  const active = goals.find((goal) => goal.savedCents > 0);
  if (!active) return null;
  return `${active.label}: ${formatEuro(active.savedCents)} of ${formatEuro(active.targetCents)}`;
}

function nextPrompt(
  persona: string,
  keys: string[],
  messages: { role: string; content: string }[],
) {
  if (persona === "saver") return null;
  const chips = persona === "freelance" ? NOAH_CHIPS : SOFIE_CHIPS;
  const asked = (text: string) =>
    messages.some((message) => message.role === "user" && message.content === text);
  if (persona === "freelance") {
    if (!keys.includes("income_note")) return chips[0];
    return asked(chips[1]) ? null : chips[1];
  }
  if (!keys.includes("moving_date")) return chips[0];
  if (!keys.includes("review_cadence")) return chips[1];
  return asked(chips[2]) ? null : chips[2];
}
