const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getSundayWeekStart(date = new Date()): string {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay());
  return toDateOnly(copy);
}

export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return toDateOnly(new Date(date.getTime() + days * DAY_MS));
}

export function formatHebrewDate(dateOnly: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${dateOnly}T00:00:00.000Z`));
}

export function getScheduleDays(weekStart: string) {
  return ["ראשון", "שני", "שלישי", "רביעי", "חמישי"].map((label, index) => ({
    index,
    label,
    date: addDays(weekStart, index)
  }));
}
