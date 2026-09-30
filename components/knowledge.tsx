import Link from "next/link";
import { approveAction, showLater } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import {
  illustrativeNote,
  laterQuote,
  milaSuggestions,
  type StoryBeat,
} from "@/lib/population";
import type { Snapshot } from "@/lib/snapshot";

export function Knowledge({
  snapshot,
  beat,
}: {
  snapshot: Snapshot;
  beat: StoryBeat;
}) {
  const offered = beat === "later";
  const done = Boolean(snapshot.receipt);

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-kbc-navy">
            {snapshot.customer.name}
          </h1>
          <p className="mt-3 text-2xl font-semibold text-kbc-navy">
            {formatEuro(snapshot.checkingCents)}
            <span className="ml-2 text-base font-normal text-kbc-muted">available</span>
          </p>
          {snapshot.savingsCents !== null ? (
            <p className="mt-1 text-sm text-kbc-muted">Savings {formatEuro(snapshot.savingsCents)}</p>
          ) : null}
          {snapshot.goalLine ? <p className="mt-1 text-sm text-kbc-navy">{snapshot.goalLine}</p> : null}
        </div>
        <Link href="/settings" className="shrink-0 text-sm font-semibold text-kbc-navy">
          Profile
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-kbc-navy">From people like you</h2>
        <p className="mt-1 text-sm text-kbc-muted">
          Patterns from other customers with a similar life.
        </p>

        <ul className="mt-4 space-y-2">
          {milaSuggestions.map((item) => {
            const homeReady = item.id === "home" && offered && !done;
            const homeDone = item.id === "home" && done;
            const homeWaiting = item.id === "home" && !offered;
            const skipped = item.status === "skip";

            return (
              <li
                key={item.id}
                className={`rounded-2xl px-4 py-4 ${
                  skipped
                    ? "bg-kbc-canvas text-kbc-muted"
                    : "border border-kbc-line bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`font-semibold ${skipped ? "text-kbc-ink" : "text-kbc-navy"}`}>
                    {item.action}
                  </p>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-kbc-muted">
                    {skipped
                      ? "Skip"
                      : homeDone
                        ? "Done"
                        : homeReady
                          ? "Ready"
                          : homeWaiting
                            ? "Later"
                            : "Suggest"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5">{item.pattern}</p>
                <p className="mt-1 text-sm text-kbc-muted">{item.match}</p>

                {homeReady && snapshot.pending ? (
                  <form action={approveAction} className="mt-4">
                    <input type="hidden" name="actionId" value={snapshot.pending.id} />
                    <SubmitButton>Move €500 into a home deposit</SubmitButton>
                  </form>
                ) : null}
                {homeDone && snapshot.receipt ? (
                  <p className="mt-3 text-sm text-kbc-ok">Done. {snapshot.receipt.title}.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {!offered ? (
        <form action={showLater} className="mt-8">
          <p className="mb-3 text-sm text-kbc-muted">
            Later she says: “{laterQuote}”
          </p>
          <SubmitButton>Show that update</SubmitButton>
        </form>
      ) : null}

      {offered && !done ? (
        <p className="mt-6 rounded-2xl bg-kbc-navy px-4 py-3 text-sm text-white">
          {laterQuote}
        </p>
      ) : null}

      <p className="mt-8 text-xs text-kbc-muted">{illustrativeNote}</p>
    </main>
  );
}
