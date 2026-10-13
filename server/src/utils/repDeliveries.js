import Visit from '../models/Visit.js';
import User from '../models/User.js';

/**
 * Mongo filter for the deliveries that belong to one rep: those on their visits,
 * those recorded with their account (`rep`), and older visit-less deliveries
 * that only stored a name (matched exactly, since that's all they have).
 */
export async function repDeliveriesFilter(repId, repName) {
  const [visitIds, user] = await Promise.all([
    Visit.find({ rep: repId }).distinct('_id'),
    repName === undefined ? User.findById(repId, 'name').lean() : null
  ]);
  const name = repName ?? user?.name;

  const or = [{ visit: { $in: visitIds } }, { rep: repId }];
  if (name) or.push({ visit: null, rep: null, repName: name });
  return { $or: or };
}

const idOf = (x) => String(x?._id ?? x ?? '');

/**
 * Whether a delivery belongs to this user (same rules as repDeliveriesFilter).
 * `d.visit` must be populated with its rep when present.
 */
export function isOwnDelivery(user, d) {
  const me = idOf(user?._id);
  if (!me) return false;
  if (d.rep) return idOf(d.rep) === me;
  if (d.visit) return idOf(d.visit.rep) === me;
  return !!d.repName && d.repName === user.name;
}
