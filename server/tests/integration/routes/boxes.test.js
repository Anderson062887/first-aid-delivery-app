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

describe('Boxes API', () => {
  let admin, rep, location, box, item, adminCookie, repCookie;

  const deliverTo = (b, visit) => Delivery.create({
    location: location._id, box: b._id, visit: visit?._id,
    lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
    subtotal: 10, tax: 0, total: 10
  });

  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    rep = await createUser(User, { name: 'Rep', email: 'rep@example.com', roles: ['rep'] });
    location = await createLocation(Location);
    box = await createBox(Box, location._id, { label: 'Box 1' });
    item = await createItem(Item);
    adminCookie = authCookie(admin);
    repCookie = authCookie(rep);
  });

  describe('managing boxes', () => {
    it('admins can add a box; the label defaults to the next number', async () => {
      const res = await request(app).post('/api/boxes').set('Cookie', adminCookie)
        .send({ location: String(location._id), size: 'L' }).expect(201);
      expect(res.body).toMatchObject({ label: 'Box 2', size: 'L', active: true });

      await request(app).post('/api/boxes').set('Cookie', adminCookie)
        .send({ location: String(location._id), size: 'HUGE' }).expect(400);
    });

    it('admins can rename and resize a box', async () => {
      const res = await request(app).patch(`/api/boxes/${box._id}`).set('Cookie', adminCookie)
        .send({ label: 'Kitchen', size: 'XL' }).expect(200);
      expect(res.body).toMatchObject({ label: 'Kitchen', size: 'XL' });

      await request(app).patch(`/api/boxes/${box._id}`).set('Cookie', adminCookie)
        .send({ label: '  ' }).expect(400);
    });

    it('reps cannot add, change or delete boxes', async () => {
      await request(app).post('/api/boxes').set('Cookie', repCookie)
        .send({ location: String(location._id), size: 'S' }).expect(403);
      await request(app).patch(`/api/boxes/${box._id}`).set('Cookie', repCookie)
        .send({ active: false }).expect(403);
      await request(app).delete(`/api/boxes/${box._id}`).set('Cookie', repCookie).expect(403);
    });

    it('deletes an unused box but refuses one with delivery history', async () => {
      await deliverTo(box);
      const res = await request(app).delete(`/api/boxes/${box._id}`).set('Cookie', adminCookie).expect(409);
      expect(res.body.error).toMatch(/Retire/);

      const unused = await createBox(Box, location._id);
      await request(app).delete(`/api/boxes/${unused._id}`).set('Cookie', adminCookie).expect(204);
      expect(await Box.findById(unused._id)).toBeNull();
    });
  });

  describe('retired boxes', () => {
    let retired;
    beforeEach(async () => {
      retired = await createBox(Box, location._id, { label: 'Gone', active: false });
    });

    it('are hidden from the list unless all=1', async () => {
      const res = await request(app).get(`/api/boxes?location=${location._id}`).set('Cookie', repCookie).expect(200);
      expect(res.body.map(b => b.label)).toEqual(['Box 1']);

      const all = await request(app).get(`/api/boxes?location=${location._id}&all=1`).set('Cookie', adminCookie).expect(200);
      expect(all.body.map(b => b.label)).toEqual(['Box 1', 'Gone']);
    });

    it('do not block submitting a visit as completed', async () => {
      const visit = await createVisit(Visit, rep._id, location._id);
      await deliverTo(box, visit);

      const detail = await request(app).get(`/api/visits/${visit._id}`).set('Cookie', repCookie).expect(200);
      expect(detail.body.boxes.map(b => b.label)).toEqual(['Box 1']);

      await request(app).post(`/api/visits/${visit._id}/submit`).set('Cookie', repCookie)
        .send({ outcome: 'completed' }).expect(200);
    });

    it('cannot receive new deliveries', async () => {
      const res = await request(app).post('/api/deliveries').set('Cookie', repCookie).send({
        location: String(location._id), box: String(retired._id),
        lines: [{ item: String(item._id), quantity: 1, packaging: 'each' }]
      }).expect(400);
      expect(res.body.error).toMatch(/retired/);
    });

    it('can be restored', async () => {
      await request(app).patch(`/api/boxes/${retired._id}`).set('Cookie', adminCookie)
        .send({ active: true }).expect(200);
      const res = await request(app).get(`/api/boxes?location=${location._id}`).set('Cookie', repCookie).expect(200);
      expect(res.body).toHaveLength(2);
    });
  });

  it('returns 404 for a malformed id instead of 500', async () => {
    await request(app).get('/api/boxes/not-an-id').set('Cookie', repCookie).expect(404);
  });
});
