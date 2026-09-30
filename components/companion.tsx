import { acceptMemory, approveAction, rejectAction, sendMessage, startSession } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import type { Snapshot } from "@/lib/snapshot";

export function Companion({ snapshot }: { snapshot: Snapshot }) {
  const initials = snapshot.customer.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  const hypothesis = snapshot.memories.find((memory) => memory.status === "hypothesis");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-lg flex-col px-5 py-6">
      <header>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-kbc-navy text-sm font-semibold text-white">
            {initials}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-kbc-navy">{snapshot.customer.name}</h1>
            <p className="text-sm text-kbc-ink">{snapshot.about}</p>
          </div>
        </div>
        <p className="mt-6 text-3xl font-semibold tracking-tight text-kbc-navy">
          {formatEuro(snapshot.checkingCents)}
          <span className="ml-2 text-base font-normal text-kbc-muted">available</span>
        </p>
        {snapshot.savingsCents !== null ? (
          <p className="mt-1 text-sm text-kbc-muted">Savings {formatEuro(snapshot.savingsCents)}</p>
        ) : null}
        {snapshot.goalLine ? <p className="mt-1 text-sm text-kbc-navy">{snapshot.goalLine}</p> : null}
        {hypothesis ? (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <p className="text-kbc-ink">{hypothesis.label}</p>
            <form action={acceptMemory}>
              <input type="hidden" name="memoryId" value={hypothesis.id} />
              <SubmitButton variant="secondary">Confirm</SubmitButton>
            </form>
          </div>
        ) : null}
      </header>

      <section className="mt-8 flex flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-kbc-navy">Compass</h2>
          {snapshot.messages.length > 0 ? (
            <form action={startSession}>
              <SubmitButton variant="ghost">New conversation</SubmitButton>
            </form>
          ) : null}
        </div>
        <div className="flex-1 space-y-3">
          {snapshot.messages.length === 0 ? (
            <p className="text-sm text-kbc-muted">Tell Compass what is changing.</p>
          ) : (
            snapshot.messages.map((message) => (
              <p
                key={message.id}
                className={`max-w-[95%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user" ? "ml-auto bg-kbc-navy text-white" : "bg-white text-kbc-ink"
                }`}
              >
                {message.content}
              </p>
            ))
          )}
        </div>

        {snapshot.pending ? (
          <div className="mt-4 rounded-2xl bg-white px-4 py-4 shadow-[0_8px_30px_rgba(0,55,104,0.05)]">
            <p className="font-semibold text-kbc-navy">{snapshot.pending.title}</p>
            <p className="mt-1 text-sm leading-6 text-kbc-ink">{snapshot.pending.explanation}</p>
            <div className="mt-4 flex gap-2">
              <form action={approveAction}>
                <input type="hidden" name="actionId" value={snapshot.pending.id} />
                <SubmitButton>Approve</SubmitButton>
              </form>
              <form action={rejectAction}>
                <input type="hidden" name="actionId" value={snapshot.pending.id} />
                <SubmitButton variant="secondary">Not now</SubmitButton>
              </form>
            </div>
          </div>
        ) : snapshot.receipt ? (
          <p className="mt-4 text-sm text-kbc-ok">Done. {snapshot.receipt.title}.</p>
        ) : null}

        {snapshot.prompt ? (
          <form action={sendMessage} className="mt-4">
            <input type="hidden" name="text" value={snapshot.prompt} />
            <button
              type="submit"
              className="w-full rounded-2xl bg-kbc-mist px-4 py-3 text-left text-sm text-kbc-navy hover:bg-[#d7f1fb]"
            >
              {snapshot.prompt}
            </button>
          </form>
        ) : null}

        <form action={sendMessage} className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor="message">
            Message Compass
          </label>
          <input
            id="message"
            name="text"
            required
            maxLength={2000}
            placeholder="Message"
            className="min-w-0 flex-1 rounded-full border border-kbc-line bg-white px-4 py-2 text-sm outline-none focus:border-kbc-blue"
          />
        <SubmitButton>Send</SubmitButton>
      </form>
    </section>
  </main>
);
}
