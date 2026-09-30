import type { MemoryUpdate } from "@/lib/extract";
import { formatDate, formatEuro } from "@/lib/format";
import type { Projection } from "@/lib/finance";
import type { Intent, ProposalDraft } from "@/lib/planner";

export function displayMemory(key: string, value: string) {
  if (key === "moving_date") return formatDate(value);
  if (key.endsWith("_cents")) return formatEuro(Number(value));
  if (key === "review_cadence" && value === "weekly") return "Every week";
  if (key === "defer_plan_changes" && value === "true") return "Don't change the savings plan yet";
  if (key === "defer_plan_changes") return "Changes to the savings plan are allowed";
  return value;
}

export function buildReply(input: {
  intent: Intent;
  saved: MemoryUpdate[];
  projection: Projection;
  draft: ProposalDraft | null;
  geminiReply: string | null;
}) {
  const savedLine = input.saved.length
    ? `I've saved ${input.saved.map((item) => `${item.label.toLowerCase()}: ${displayMemory(item.key, item.value)}`).join("; ")}.`
    : "";
  const situation = situationLine(input.projection);

  if (input.intent === "setup") {
    return [
      savedLine,
      input.draft
        ? `${input.draft.explanation} Nothing changes until you approve.`
        : situation,
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (input.intent === "defer") {
    return "I won't change the savings plan. I'll check in weekly, and I'll keep your move, deposit, and buffer.";
  }
  if (input.intent === "focus") {
    return input.draft
      ? input.draft.explanation
      : "There isn't a safe amount to move this week without touching your buffer or this week's bills.";
  }
  if (input.intent === "invoice") {
    return [
      savedLine || "Noted.",
      "I won't set up a monthly savings plan while your income swings.",
      input.draft?.explanation,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [input.geminiReply, savedLine, input.draft?.explanation ?? situation, "Nothing has moved."]
    .filter(Boolean)
    .join(" ");
}

function situationLine(projection: Projection) {
  const shortfall = projection.nextShortfall
    ? ` There is a ${formatEuro(projection.nextShortfall.amountCents)} shortfall on ${formatDate(projection.nextShortfall.date)} (${projection.nextShortfall.label.toLowerCase()}) before later income.`
    : " Nothing in this horizon takes the current account below zero.";
  return `On ${formatDate(projection.horizon)} the current account projects to ${formatEuro(projection.projectedEndCents)} after upcoming commitments.${shortfall}`;
}
