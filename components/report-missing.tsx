export function ReportMissing() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-white">
      <h1 className="text-3xl font-semibold">The evaluation has not been run</h1>
      <p className="mt-3 text-white/70">
        Run <code className="text-kbc-blue">npm run eval</code>. The review console reads{" "}
        <code className="text-kbc-blue">out/eval_report.json</code>. Nothing on this screen is typed in
        by hand.
      </p>
    </main>
  );
}
