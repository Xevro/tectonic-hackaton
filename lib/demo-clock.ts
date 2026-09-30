export const DEMO_TODAY = "2026-09-30";

export function demoNow() {
  return new Date(`${DEMO_TODAY}T12:00:00.000Z`);
}

export function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
