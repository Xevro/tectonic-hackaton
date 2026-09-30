import Link from "next/link";

export function SettingsPanel({
  name,
  facts,
  savingsNote,
}: {
  name: string;
  facts: { label: string; value: string }[];
  savingsNote: string | null;
}) {
  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <p className="text-sm text-kbc-muted">Profile</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-kbc-navy">{name}</h1>
      <p className="mt-3 text-sm text-kbc-muted">
        Used to match patterns from other customers.
      </p>

      <ul className="mt-8 divide-y divide-kbc-line overflow-hidden rounded-2xl border border-kbc-line bg-white">
        {facts.map((fact) => (
          <li key={fact.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <span className="text-sm text-kbc-muted">{fact.label}</span>
            <span className="text-right text-sm font-semibold text-kbc-navy">{fact.value}</span>
          </li>
        ))}
        {savingsNote ? (
          <li className="flex items-baseline justify-between gap-4 px-4 py-3">
            <span className="text-sm text-kbc-muted">Savings habit</span>
            <span className="text-right text-sm font-semibold text-kbc-navy">{savingsNote}</span>
          </li>
        ) : null}
      </ul>

      <p className="mt-8">
        <Link href="/compass" className="text-sm font-semibold text-kbc-navy">
          Back
        </Link>
      </p>
    </main>
  );
}
