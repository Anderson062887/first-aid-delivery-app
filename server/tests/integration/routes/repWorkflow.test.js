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

describe('Rep workflow', () => {
  let admin, rep, other, repCookie, location, boxes, gloves, wipes;
  const refill = (visit, box, lines, deliveredAt = new Date()) => Delivery.create({
    location: location._id, box: box._id, visit: visit?._id, rep: rep._id, lines,
    subtotal: 1, tax: 0, total: 1, deliveredAt
  });
  const gl = (q) => ({ item: gloves._id, quantity: q, packaging: 'case', unitPrice: 10, lineTotal: 10 * q });
  const wp = (q) => ({ item: wipes._id, quantity: q, packaging: 'each', unitPrice: 0.5, lineTotal: 0.5 * q });

  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    rep = await createUser(User, { name: 'Riley', email: 'riley@example.com' });
    other = await createUser(User, { name: 'Other', email: 'other@example.com' });
    repCookie = authCookie(rep);
    location = await createLocation(Location, { name: 'Plant' });
    boxes = await Promise.all([1, 2, 3].map(n => createBox(Box, location._id, { label: `Box ${n}` })));
    gloves = await createItem(Item, { name: 'Gloves', packaging: 'case', unitsPerPack: 50, pricePerPack: 10 });
    wipes = await createItem(Item, { name: 'Wipes', packaging: 'each', unitsPerPack: 1, pricePerPack: 0.5 });
  });

  describe('GET /api/boxes/:id/last-refill', () => {
    it("starts from the box's most recent refill", async () => {
      await refill(null, boxes[0], [gl(1)], new Date('2026-09-01'));
      await refill(null, boxes[0], [gl(2), wp(10)], new Date('2026-10-01'));
      const res = await request(app).get(`/api/boxes/${boxes[0]._id}/last-refill`).set('Cookie', repCookie).expect(200);
      expect(res.body.source).toBe('last-refill');
      expect(res.body.lines).toEqual([
        { item: String(gloves._id), packaging: 'case', quantity: 2 },
        { item: String(wipes._id), packaging: 'each', quantity: 10 },
      ]);
    });

    it('falls back to standard contents, and leaves out inactive items', async () => {
      await Box.updateOne({ _id: boxes[1]._id }, { items: [{ item: gloves._id, par: 1 }, { item: wipes._id, par: 20 }] });
      await Item.updateOne({ _id: gloves._id }, { active: false });
      const res = await request(app).get(`/api/boxes/${boxes[1]._id}/last-refill`).set('Cookie', repCookie).expect(200);
      expect(res.body).toMatchObject({ source: 'standard', lines: [{ item: String(wipes._id), packaging: 'each', quantity: 20 }] });
    });

    it('is empty for a box with no history or contents', async () => {
      const res = await request(app).get(`/api/boxes/${boxes[2]._id}/last-refill`).set('Cookie', repCookie).expect(200);
      expect(res.body).toEqual({ source: null, date: null, lines: [] });
    });
  });

  describe('visits started by mistake', () => {
    it('my-open lists my visits with progress, but not ones with nothing refilled', async () => {
      const busy = await createVisit(Visit, rep._id, location._id);
      await refill(busy, boxes[0], [gl(1)]);
      const other2 = await createLocation(Location, { name: 'Office' });
      await createVisit(Visit, rep._id, other2._id);              // empty: started by mistake
      await createVisit(Visit, other._id, location._id);          // someone else's
      const res = await request(app).get('/api/visits/my-open').set('Cookie', repCookie).expect(200);
      expect(res.body).toEqual([expect.objectContaining({ boxesDone: 1, boxesTotal: 3, location: expect.objectContaining({ name: 'Plant' }) })]);
    });

    it('recent visits leave out empty open visits but still show two real ones', async () => {
      await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'completed', submittedAt: new Date('2026-09-01') });
      await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'partial', submittedAt: new Date('2026-10-01') });
      await createVisit(Visit, rep._id, location._id, { startedAt: new Date() }); // empty, newest
      const res = await request(app).get('/api/visits/recent-by-location?per=2').set('Cookie', repCookie).expect(200);
      expect(res.body[String(location._id)].map(v => v.outcome)).toEqual(['partial', 'completed']);
    });

    it('location history leaves out empty open visits', async () => {
      await createVisit(Visit, rep._id, location._id);
      const res = await request(app).get(`/api/reports/location-history?location=${location._id}`).set('Cookie', authCookie(admin)).expect(200);
      expect(res.body.rows).toEqual([]);
    });

    it('an empty open visit can be cancelled by its rep', async () => {
      const v = await createVisit(Visit, rep._id, location._id);
      await request(app).delete(`/api/visits/${v._id}`).set('Cookie', repCookie).expect(200);
      expect(await Visit.exists({ _id: v._id })).toBeNull();
    });

    it("can't cancel once a box is refilled, once submitted, or someone else's", async () => {
      const busy = await createVisit(Visit, rep._id, location._id);
      await refill(busy, boxes[0], [gl(1)]);
      await request(app).delete(`/api/visits/${busy._id}`).set('Cookie', repCookie).expect(409);

      const done = await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'no_access', submittedAt: new Date() });
      await request(app).delete(`/api/visits/${done._id}`).set('Cookie', repCookie).expect(409);

      const theirs = await createVisit(Visit, other._id, location._id);
      await request(app).delete(`/api/visits/${theirs._id}`).set('Cookie', repCookie).expect(403);
      expect(await Visit.countDocuments()).toBe(3);
    });
  });
});
