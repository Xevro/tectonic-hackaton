"use client";

import { useEffect, useState } from "react";

type Tone = "steady" | "new" | "risk" | "kept" | "stopped";

type Payment = { name: string; detail: string; tone: Tone };

const TONE: Record<Tone, string> = {
  steady: "border-kbc-line bg-white",
  new: "border-kbc-blue bg-kbc-mist",
  risk: "border-[#e7c8c8] bg-[#fdf6f6]",
  kept: "border-[#b7dfd0] bg-[#f3faf7]",
  stopped: "border-kbc-line bg-kbc-canvas text-kbc-muted",
};

export function HouseholdSim({
  leadDays,
  similarHouseholds,
}: {
  leadDays: number;
  similarHouseholds: number;
}) {
  const [scene, setScene] = useState(0);
  const [approved, setApproved] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (scene >= 3) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setScene((current) => current + 1), 3200);
    return () => window.clearTimeout(timer);
  }, [playing, scene]);

  const steps = ["Her past", "March bends", "Other people", "What she needs", "The salary stops"];
  const bendVisible = scene >= 1;
  const learnedOthers = scene >= 2;
  const needVisible = scene >= 3;
  const later = scene >= 4;

  const payments: Payment[] = later
    ? approved
      ? [
          { name: "Salary", detail: "Has stopped. She already knew it would.", tone: "stopped" },
          { name: "Hospitalisation cover", detail: "Kept in place before the salary stopped.", tone: "kept" },
          { name: "Social contributions", detail: "A reserve is already set aside.", tone: "kept" },
        ]
      : [
          { name: "Salary", detail: "Stops.", tone: "stopped" },
          { name: "Hospitalisation cover", detail: "Ends the same day. Nobody told them.", tone: "risk" },
          { name: "Social contributions", detail: "A bill is coming. They do not know.", tone: "risk" },
        ]
    : [
        { name: "Salary", detail: bendVisible ? "Still arriving." : "Arrives every month.", tone: "steady" },
        {
          name: "Hospitalisation cover",
          detail: needVisible ? "Likely to end when the salary stops." : "On for the family.",
          tone: needVisible ? "risk" : "steady",
        },
        ...(bendVisible
          ? [
              { name: "Accountant", detail: "New. It was not in her past.", tone: "new" as const },
              { name: "Social insurance fund", detail: "New. It was not in her past.", tone: "new" as const },
            ]
          : []),
      ];

  const pastLine =
    scene === 0
      ? "Her own past is the baseline: a salary every month, and hospitalisation cover that stays on."
      : "March does not match that past. An accountant and a social insurance fund appear. The salary has not stopped, so a written rule would see nothing wrong.";

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-kbc-blue">One household</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-kbc-navy">Sofie’s household</h1>
          <p className="mt-2 max-w-2xl text-kbc-muted">
            Synthetic. The tool is not told that anyone is becoming self-employed. It learns from her
            past, then from other people who bent the same way, then it can act on what she needs.
          </p>
        </div>
        <button
          type="button"
          disabled={scene === 3 && !approved}
          onClick={() => {
            if (scene >= 4) {
              setScene(0);
              setApproved(false);
            }
            setPlaying(true);
          }}
          className="rounded-full border border-kbc-navy px-4 py-2 text-sm font-semibold text-kbc-navy disabled:opacity-60"
        >
          {scene >= 4 ? "Play again" : scene === 3 ? "Waiting for approval" : playing ? "Playing" : "Play"}
        </button>
      </div>

      <ol className="mt-6 flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setScene(index);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                index === scene ? "bg-kbc-navy text-white" : "bg-white text-kbc-navy"
              }`}
              aria-current={index === scene ? "step" : undefined}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-3xl border border-kbc-line bg-white p-5">
          <p className="text-sm font-semibold text-kbc-muted">
            {later ? `${leadDays} days after March` : scene === 0 ? "Before March" : "March"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-kbc-navy">
            {later
              ? approved
                ? "The salary stops. She was already prepared."
                : "The salary stops. Nobody acted."
              : scene === 0
                ? "This is her normal."
                : scene === 1
                  ? "Two new payments. The salary is still here."
                  : scene === 2
                    ? "Other households already did this."
                    : "This is what she needs, before it happens."}
          </h2>
          <ul className="mt-5 space-y-3">
            {payments.map((payment) => (
              <li
                key={payment.name}
                className={`rounded-2xl border px-4 py-3 ${TONE[payment.tone]}`}
              >
                <p className="font-semibold text-kbc-navy">{payment.name}</p>
                <p className="text-sm text-kbc-muted">{payment.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-3">
          <article className="rounded-3xl border border-kbc-line bg-white p-5">
            <p className="text-sm font-semibold text-kbc-blue">Learns from her past</p>
            <p className="mt-2 text-kbc-ink">{pastLine}</p>
          </article>
          <article className={`rounded-3xl border border-kbc-line bg-white p-5 ${learnedOthers ? "" : "opacity-45"}`}>
            <p className="text-sm font-semibold text-kbc-blue">Learns from other people</p>
            <p className="mt-2 text-kbc-ink">
              {learnedOthers
                ? `${similarHouseholds.toLocaleString("en-GB")} households bent the same way. Their salary stopped a median of ${leadDays} days later. Hospitalisation cover ended that same day, and a social contributions bill followed within about two years. No one had written that situation.`
                : "Not yet. One household bending is not enough."}
            </p>
          </article>
          <article className={`rounded-3xl border border-kbc-line bg-white p-5 ${needVisible ? "" : "opacity-45"}`}>
            <p className="text-sm font-semibold text-kbc-blue">Could act on what she needs</p>
            {needVisible ? (
              <>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-kbc-ink">
                  <li>Keep the family’s hospitalisation cover before the salary stops.</li>
                  <li>Set money aside for the social contributions bill.</li>
                </ul>
                {approved ? (
                  <p className="mt-3 text-sm font-semibold text-kbc-ok">
                    A person approved this. Kate did not act on her own.
                  </p>
                ) : later ? (
                  <p className="mt-3 text-sm font-semibold text-kbc-danger">
                    No one approved it, so nothing was done for her.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setApproved(true);
                      setPlaying(false);
                      setScene(4);
                    }}
                    className="mt-4 rounded-full bg-kbc-navy px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Approve, then act
                  </button>
                )}
              </>
            ) : (
              <p className="mt-2 text-kbc-ink">
                It does not act until it has learned what people in this situation needed, and a person
                approves it.
              </p>
            )}
          </article>
        </aside>
      </div>
    </main>
  );
}
