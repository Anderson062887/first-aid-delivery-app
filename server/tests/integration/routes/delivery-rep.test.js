import request from 'supertest';
import app from '../../../src/app.js';
import Delivery from '../../../src/models/Delivery.js';
import Item from '../../../src/models/Item.js';
import Location from '../../../src/models/Location.js';
import Box from '../../../src/models/Box.js';
import Visit from '../../../src/models/Visit.js';
import User from '../../../src/models/User.js';
import { createUser, createLocation, createBox, createItem, createVisit } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

describe('deliveries record the rep account', () => {
  let admin, samA, samB, location, box, item;

  // Two different reps with exactly the same name
  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    samA = await createUser(User, { name: 'Sam', email: 'sam.a@example.com' });
    samB = await createUser(User, { name: 'Sam', email: 'sam.b@example.com' });
    location = await createLocation(Location);
    box = await createBox(Box, location._id);
    item = await createItem(Item, { pricePerPack: 10 });
  });

  const record = (user, extra = {}, quantity = 1) => request(app).post('/api/deliveries')
    .set('Cookie', authCookie(user))
    .send({ location: String(location._id), box: String(box._id), lines: [{ item: String(item._id), quantity, packaging: 'each' }], ...extra })
    .expect(201);

  it("stores the recorder's account, or the visit's rep when there is a visit", async () => {
    const own = await record(samA);
    expect(String(own.body.rep)).toBe(String(samA._id));

    const visit = await createVisit(Visit, samB._id, location._id);
    const byAdmin = await record(admin, { visit: String(visit._id) });
    expect(String(byAdmin.body.rep)).toBe(String(samB._id));
    expect(byAdmin.body.repName).toBe('Sam');
  });

  it('keeps same-name reps apart in reports, exports and the rep filter', async () => {
    await record(samA, {}, 1);   // $10
    await record(samB, {}, 3);   // $30

    // Reports: each Sam only sees their own
    const mine = await request(app).get('/api/reports/rep-productivity').set('Cookie', authCookie(samA)).expect(200);
    expect(mine.body.rows).toEqual([expect.objectContaining({ total: 10 })]);

    // Admin chart: one row per account, not merged by name
    const all = await request(app).get('/api/reports/rep-productivity').set('Cookie', authCookie(admin)).expect(200);
    const sams = all.body.rows.filter(r => r.repName === 'Sam');
    expect(Object.fromEntries(sams.map(r => [r.repId, r.total])))
      .toEqual({ [String(samA._id)]: 10, [String(samB._id)]: 30 });
    expect(sams.map(r => r.repEmail).sort()).toEqual(['sam.a@example.com', 'sam.b@example.com']);

    // reps.csv: two rows with their own RepIDs, nothing left without one
    const csv = await request(app).get('/api/exports/reps.csv').set('Cookie', authCookie(admin)).expect(200);
    const rows = csv.text.trim().split('\n').slice(1).map(l => l.split(','));
    const byId = Object.fromEntries(rows.map(r => [r[0], r[7]]));
    expect(byId).toEqual({ [String(samA._id)]: '10.00', [String(samB._id)]: '30.00' });

    // Deliveries list ?repId= now includes visit-less deliveries
    const list = await request(app).get(`/api/deliveries?repId=${samB._id}`).set('Cookie', authCookie(admin)).expect(200);
    expect(list.body.data.map(d => d.total)).toEqual([30]);
  });

  it('still matches older deliveries that only stored a name', async () => {
    await Delivery.create({
      repName: 'Admin', location: location._id, box: box._id,
      lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 5, lineTotal: 5 }],
      subtotal: 5, tax: 0, total: 5
    });
    const list = await request(app).get(`/api/deliveries?repId=${admin._id}`).set('Cookie', authCookie(admin)).expect(200);
    expect(list.body.data.map(d => d.total)).toEqual([5]);
  });

  describe('reps only see their own deliveries', () => {
    let mine, theirs, theirVisit;
    beforeEach(async () => {
      mine = (await record(samA, {}, 1)).body;
      theirVisit = await createVisit(Visit, samB._id, location._id);
      theirs = (await record(samB, { visit: String(theirVisit._id) }, 3)).body;
    });
    const get = (user, url) => request(app).get(url).set('Cookie', authCookie(user));

    it('in the list and the grouped list, even when asking for another rep', async () => {
      const list = await get(samA, '/api/deliveries').expect(200);
      expect(list.body.data.map(d => d._id)).toEqual([mine._id]);

      const grouped = await get(samA, '/api/deliveries/by-visit').expect(200);
      expect(grouped.body.data.map(g => g.deliveryId)).toEqual([mine._id]);

      const sneaky = await get(samA, `/api/deliveries?repId=${samB._id}`).expect(200);
      expect(sneaky.body.data.map(d => d._id)).toEqual([mine._id]);

      const otherVisit = await get(samA, `/api/deliveries?visit=${theirVisit._id}`).expect(200);
      expect(otherVisit.body.data).toEqual([]);
    });

    it("another rep's delivery is a 404; their own still loads", async () => {
      await get(samA, `/api/deliveries/${theirs._id}`).expect(404);
      await get(samA, `/api/deliveries/${mine._id}`).expect(200);
      await get(samB, `/api/deliveries?visit=${theirVisit._id}`).expect(200)
        .then(res => expect(res.body.data).toHaveLength(1));
    });

    it('admins still see everyone', async () => {
      const list = await get(admin, '/api/deliveries').expect(200);
      expect(list.body.data).toHaveLength(2);
      await get(admin, `/api/deliveries/${theirs._id}`).expect(200);
    });
  });
});
