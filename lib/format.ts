export function formatEuro(cents: number) {
  const formatted = new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${formatted}` : formatted;
}

export function formatDate(value: string | Date) {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function parseEuroToCents(input: string) {
  const match = input
    .replace(/€/g, "")
    .trim()
    .match(/(\d{1,3}(?:[.\s]\d{3})+|\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?/);
  if (!match) return null;
  const euros = Number(match[1].replace(/[.\s,]/g, ""));
  if (!Number.isFinite(euros)) return null;
  const cents = match[2] ? Number(match[2]) : 0;
  return euros * 100 + cents;
}
