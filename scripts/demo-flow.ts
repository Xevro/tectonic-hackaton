import { prisma } from "../lib/db";
import { SOFIE_CHECKING_CENTS, SOFIE_CHIPS, NOAH_CHIPS, NOAH_CHECKING_CENTS } from "../lib/fixtures";
import { resetDemo } from "../lib/reset-demo";
import {
  CompassError,
  confirmProposal,
  handleUserMessage,
  openNewSession,
} from "../lib/turn";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function pending(customerId: string) {
  return prisma.proposedAction.findFirst({
    where: { customerId, status: "pending" },
  });
}

async function main() {
  await resetDemo();
  await handleUserMessage("sofie", SOFIE_CHIPS[0]);
  const memories = await prisma.memoryItem.findMany({ where: { customerId: "sofie" } });
  const keys = new Set(memories.map((memory) => memory.key));
  assert(keys.has("moving_date"), "missing move date");
  assert(keys.has("deposit_target_cents"), "missing deposit");
  assert(keys.has("buffer_cents"), "missing buffer");
  const first = await pending("sofie");
  assert(first?.type === "adjust_savings_plan", "first suggestion should pause savings");

  await handleUserMessage("sofie", SOFIE_CHIPS[1]);
  const deferred = await prisma.memoryItem.findUnique({
    where: { customerId_key: { customerId: "sofie", key: "review_cadence" } },
  });
  assert(deferred?.value === "weekly", "weekly preference missing");
  assert((await pending("sofie")) === null, "plan should stay unchanged");
  const plan = await prisma.savingsPlan.findFirst({ where: { customerId: "sofie" } });
  assert(plan?.skipMonth === null, "savings plan was changed");
  assert(plan?.amountCents === 40_000, "savings amount changed");

  await openNewSession("sofie");
  const open = await prisma.conversation.count({ where: { customerId: "sofie", closedAt: null } });
  assert(open === 1, "new session did not open");
  await handleUserMessage("sofie", SOFIE_CHIPS[2]);
  const second = await pending("sofie");
  assert(second?.type === "allocate_to_pot", "weekly step should allocate");
  const payload = second?.payload as { amountCents?: number };
  assert(payload.amountCents === 15_000, "unexpected allocation");

  let blocked = false;
  try {
    await confirmProposal("noah", second!.id);
  } catch (error) {
    blocked = error instanceof CompassError;
  }
  assert(blocked, "cross-customer confirm should fail");
  const stillPending = await pending("sofie");
  assert(stillPending?.id === second?.id, "another customer approved the action");

  await confirmProposal("sofie", second!.id);
  await confirmProposal("sofie", second!.id);
  const checking = await prisma.account.findFirst({
    where: { customerId: "sofie", kind: "checking" },
  });
  const pot = await prisma.account.findFirst({
    where: { customerId: "sofie", purpose: "deposit" },
  });
  const goal = await prisma.goal.findFirst({ where: { customerId: "sofie", key: "deposit" } });
  const planAfter = await prisma.savingsPlan.findFirst({ where: { customerId: "sofie" } });
  assert(checking?.balanceCents === SOFIE_CHECKING_CENTS - 15_000, "checking balance");
  assert(pot?.balanceCents === 15_000, "pot balance");
  assert(goal?.savedCents === 15_000, "goal progress");
  assert(planAfter?.skipMonth === null, "standing plan changed during allocation");

  await handleUserMessage("noah", NOAH_CHIPS[0]);
  const noahAction = await pending("noah");
  assert(noahAction?.type === "reserve_vat", "Noah should reserve VAT, not change a savings plan");
  const noahPayload = noahAction?.payload as { amountCents?: number };
  assert(noahPayload.amountCents === 57_000, `noah amount ${noahPayload.amountCents}`);
  await confirmProposal("noah", noahAction!.id);
  const noahChecking = await prisma.account.findFirst({
    where: { customerId: "noah", kind: "checking" },
  });
  assert(noahChecking?.balanceCents === NOAH_CHECKING_CENTS - 57_000, "noah checking");
  const noahPlans = await prisma.savingsPlan.count({ where: { customerId: "noah" } });
  assert(noahPlans === 0, "Noah should not gain a savings plan");

  console.log("Demo flow passed");
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
