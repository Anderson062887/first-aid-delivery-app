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
