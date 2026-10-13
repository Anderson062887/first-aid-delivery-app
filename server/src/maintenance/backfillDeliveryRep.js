import Delivery from '../models/Delivery.js';
import Visit from '../models/Visit.js';
import User from '../models/User.js';

/**
 * Fill in `rep` on deliveries saved before it existed.
 * - With a visit: the visit's rep (exact).
 * - Without a visit: the user with that repName, only if exactly one user has it.
 * Nothing is written unless apply is true. Returns a summary.
 */
export async function backfillDeliveryRep({ apply = false } = {}) {
  const missing = { $or: [{ rep: { $exists: false } }, { rep: null }] };
  const updates = [];

  // 1) Deliveries on a visit
  const onVisit = await Delivery.find({ ...missing, visit: { $ne: null } }, 'visit').lean();
  const visitIds = [...new Set(onVisit.map(d => String(d.visit)))];
  const repOfVisit = new Map(
    (await Visit.find({ _id: { $in: visitIds } }, 'rep').lean()).map(v => [String(v._id), v.rep])
  );
  let fromVisit = 0;
  const visitMissing = [];
  for (const d of onVisit) {
    const rep = repOfVisit.get(String(d.visit));
    if (rep) { updates.push({ id: d._id, rep }); fromVisit++; }
    else visitMissing.push(String(d._id));
  }

  // 2) Visit-less deliveries: match the stored name to exactly one user
  const byName = await Delivery.aggregate([
    { $match: { ...missing, visit: null } },
    { $group: { _id: '$repName', ids: { $push: '$_id' } } }
  ]);
  const users = await User.find({ name: { $in: byName.map(g => g._id).filter(Boolean) } }, 'name').lean();
  let fromName = 0;
  const unresolved = []; // { repName, deliveries, reason }
  for (const g of byName) {
    const matches = users.filter(u => u.name === g._id);
    if (g._id && matches.length === 1) {
      for (const id of g.ids) updates.push({ id, rep: matches[0]._id });
      fromName += g.ids.length;
    } else {
      unresolved.push({
        repName: g._id || '(none)',
        deliveries: g.ids.length,
        reason: matches.length > 1 ? `${matches.length} users have this name` : 'no user has this name'
      });
    }
  }

  if (apply && updates.length) {
    await Delivery.bulkWrite(updates.map(u => ({
      updateOne: { filter: { _id: u.id, ...missing }, update: { $set: { rep: u.rep } } }
    })));
  }

  return { applied: apply, fromVisit, fromName, visitMissing, unresolved };
}
