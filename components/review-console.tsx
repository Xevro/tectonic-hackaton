"use client";

import { useState } from "react";
import type { EvalReport } from "@/lib/situations/evaluate";

function formatCount(value: number) {
  return value.toLocaleString("en-GB");
}

export function ReviewConsole({ report }: { report: EvalReport }) {
  const [approved, setApproved] = useState(false);
  const lead = report.candidates.find((candidate) => candidate.id === "self_employment");

  return (
    <main className="mx-auto grid max-w-[1240px] gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-kbc-blue">Review</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-kbc-navy">
          Situations that built themselves
        </h1>
        <p className="mt-2 max-w-2xl text-kbc-muted">
          Each row is a household’s own past, confirmed by other people who bent the same way. A
          person approves it. Kate never acts on her own.
        </p>
        <ol className="mt-6 space-y-3">
          {report.candidates.map((candidate) => {
            const uncovered = candidate.id === "self_employment";
            const existing = candidate.tag === "existing_rule";
            return (
              <li
                key={candidate.id}
                id={uncovered ? "uncovered" : existing ? "existing-rule" : undefined}
                className={`rounded-2xl border bg-white px-5 py-4 ${
                  uncovered ? "border-kbc-navy shadow-[0_10px_30px_rgba(0,55,104,0.08)]" : "border-kbc-line"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-kbc-muted">#{candidate.rank}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          existing
                            ? "border border-kbc-line text-kbc-muted"
                            : "bg-kbc-navy text-white"
                        }`}
                      >
                        {existing ? "Existing rule" : "No existing rule"}
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-kbc-navy">{candidate.title}</h2>
                    <p className="mt-1 text-sm text-kbc-muted">
                      {formatCount(candidate.cohortSize)} households
                      {candidate.medianLeadTimeDays !== null
                        ? ` · Median lead time: ${candidate.medianLeadTimeDays} days`
                        : ""}
                    </p>
                  </div>
                  {uncovered ? (
                    approved ? (
                      <p className="max-w-48 text-sm font-semibold text-kbc-ok">
                        Approved by a reviewer. Kate has not acted.
                      </p>
                    ) : (
                      <button
                        id="approve"
                        type="button"
                        onClick={() => setApproved(true)}
                        className="rounded-full bg-kbc-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#002a52]"
                      >
                        Approve
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {lead?.medianLeadTimeDays ? (
          <p className="mt-4 text-sm text-kbc-muted">
            Self-employment showed up {lead.medianLeadTimeDays} days before the salary stops, because
          other households had already bent that way. Home buyers were a rule someone had written.
          This one was not.
          </p>
        ) : null}
      </section>

      <aside id="suppressed" className="h-fit rounded-3xl border border-kbc-line bg-white p-5">
        <h2 className="text-lg font-semibold text-kbc-navy">Suppressed</h2>
        <p className="mt-2 text-sm text-kbc-muted">
          It blocked them before any person saw them as an opportunity.
        </p>
        <ul className="mt-5 space-y-3">
          {report.suppressed.map((cohort) => (
            <li key={cohort.id} className="flex items-center gap-3 rounded-2xl bg-kbc-canvas px-4 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-kbc-navy shadow-sm" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
                </svg>
              </span>
              <div className="pointer-events-none min-w-0 flex-1 blur-[2px] select-none">
                <p className="font-semibold text-kbc-navy">{cohort.title}</p>
                <p className="text-sm text-kbc-muted">{formatCount(cohort.cohortSize)} households</p>
              </div>
              {cohort.protectionOnly ? (
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-kbc-navy shadow-sm">
                  Protection only
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
