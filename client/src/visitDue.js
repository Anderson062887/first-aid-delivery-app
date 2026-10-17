// How long since a location was last visited, from the recent-by-location list.

const DAY = 24 * 60 * 60 * 1000;

export function lastVisitDate(visits) {
  const times = (visits || [])
    .map(v => new Date(v.submittedAt || v.startedAt || v.createdAt).getTime())
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)) : null;
}

// Whole calendar days between `date` and `now` (0 = today)
export function daysSince(date, now = new Date()) {
  if (!date) return null;
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / DAY);
}

export function lastVisitText(date, now = new Date()) {
  const d = daysSince(date, now);
  if (d === null) return 'Never visited';
  if (d <= 0) return 'Last visit: today';
  if (d === 1) return 'Last visit: yesterday';
  return `Last visit: ${d} days ago`;
}

// Never-visited first, then the longest since the last visit
export function byDue(visitsByLoc) {
  const t = (loc) => lastVisitDate(visitsByLoc[loc._id])?.getTime() ?? -Infinity;
  return (a, b) => t(a) - t(b) || a.name.localeCompare(b.name);
}
