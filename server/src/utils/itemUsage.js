// Item usage: cases and single units are different amounts, so never add them
// up directly. `units` converts cases with the item's unitsPerPack.
export const emptyUsage = () => ({ cases: 0, each: 0, units: 0, amount: 0, lines: 0 });
export function addLineUsage(agg, l) {
  const qty = Number(l.quantity) || 0;
  const perPack = Number(l.item?.unitsPerPack) || 1;
  if (l.packaging === 'case') { agg.cases += qty; agg.units += qty * perPack; }
  else { agg.each += qty; agg.units += qty; }
  agg.amount += Number(l.lineTotal) || 0;
  agg.lines += 1;
}
export const roundUsage = (u) => ({ ...u, amount: Math.round(u.amount * 100) / 100 });

// All items delivered across `deliveries` (lines.item populated with
// name, sku and unitsPerPack), most units first, plus the grand totals.
export function summarizeItems(deliveries) {
  const byItem = new Map();
  for (const d of deliveries) {
    for (const l of (Array.isArray(d.lines) ? d.lines : [])) {
      const id = l.item?._id?.toString() || 'unknown';
      if (!byItem.has(id)) {
        byItem.set(id, {
          itemId: id,
          name: l.item?.name || 'Unknown Item',
          sku: l.item?.sku || '',
          unitsPerPack: Number(l.item?.unitsPerPack) || 1,
          ...emptyUsage()
        });
      }
      addLineUsage(byItem.get(id), l);
    }
  }
  const rows = [...byItem.values()].map(roundUsage)
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  const totals = roundUsage(rows.reduce((t, r) => ({
    cases: t.cases + r.cases, each: t.each + r.each, units: t.units + r.units,
    amount: t.amount + r.amount, lines: t.lines + r.lines
  }), emptyUsage()));
  return { rows, totals, deliveries: deliveries.length };
}
