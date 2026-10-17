import mongoose from 'mongoose';
import Box from '../models/Box.js';
import Delivery from '../models/Delivery.js';
import { dayRange } from './dates.js';
import { repDeliveriesFilter } from './repDeliveries.js';

/**
 * Every box (active and retired), grouped by location, with when it was last
 * refilled (ever) and how often / for how much in the selected dates.
 * `scope` ({ repId, repName }) limits the refill numbers to one rep; null = everyone.
 */
export async function buildBoxesReport({ from, to, location, tz, scope }) {
  const bq = location ? { location } : {};
  const boxes = await Box.find(bq).populate('location', 'name').lean();
  const ids = boxes.map(b => b._id);

  const base = { box: { $in: ids } };
  // aggregate() doesn't convert id strings, so pass a real ObjectId
  if (scope) Object.assign(base, await repDeliveriesFilter(new mongoose.Types.ObjectId(String(scope.repId)), scope.repName));

  const range = dayRange(from, to, tz);
  const [last, inRange] = await Promise.all([
    Delivery.aggregate([
      { $match: base },
      { $group: { _id: '$box', at: { $max: { $ifNull: ['$deliveredAt', '$createdAt'] } } } }
    ]),
    Delivery.aggregate([
      { $match: range ? { ...base, deliveredAt: range } : base },
      { $group: { _id: '$box', refills: { $sum: 1 }, amount: { $sum: '$total' } } }
    ])
  ]);
  const lastBy = new Map(last.map(r => [String(r._id), r.at]));
  const rangeBy = new Map(inRange.map(r => [String(r._id), r]));

  const rows = boxes
    .filter(b => b.location) // boxes of a deleted location
    .map(b => ({
      boxId: String(b._id),
      locationId: String(b.location._id),
      location: b.location.name,
      label: b.label,
      size: b.size,
      active: b.active !== false,
      lastRefilled: lastBy.get(String(b._id)) || null,
      refills: rangeBy.get(String(b._id))?.refills || 0,
      amount: Math.round((rangeBy.get(String(b._id))?.amount || 0) * 100) / 100,
    }))
    .sort((a, b) => a.location.localeCompare(b.location) || a.label.localeCompare(b.label, undefined, { numeric: true }));

  const locations = new Map();
  for (const r of rows) {
    if (!locations.has(r.locationId)) locations.set(r.locationId, { locationId: r.locationId, location: r.location, active: 0, retired: 0 });
    locations.get(r.locationId)[r.active ? 'active' : 'retired']++;
  }

  return {
    rows,
    locations: [...locations.values()],
    totals: {
      locations: locations.size,
      active: rows.filter(r => r.active).length,
      retired: rows.filter(r => !r.active).length,
      refills: rows.reduce((s, r) => s + r.refills, 0),
      amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    }
  };
}
