// Quick date ranges for the Reports page, as [from, to] YYYY-MM-DD strings
// in the user's own timezone ('' means no limit).

// YYYY-MM-DD in the user's own timezone
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const DATE_PRESETS = [
  { key: 'this-month', label: 'This month', range: (t) => [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)] },
  { key: 'last-month', label: 'Last month', range: (t) => [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))] },
  { key: 'last-30', label: 'Last 30 days', range: (t) => [ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29)), ymd(t)] },
  { key: 'this-year', label: 'This year', range: (t) => [ymd(new Date(t.getFullYear(), 0, 1)), ymd(t)] },
  { key: 'all', label: 'All time', range: () => ['', ''] },
];
