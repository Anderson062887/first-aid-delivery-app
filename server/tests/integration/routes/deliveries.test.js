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

describe('Deliveries API', () => {
  let user, location, box, item, visit, cookie;

  beforeEach(async () => {
    user = await createUser(User, { roles: ['admin', 'rep'] });
    location = await createLocation(Location);
    box = await createBox(Box, location._id);
    item = await createItem(Item, { pricePerPack: 25.00, packaging: 'each' });
    visit = await createVisit(Visit, user._id, location._id);
    cookie = authCookie(user);
  });

  describe('POST /api/deliveries', () => {
    it('should create delivery with valid data', async () => {
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        visit: visit._id.toString(),
        lines: [
          { item: item._id.toString(), quantity: 2, packaging: 'each' }
        ]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0].quantity).toBe(2);
      expect(res.body.lines[0].unitPrice).toBe(25);
      expect(res.body.lines[0].lineTotal).toBe(50);
      expect(res.body.total).toBe(50);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/deliveries')
        .send({ location: location._id.toString(), box: box._id.toString(), lines: [] })
        .expect(401);
    });

    it('should reject delivery without location', async () => {
      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send({ box: box._id.toString(), lines: [{ item: item._id.toString(), quantity: 1 }] })
        .expect(400);

      expect(res.body.error).toBe('location is required');
    });

    it('should reject delivery without box', async () => {
      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send({ location: location._id.toString(), lines: [{ item: item._id.toString(), quantity: 1 }] })
        .expect(400);

      expect(res.body.error).toBe('box is required');
    });

    it('should reject empty lines', async () => {
      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send({ location: location._id.toString(), box: box._id.toString(), lines: [] })
        .expect(400);

      expect(res.body.error).toBe('lines must have at least one item');
    });

    it('should reject non-integer quantity for "each" packaging', async () => {
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        lines: [{ item: item._id.toString(), quantity: 1.5, packaging: 'each' }]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);

      expect(res.body.error).toContain('whole number');
    });

    it('should allow fractional quantity for "case" packaging', async () => {
      const caseItem = await createItem(Item, { packaging: 'case', pricePerPack: 100 });
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        lines: [{ item: caseItem._id.toString(), quantity: 0.5, packaging: 'case' }]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(201);

      expect(res.body.lines[0].quantity).toBe(0.5);
      expect(res.body.lines[0].lineTotal).toBe(50);
    });

    it('should calculate totals correctly with multiple lines', async () => {
      const item2 = await createItem(Item, { pricePerPack: 15.00 });
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        lines: [
          { item: item._id.toString(), quantity: 2, packaging: 'each' },
          { item: item2._id.toString(), quantity: 3, packaging: 'each' }
        ]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(201);

      expect(res.body.subtotal).toBe(95); // 50 + 45
      expect(res.body.total).toBe(95);
    });

    it('should reject invalid item ID', async () => {
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        lines: [{ item: '507f1f77bcf86cd799439011', quantity: 1 }]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);

      expect(res.body.error).toContain('Item not found');
    });

    it('should reject zero or negative quantity', async () => {
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        lines: [{ item: item._id.toString(), quantity: 0 }]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);

      expect(res.body.error).toContain('quantity must be > 0');
    });

    it('should associate rep name from visit', async () => {
      user.name = 'Rep Name From User';
      await user.save();

      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        visit: visit._id.toString(),
        lines: [{ item: item._id.toString(), quantity: 1 }]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(201);

      expect(res.body.repName).toBe('Rep Name From User');
    });
  });

  describe('GET /api/deliveries', () => {
    it('should list deliveries with pagination', async () => {
      // Create multiple deliveries
      for (let i = 0; i < 5; i++) {
        await Delivery.create({
          location: location._id,
          box: box._id,
          visit: visit._id,
          lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
          subtotal: 10,
          tax: 0,
          total: 10
        });
      }

      const res = await request(app)
        .get('/api/deliveries?limit=2&page=1')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.pageInfo.total).toBe(5);
      expect(res.body.pageInfo.hasMore).toBe(true);
    });

    it('should filter by location', async () => {
      const location2 = await createLocation(Location, { name: 'Other Location' });
      const box2 = await createBox(Box, location2._id);

      await Delivery.create({
        location: location._id,
        box: box._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      await Delivery.create({
        location: location2._id,
        box: box2._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      const res = await request(app)
        .get(`/api/deliveries?location=${location2._id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].location._id.toString()).toBe(location2._id.toString());
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await Delivery.create({
        location: location._id,
        box: box._id,
        deliveredAt: yesterday,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      await Delivery.create({
        location: location._id,
        box: box._id,
        deliveredAt: new Date(),
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/deliveries?from=${today}&to=${today}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/deliveries')
        .expect(401);
    });
  });

  describe('GET /api/deliveries/:id', () => {
    it('should return delivery with populated fields', async () => {
      const delivery = await Delivery.create({
        location: location._id,
        box: box._id,
        visit: visit._id,
        lines: [{ item: item._id, quantity: 2, packaging: 'each', unitPrice: 25, lineTotal: 50 }],
        subtotal: 50, tax: 0, total: 50
      });

      const res = await request(app)
        .get(`/api/deliveries/${delivery._id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.location.name).toBeDefined();
      expect(res.body.box.label).toBeDefined();
      expect(res.body.lines[0].item.name).toBeDefined();
    });

    it('should return 404 for non-existent delivery', async () => {
      await request(app)
        .get('/api/deliveries/507f1f77bcf86cd799439011')
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  describe('PATCH /api/deliveries/:id', () => {
    it('should update delivery lines and recalculate total', async () => {
      const delivery = await Delivery.create({
        location: location._id,
        box: box._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 25, lineTotal: 25 }],
        subtotal: 25, tax: 0, total: 25
      });

      const res = await request(app)
        .patch(`/api/deliveries/${delivery._id}`)
        .set('Cookie', cookie)
        .send({
          lines: [{ item: item._id.toString(), quantity: 4, packaging: 'each' }]
        })
        .expect(200);

      expect(res.body.lines[0].quantity).toBe(4);
      expect(res.body.total).toBe(100);
    });

    it('should return 404 for non-existent delivery', async () => {
      await request(app)
        .patch('/api/deliveries/507f1f77bcf86cd799439011')
        .set('Cookie', cookie)
        .send({ lines: [] })
        .expect(404);
    });

    it('should reject invalid lines format', async () => {
      const delivery = await Delivery.create({
        location: location._id,
        box: box._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 25, lineTotal: 25 }],
        subtotal: 25, tax: 0, total: 25
      });

      const res = await request(app)
        .patch(`/api/deliveries/${delivery._id}`)
        .set('Cookie', cookie)
        .send({ lines: 'invalid' })
        .expect(400);

      expect(res.body.error).toBe('lines must be an array');
    });
  });
});
