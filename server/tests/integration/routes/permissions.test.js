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

describe('Permissions and data integrity', () => {
  let admin, rep, otherRep, location, box, item;
  let adminCookie, repCookie;

  const line = (it = item) => ({ item: it._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 });
  const makeDelivery = (visit, overrides = {}) => Delivery.create({
    location: location._id, box: box._id, visit: visit?._id,
    lines: [line()], subtotal: 10, tax: 0, total: 10, ...overrides
  });

  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    rep = await createUser(User, { name: 'Rep', email: 'rep@example.com', roles: ['rep'] });
    otherRep = await createUser(User, { name: 'Other', email: 'other@example.com', roles: ['rep'] });
    location = await createLocation(Location);
    box = await createBox(Box, location._id);
    item = await createItem(Item);
    adminCookie = authCookie(admin);
    repCookie = authCookie(rep);
  });

  // ---------------------------------------------------------------- #9
  describe('role and ownership checks', () => {
    it('only admins can create, edit or delete locations', async () => {
      await request(app).post('/api/locations').set('Cookie', repCookie).send({ name: 'X' }).expect(403);
      await request(app).put(`/api/locations/${location._id}`).set('Cookie', repCookie).send({ name: 'X' }).expect(403);
      await request(app).delete(`/api/locations/${location._id}`).set('Cookie', repCookie).expect(403);

      await request(app).post('/api/locations').set('Cookie', adminCookie).send({ name: 'New' }).expect(201);
      await request(app).put(`/api/locations/${location._id}`).set('Cookie', adminCookie).send({ name: 'Renamed' }).expect(200);
    });

    it("a rep cannot change or submit another rep's visit", async () => {
      const theirs = await createVisit(Visit, otherRep._id, location._id);

      await request(app).patch(`/api/visits/${theirs._id}`).set('Cookie', repCookie).send({ note: 'x' }).expect(403);
      await request(app).patch(`/api/visits/${theirs._id}/note`).set('Cookie', repCookie).send({ note: 'x' }).expect(403);
      await request(app).post(`/api/visits/${theirs._id}/submit`).set('Cookie', repCookie).send({ outcome: 'skipped' }).expect(403);

      const unchanged = await Visit.findById(theirs._id).lean();
      expect(unchanged.status).toBe('open');

      // admins can
      await request(app).post(`/api/visits/${theirs._id}/submit`).set('Cookie', adminCookie).send({ outcome: 'skipped' }).expect(200);
    });

    it("a rep cannot add deliveries to another rep's visit", async () => {
      const theirs = await createVisit(Visit, otherRep._id, location._id);
      const res = await request(app).post('/api/deliveries').set('Cookie', repCookie).send({
        location: String(location._id), box: String(box._id), visit: String(theirs._id),
        lines: [{ item: String(item._id), quantity: 1, packaging: 'each' }]
      }).expect(403);
      expect(res.body.error).toMatch(/your own visits/);
    });

    it('rejects deliveries for a submitted visit', async () => {
      const mine = await createVisit(Visit, rep._id, location._id, { status: 'submitted', submittedAt: new Date() });
      const res = await request(app).post('/api/deliveries').set('Cookie', repCookie).send({
        location: String(location._id), box: String(box._id), visit: String(mine._id),
        lines: [{ item: String(item._id), quantity: 1, packaging: 'each' }]
      }).expect(409);
      expect(res.body.error).toMatch(/already submitted/);
    });

    it("rejects a box from a different location, or a visit at a different location", async () => {
      const elsewhere = await createLocation(Location, { name: 'Elsewhere' });
      const foreignBox = await createBox(Box, elsewhere._id);

      const res = await request(app).post('/api/deliveries').set('Cookie', repCookie).send({
        location: String(location._id), box: String(foreignBox._id),
        lines: [{ item: String(item._id), quantity: 1, packaging: 'each' }]
      }).expect(400);
      expect(res.body.error).toMatch(/does not belong to this location/);

      const visitElsewhere = await createVisit(Visit, rep._id, elsewhere._id);
      const res2 = await request(app).post('/api/deliveries').set('Cookie', repCookie).send({
        location: String(location._id), box: String(box._id), visit: String(visitElsewhere._id),
        lines: [{ item: String(item._id), quantity: 1, packaging: 'each' }]
      }).expect(400);
      expect(res2.body.error).toMatch(/different location/);
    });

    it('a rep can edit deliveries only on their own open visit; admins can edit any', async () => {
      const edit = (d, cookie) => request(app).patch(`/api/deliveries/${d._id}`).set('Cookie', cookie)
        .send({ lines: [{ item: String(item._id), quantity: 2, packaging: 'each' }] });

      const theirs = await makeDelivery(await createVisit(Visit, otherRep._id, location._id));
      await edit(theirs, repCookie).expect(403);

      const noVisit = await makeDelivery(null);
      await edit(noVisit, repCookie).expect(403);

      const openVisit = await createVisit(Visit, rep._id, location._id);
      await edit(await makeDelivery(openVisit), repCookie).expect(200);

      openVisit.status = 'submitted';
      await openVisit.save();
      const afterSubmit = await makeDelivery(openVisit);
      const res = await edit(afterSubmit, repCookie).expect(403);
      expect(res.body.error).toMatch(/already submitted/);

      await edit(afterSubmit, adminCookie).expect(200);
      await edit(theirs, adminCookie).expect(200);
    });
  });

  // ---------------------------------------------------------------- #10
  describe('deleting records that history depends on', () => {
    it('refuses to delete an item used in deliveries, allows an unused one', async () => {
      await makeDelivery(null);
      const res = await request(app).delete(`/api/items/${item._id}`).set('Cookie', adminCookie).expect(409);
      expect(res.body.error).toMatch(/Active/);
      expect(await Item.findById(item._id)).not.toBeNull();

      const unused = await createItem(Item, { name: 'Unused', sku: 'UNUSED' });
      await request(app).delete(`/api/items/${unused._id}`).set('Cookie', adminCookie).expect(200);
    });

    it('refuses to delete a location with history; otherwise deletes it and its boxes', async () => {
      await createVisit(Visit, rep._id, location._id);
      await request(app).delete(`/api/locations/${location._id}`).set('Cookie', adminCookie).expect(409);

      const empty = await createLocation(Location, { name: 'Empty' });
      await createBox(Box, empty._id);
      await request(app).delete(`/api/locations/${empty._id}`).set('Cookie', adminCookie).expect(204);
      expect(await Box.countDocuments({ location: empty._id })).toBe(0);
    });

    it('refuses to delete a user with visits', async () => {
      await createVisit(Visit, rep._id, location._id);
      const res = await request(app).delete(`/api/users/${rep._id}`).set('Cookie', adminCookie).expect(409);
      expect(res.body.error).toMatch(/Deactivate/);

      await request(app).delete(`/api/users/${otherRep._id}`).set('Cookie', adminCookie).expect(200);
    });
  });

  // ---------------------------------------------------------------- #11
  describe('sessions follow the database', () => {
    it('a deactivated user is logged out immediately', async () => {
      await User.updateOne({ _id: rep._id }, { active: false });

      await request(app).get('/api/items').set('Cookie', repCookie).expect(401);
      const me = await request(app).get('/api/auth/me').set('Cookie', repCookie).expect(200);
      expect(me.body).toBeNull();
    });

    it('a deleted user is logged out immediately', async () => {
      await User.deleteOne({ _id: otherRep._id });
      await request(app).get('/api/items').set('Cookie', authCookie(otherRep)).expect(401);
    });

    it('role changes apply without logging in again', async () => {
      const secondAdmin = await createUser(User, { name: 'Admin 2', email: 'admin2@example.com', roles: ['admin'] });
      const cookie = authCookie(secondAdmin); // token says admin
      await request(app).get('/api/users').set('Cookie', cookie).expect(200);

      await User.updateOne({ _id: secondAdmin._id }, { roles: ['rep'] });
      await request(app).get('/api/users').set('Cookie', cookie).expect(403);
      const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body.roles).toEqual(['rep']);
    });
  });

  // ---------------------------------------------------------------- #12
  describe('admin lockout and password rules', () => {
    it('cannot demote or deactivate the last active admin', async () => {
      const demote = await request(app).patch(`/api/users/${admin._id}`).set('Cookie', adminCookie)
        .send({ roles: ['rep'] }).expect(400);
      expect(demote.body.error).toMatch(/last active admin/);

      await request(app).patch(`/api/users/${admin._id}`).set('Cookie', adminCookie)
        .send({ active: false }).expect(400);

      const fresh = await User.findById(admin._id).lean();
      expect(fresh.roles).toEqual(['admin']);
      expect(fresh.active).toBe(true);
    });

    it('can demote an admin when another active admin exists', async () => {
      await createUser(User, { name: 'Admin 2', email: 'admin2@example.com', roles: ['admin'] });
      await request(app).patch(`/api/users/${admin._id}`).set('Cookie', adminCookie)
        .send({ roles: ['rep'] }).expect(200);
    });

    it('an inactive admin does not count as the remaining admin', async () => {
      await createUser(User, { name: 'Old', email: 'old@example.com', roles: ['admin'], active: false });
      await request(app).patch(`/api/users/${admin._id}`).set('Cookie', adminCookie)
        .send({ active: false }).expect(400);
    });

    it('enforces password strength when creating or resetting via /api/users', async () => {
      const create = await request(app).post('/api/users').set('Cookie', adminCookie)
        .send({ name: 'Weak', email: 'weak@example.com', password: '123' }).expect(400);
      expect(create.body.error).toMatch(/at least 8 characters/);

      const reset = await request(app).patch(`/api/users/${rep._id}`).set('Cookie', adminCookie)
        .send({ password: 'alllowercase1' }).expect(400);
      expect(reset.body.error).toMatch(/uppercase/);

      await request(app).patch(`/api/users/${rep._id}`).set('Cookie', adminCookie)
        .send({ password: 'Strong1pass' }).expect(200);
    });
  });
});
