import request from 'supertest';
import app from '../../../src/app.js';
import Delivery from '../../../src/models/Delivery.js';
import Item from '../../../src/models/Item.js';
import Location from '../../../src/models/Location.js';
import Box from '../../../src/models/Box.js';
import User from '../../../src/models/User.js';
import { createUser, createLocation, createBox, createItem } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

describe('Input checks that keep records whole', () => {
  let admin, rep, adminCookie;

  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    rep = await createUser(User, { name: 'Rep', email: 'rep@example.com', roles: ['rep'] });
    adminCookie = authCookie(admin);
  });

  describe('editing a delivery', () => {
    it('refuses to remove every line', async () => {
      const location = await createLocation(Location);
      const box = await createBox(Box, location._id);
      const item = await createItem(Item, { pricePerPack: 10 });
      const delivery = await Delivery.create({
        location: location._id, box: box._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      const res = await request(app).patch(`/api/deliveries/${delivery._id}`)
        .set('Cookie', adminCookie).send({ lines: [] }).expect(400);
      expect(res.body.error).toMatch(/at least one/);

      const after = await Delivery.findById(delivery._id).lean();
      expect(after.lines).toHaveLength(1);
      expect(after.total).toBe(10);
    });
  });

  describe('creating a location', () => {
    const post = (body) => request(app).post('/api/locations').set('Cookie', adminCookie).send(body);

    it('creates the location and its boxes', async () => {
      const res = await post({ name: 'Plant', boxCount: 2, boxSizes: ['S', 'XL'], boxLabelPrefix: 'Cab' }).expect(201);
      const boxes = await Box.find({ location: res.body._id }).sort({ label: 1 }).lean();
      expect(boxes.map(b => [b.label, b.size])).toEqual([['Cab 1', 'S'], ['Cab 2', 'XL']]);
    });

    it('a bad box size saves nothing', async () => {
      const res = await post({ name: 'Plant', boxCount: 2, boxSizes: ['M', 'HUGE'] }).expect(400);
      expect(res.body.error).toMatch(/Box size/);
      expect(await Location.countDocuments({ name: 'Plant' })).toBe(0);
      expect(await Box.countDocuments()).toBe(0);
    });

    it('a box count that is not a number saves nothing', async () => {
      await post({ name: 'Plant', boxCount: 'lots' }).expect(400);
      await post({ name: 'Plant', boxCount: 2.5 }).expect(400);
      await post({ name: 'Plant', boxCount: 21 }).expect(400);
      expect(await Location.countDocuments({ name: 'Plant' })).toBe(0);
    });

    it('still allows a location with no boxes', async () => {
      const res = await post({ name: 'Plant' }).expect(201);
      expect(await Box.countDocuments({ location: res.body._id })).toBe(0);
    });

    it('requires a text name', async () => {
      await post({ name: { $gt: '' } }).expect(400);
      await post({ name: '   ' }).expect(400);
    });
  });

  describe('deleting a user', () => {
    it('refuses when the user has deliveries outside any visit', async () => {
      const location = await createLocation(Location);
      const box = await createBox(Box, location._id);
      const item = await createItem(Item);
      await Delivery.create({
        location: location._id, box: box._id, rep: rep._id, repName: 'Rep',
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      const res = await request(app).delete(`/api/users/${rep._id}`).set('Cookie', adminCookie).expect(409);
      expect(res.body.error).toMatch(/1 delivery\(ies\).*Deactivate/);
      expect(await User.exists({ _id: rep._id })).toBeTruthy();
    });
  });
});
