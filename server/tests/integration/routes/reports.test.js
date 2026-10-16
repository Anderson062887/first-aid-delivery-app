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

describe('Reports API', () => {
  let alice, bob, location, boxes, item, cookie;

  const deliver = (visit, box, total) => Delivery.create({
    repName: visit.repName,
    location: location._id,
    box: box._id,
    visit: visit._id,
    lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: total, lineTotal: total }],
    subtotal: total, tax: 0, total
  });

  const submitted = (rep, outcome) => createVisit(Visit, rep._id, location._id, {
    status: 'submitted', outcome, submittedAt: new Date()
  });

  beforeEach(async () => {
    alice = await createUser(User, { name: 'Alice', email: 'alice@example.com', roles: ['admin', 'rep'] });
    bob = await createUser(User, { name: 'Bob', email: 'bob@example.com' });
    location = await createLocation(Location);
    boxes = await Promise.all([1, 2, 3].map(n => createBox(Box, location._id, { label: `Box ${n}` })));
    item = await createItem(Item);
    cookie = authCookie(alice);

    // Alice: one completed visit refilling all 3 boxes
    const v1 = await submitted(alice, 'completed');
    for (const b of boxes) await deliver({ _id: v1._id, repName: 'Alice' }, b, 10);

    // Alice: one partial visit refilling 1 box
    const v2 = await submitted(alice, 'partial');
    await deliver({ _id: v2._id, repName: 'Alice' }, boxes[0], 5);

    // Bob: no access and skipped -> no deliveries at all
    await submitted(bob, 'no_access');
    await submitted(bob, 'skipped');

    // Bob: a visit still in progress must not count as an outcome
    await createVisit(Visit, bob._id, location._id);
  });

  describe('GET /api/reports/outcomes', () => {
    it('counts each submitted visit once, including visits without deliveries', async () => {
      const res = await request(app)
        .get('/api/reports/outcomes')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.counts).toEqual({
        completed: 1, // not 3 (one per box)
        partial: 1,
        no_access: 1,
        skipped: 1,
        other: 0
      });
    });

    it('filters by submitted date', async () => {
      const res = await request(app)
        .get('/api/reports/outcomes?from=2000-01-01&to=2000-01-02')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.counts).toEqual({ completed: 0, partial: 0, no_access: 0, skipped: 0, other: 0 });
    });
  });

  describe('GET /api/reports/rep-productivity', () => {
    it('takes money from deliveries and outcomes from visits', async () => {
      const res = await request(app)
        .get('/api/reports/rep-productivity')
        .set('Cookie', cookie)
        .expect(200);

      const byName = Object.fromEntries(res.body.rows.map(r => [r.repName, r]));

      expect(byName.Alice).toMatchObject({
        visitCount: 2, deliveries: 4, total: 35,
        completed: 1, partial: 1, no_access: 0, skipped: 0, other: 0
      });
      expect(byName.Bob).toMatchObject({
        visitCount: 2, deliveries: 0, total: 0,
        completed: 0, partial: 0, no_access: 1, skipped: 1, other: 0
      });
    });
  });

  describe('reps only see their own numbers', () => {
    it('limits every report to the logged-in rep; admins see everyone', async () => {
      // A visit-less delivery recorded under Bob's name counts for Bob
      await Delivery.create({
        repName: 'Bob', location: location._id, box: boxes[0]._id,
        lines: [{ item: item._id, quantity: 2, packaging: 'each', unitPrice: 7, lineTotal: 14 }],
        subtotal: 14, tax: 0, total: 14
      });
      const bobCookie = authCookie(bob);

      const prod = await request(app).get('/api/reports/rep-productivity').set('Cookie', bobCookie).expect(200);
      expect(prod.body.rows.map(r => r.repName)).toEqual(['Bob']);
      expect(prod.body.rows[0]).toMatchObject({ total: 14, deliveries: 1, no_access: 1, skipped: 1 });

      const outcomes = await request(app).get('/api/reports/outcomes').set('Cookie', bobCookie).expect(200);
      expect(outcomes.body.counts).toEqual({ completed: 0, partial: 0, no_access: 1, skipped: 1, other: 0 });

      const items = await request(app).get('/api/reports/items-usage').set('Cookie', bobCookie).expect(200);
      expect(items.body.rows).toEqual([expect.objectContaining({ each: 2, cases: 0, units: 2, amount: 14 })]);

      // Alice is an admin: everyone, including Bob
      const all = await request(app).get('/api/reports/rep-productivity').set('Cookie', cookie).expect(200);
      expect(all.body.rows.map(r => r.repName).sort()).toEqual(['Alice', 'Bob']);
    });
  });
});
