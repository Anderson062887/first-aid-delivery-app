import Delivery from '../../src/models/Delivery.js';
import Item from '../../src/models/Item.js';
import Location from '../../src/models/Location.js';
import Box from '../../src/models/Box.js';
import Visit from '../../src/models/Visit.js';
import User from '../../src/models/User.js';
import { createUser, createLocation, createBox, createItem, createVisit } from '../helpers/fixtures.js';
import { backfillDeliveryRep } from '../../src/maintenance/backfillDeliveryRep.js';

describe('backfillDeliveryRep', () => {
  it('fills rep from the visit or a unique name, and only writes with apply', async () => {
    const ann = await createUser(User, { name: 'Ann', email: 'ann@example.com' });
    const sam1 = await createUser(User, { name: 'Sam', email: 's1@example.com' });
    await createUser(User, { name: 'Sam', email: 's2@example.com' });
    const location = await createLocation(Location);
    const box = await createBox(Box, location._id);
    const item = await createItem(Item);
    const make = (extra) => Delivery.create({
      location: location._id, box: box._id,
      lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 1, lineTotal: 1 }],
      subtotal: 1, tax: 0, total: 1, ...extra
    });

    const visit = await createVisit(Visit, sam1._id, location._id);
    const onVisit = await make({ visit: visit._id, repName: 'Sam' });
    const byName = await make({ repName: 'Ann' });
    const ambiguous = await make({ repName: 'Sam' });
    const stranger = await make({ repName: 'Nobody' });
    const done = await make({ repName: 'Ann', rep: sam1._id }); // already set: untouched

    const dry = await backfillDeliveryRep();
    expect(dry).toMatchObject({ applied: false, fromVisit: 1, fromName: 1 });
    expect(dry.unresolved).toEqual(expect.arrayContaining([
      { repName: 'Sam', deliveries: 1, reason: '2 users have this name' },
      { repName: 'Nobody', deliveries: 1, reason: 'no user has this name' }
    ]));
    expect(await Delivery.countDocuments({ rep: { $ne: null } })).toBe(1);

    await backfillDeliveryRep({ apply: true });
    const repOf = async (d) => String((await Delivery.findById(d._id)).rep ?? '');
    expect(await repOf(onVisit)).toBe(String(sam1._id));
    expect(await repOf(byName)).toBe(String(ann._id));
    expect(await repOf(ambiguous)).toBe('');
    expect(await repOf(stranger)).toBe('');
    expect(await repOf(done)).toBe(String(sam1._id));
  });
});
