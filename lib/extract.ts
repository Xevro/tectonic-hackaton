import { pad } from "@/lib/demo-clock";
import { parseEuroToCents } from "@/lib/format";
import type { Intent } from "@/lib/planner";

export type MemoryUpdate = {
  key: string;
  label: string;
  value: string;
  kind: "confirmed_context" | "preference" | "financial_fact";
  status: "confirmed" | "hypothesis";
  source: "customer_statement" | "explicit_choice" | "account_data";
};

const ALLOWED_KEYS = new Set([
  "moving_date",
  "deposit_target_cents",
  "buffer_cents",
  "review_cadence",
  "defer_plan_changes",
  "income_note",
  "life_note",
]);

export function isAllowedMemoryKey(key: string) {
  return ALLOWED_KEYS.has(key);
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[’‘]/g, "'");
}

export function detectIntent(text: string, persona: string): Intent {
  const lower = normalizeText(text);
  if (/don't change|do not change|not yet|leave the plan|leave it/.test(lower)) {
    return "defer";
  }
  if (/what should i focus|focus on this week/.test(lower)) return "focus";
  if (/\bthis week\b/.test(lower) && !/every week/.test(lower)) return "focus";
  if (/mov|deposit|buffer/.test(lower)) return "setup";
  if (persona === "freelance" && /invoice|vat|income/.test(lower)) return "invoice";
  return "other";
}

function closest(text: string, start: number, length: number, words: string[]) {
  const lower = normalizeText(text);
  let best = Number.POSITIVE_INFINITY;
  for (const word of words) {
    let from = 0;
    while (from < lower.length) {
      const found = lower.indexOf(word, from);
      if (found < 0) break;
      const end = found + word.length;
      const gap =
        end <= start ? start - end : found >= start + length ? found - (start + length) : 0;
      best = Math.min(best, gap);
      from = end;
    }
  }
  return best;
}

export function extractDeterministic(text: string): MemoryUpdate[] {
  const lower = normalizeText(text);
  const updates: MemoryUpdate[] = [];

  if (/mov/.test(lower) && /november/.test(lower)) {
    const dayMatch = lower.match(/(\d{1,2})\s+november/);
    const day = dayMatch ? Math.min(28, Math.max(1, Number(dayMatch[1]))) : 1;
    updates.push({
      key: "moving_date",
      label: "Moving home",
      value: `2026-11-${pad(day)}`,
      kind: "confirmed_context",
      status: "confirmed",
      source: "customer_statement",
    });
  }

  const amountRe =
    /€\s*(\d{1,3}(?:[.\s]\d{3})+|\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?/g;
  for (const match of text.matchAll(amountRe)) {
    const cents = parseEuroToCents(match[0]);
    if (!cents) continue;
    const start = match.index ?? 0;
    const depositDistance = closest(text, start, match[0].length, ["deposit"]);
    const bufferDistance = closest(text, start, match[0].length, ["buffer", "keep", "available"]);
    if (depositDistance <= bufferDistance && depositDistance <= 40) {
      updates.push({
        key: "deposit_target_cents",
        label: "Moving deposit",
        value: String(cents),
        kind: "confirmed_context",
        status: "confirmed",
        source: "customer_statement",
      });
    } else if (bufferDistance <= 40) {
      updates.push({
        key: "buffer_cents",
        label: "Cash buffer",
        value: String(cents),
        kind: "preference",
        status: "confirmed",
        source: "explicit_choice",
      });
    }
  }

  if (/every week|each week|weekly/.test(lower)) {
    updates.push({
      key: "review_cadence",
      label: "Review rhythm",
      value: "weekly",
      kind: "preference",
      status: "confirmed",
      source: "explicit_choice",
    });
  }

  if (/don't change|do not change|not yet|leave the plan|leave it/.test(lower)) {
    updates.push({
      key: "defer_plan_changes",
      label: "Savings plan",
      value: "true",
      kind: "preference",
      status: "confirmed",
      source: "explicit_choice",
    });
  }

  if (/small invoice|invoice was small|variable income/.test(lower)) {
    updates.push({
      key: "income_note",
      label: "This month's income",
      value: "The latest invoice was smaller than usual.",
      kind: "confirmed_context",
      status: "confirmed",
      source: "customer_statement",
    });
  }

  return dedupe(updates);
}

export function canonicalize(input: {
  key?: string;
  label?: string;
  value?: string;
  kind?: string;
  status?: string;
  source?: string;
}): MemoryUpdate | null {
  const key = input.key ?? "";
  if (!ALLOWED_KEYS.has(key)) return null;
  const raw = (input.value ?? "").trim();
  if (!raw || raw.length > 200) return null;

  let value = raw;
  if (key === "deposit_target_cents" || key === "buffer_cents") {
    const cents = parseEuroToCents(raw);
    if (!cents || cents <= 0 || cents > 10_000_000) return null;
    value = String(cents);
  } else if (key === "moving_date") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) value = raw;
    else if (/november/i.test(raw)) value = "2026-11-01";
    else return null;
  } else if (key === "review_cadence") {
    if (!/week/i.test(raw)) return null;
    value = "weekly";
  } else if (key === "defer_plan_changes") {
    value = /false|no/i.test(raw) ? "false" : "true";
  }

  const kind =
    input.kind === "preference" || input.kind === "financial_fact"
      ? input.kind
      : key === "buffer_cents" || key === "review_cadence" || key === "defer_plan_changes"
        ? "preference"
        : "confirmed_context";
  const source =
    input.source === "explicit_choice" || input.source === "account_data"
      ? input.source
      : kind === "preference"
        ? "explicit_choice"
        : "customer_statement";

  return {
    key,
    label: (input.label ?? key).slice(0, 80),
    value,
    kind,
    status: input.status === "hypothesis" ? "hypothesis" : "confirmed",
    source,
  };
}

export function dedupe(updates: MemoryUpdate[]) {
  const map = new Map<string, MemoryUpdate>();
  for (const update of updates) map.set(update.key, update);
  return [...map.values()];
}
