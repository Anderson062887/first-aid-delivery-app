import Delivery from '../models/Delivery.js';
import Item from '../models/Item.js';

// Fix #1 went live on 2026-10-12 (UTC). Deliveries saved after this were
// priced correctly; only earlier ones are checked.
export const PRICING_FIX_LIVE = new Date('2026-10-13T00:00:00Z');

const cents = (n) => Math.round(n * 100) / 100;
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * Before the pricing fix, an "each" line was charged the full case price per
 * unit. Find those lines and reprice them to pricePerPack / unitsPerPack.
 *
 * A line is only changed when it clearly has the old price: its unitPrice
 * equals the item's current pricePerPack and the item has more than one unit
 * per pack. If the item's price changed since, we can't tell, so the line is
 * reported in `unsure` and left alone. Nothing is written unless apply is true.
 */
export async function repriceEachLines({ apply = false, before = PRICING_FIX_LIVE } = {}) {
  const deliveries = await Delivery.find({ createdAt: { $lt: before }, 'lines.packaging': 'each' })
    .populate('location', 'name')
    .lean();
  const itemIds = [...new Set(deliveries.flatMap(d => d.lines.map(l => String(l.item))))];
  const items = new Map((await Item.find({ _id: { $in: itemIds } }).lean()).map(i => [String(i._id), i]));

  const changes = [];  // { delivery, location, repName, deliveredAt, oldTotal, newTotal, lines }
  const unsure = [];   // { delivery, item, unitPrice, pricePerPack, unitsPerPack }

  for (const d of deliveries) {
    let touched = false;
    const lines = d.lines.map(l => {
      const item = items.get(String(l.item));
      const units = Number(item?.unitsPerPack) || 1;
      if (l.packaging !== 'each' || !item || units <= 1) return l;

      const packPrice = Number(item.pricePerPack);
      if (same(l.unitPrice, packPrice / units)) return l;           // already right
      if (!same(l.unitPrice, packPrice)) {                          // price changed since
        unsure.push({ delivery: String(d._id), item: item.name, unitPrice: l.unitPrice, pricePerPack: packPrice, unitsPerPack: units });
        return l;
      }
      touched = true;
      const unitPrice = packPrice / units;
      return { ...l, unitPrice, lineTotal: cents(unitPrice * l.quantity) };
    });
    if (!touched) continue;

    const subtotal = cents(lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));
    const total = cents(subtotal + Number(d.tax || 0));
    changes.push({
      delivery: String(d._id),
      location: d.location?.name || '',
      repName: d.repName || '',
      deliveredAt: d.deliveredAt,
      oldTotal: d.total,
      newTotal: total,
      lines, subtotal, total
    });
  }

  if (apply && changes.length) {
    await Delivery.bulkWrite(changes.map(c => ({
      updateOne: {
        filter: { _id: c.delivery },
        update: { $set: { lines: c.lines, subtotal: c.subtotal, total: c.total } }
      }
    })));
  }

  const overcharged = cents(changes.reduce((s, c) => s + (c.oldTotal - c.newTotal), 0));
  return {
    applied: apply,
    changes: changes.map(({ lines, subtotal, total, ...summary }) => summary), // eslint-disable-line no-unused-vars
    unsure,
    overcharged
  };
}
