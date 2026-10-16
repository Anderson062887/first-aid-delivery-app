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
