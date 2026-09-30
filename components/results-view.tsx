"use client";

import type { EvalReport } from "@/lib/situations/evaluate";

export function ResultsView({ report }: { report: EvalReport }) {
  const figures = [
    { value: `${report.recovered} of ${report.plantedPatterns}`, label: "hidden life patterns recovered" },
    { value: `${report.medianLeadTimeDays} days`, label: "median lead time" },
    { value: String(report.candidateSituations), label: "candidate situations per review cycle" },
    { value: String(report.suppressedCohorts), label: "cohorts suppressed by the gate" },
  ];

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4.25rem)] max-w-5xl flex-col justify-center px-6 py-16 text-white">
      <p className="mb-10 max-w-xl text-lg text-white/80">
        On synthetic households, this is what built itself from their past and from each other.
      </p>
      <ol className="space-y-8">
        {figures.map((figure, index) => (
          <li
            key={figure.label}
            className="animate-rise"
            style={{ animationDelay: `${index * 700}ms` }}
          >
            <p className="text-6xl font-semibold tracking-tight sm:text-7xl">{figure.value}</p>
            <p className="mt-1 text-lg text-white/70">{figure.label}</p>
          </li>
        ))}
      </ol>
      <p className="mt-12 max-w-xl text-sm text-white/60">
        Synthetic data. This proves the method, not real-world accuracy.
      </p>
    </main>
  );
}
