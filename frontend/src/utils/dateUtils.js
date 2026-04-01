/**
 * Format a Date object as YYYY-MM-DD (local time zone).
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string to a local midnight Date.
 */
export function fromDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns today as a YYYY-MM-DD string.
 */
export function today() {
  return toDateString(new Date());
}

/**
 * Advance a date by `delta` days (negative = backwards).
 */
export function addDays(dateStr, delta) {
  const d = fromDateString(dateStr);
  d.setDate(d.getDate() + delta);
  return toDateString(d);
}

/**
 * Returns true if dateStr is today.
 */
export function isToday(dateStr) {
  return dateStr === today();
}

/**
 * Returns a human-friendly label: "Today", "Yesterday", "Tomorrow", or
 * a formatted date like "Mon, Apr 1".
 */
export function friendlyLabel(dateStr) {
  const delta = daysBetween(today(), dateStr);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  const d = fromDateString(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Days from `a` to `b` (positive if b > a).
 */
export function daysBetween(a, b) {
  return Math.round((fromDateString(b) - fromDateString(a)) / 86_400_000);
}

/**
 * Build an array of date strings centered on `centerDate`, spanning `spread`
 * days on each side.
 */
export function buildDateWindow(centerDate, spread = 30) {
  const dates = [];
  for (let i = -spread; i <= spread; i++) {
    dates.push(addDays(centerDate, i));
  }
  return dates;
}
