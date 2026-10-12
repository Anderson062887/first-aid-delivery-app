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

    it('should price "each" as pricePerPack / unitsPerPack and "case" as pricePerPack', async () => {
      const packItem = await createItem(Item, { packaging: 'case', unitsPerPack: 10, pricePerPack: 20 });
      const payload = {
        location: location._id.toString(),
        box: box._id.toString(),
        lines: [
          { item: packItem._id.toString(), quantity: 3, packaging: 'each' },
          { item: packItem._id.toString(), quantity: 2, packaging: 'case' }
        ]
      };

      const res = await request(app)
        .post('/api/deliveries')
        .set('Cookie', cookie)
        .send(payload)
        .expect(201);

      expect(res.body.lines[0].unitPrice).toBe(2);
      expect(res.body.lines[0].lineTotal).toBe(6);
      expect(res.body.lines[1].unitPrice).toBe(20);
      expect(res.body.lines[1].lineTotal).toBe(40);
      expect(res.body.subtotal).toBe(46);
      expect(res.body.total).toBe(46);
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

    it('should filter by visit, regardless of how many other deliveries exist', async () => {
      const otherVisit = await createVisit(Visit, user._id, location._id);
      const line = { item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 };
      const mine = await Delivery.create({
        location: location._id, box: box._id, visit: visit._id,
        lines: [line], subtotal: 10, tax: 0, total: 10,
        deliveredAt: new Date(Date.now() - 86400000) // older than all the others
      });
      // 250 newer deliveries on another visit: more than one page (max limit 200)
      await Delivery.insertMany(Array.from({ length: 250 }, () => ({
        location: location._id, box: box._id, visit: otherVisit._id,
        lines: [line], subtotal: 10, tax: 0, total: 10, deliveredAt: new Date()
      })));

      const res = await request(app)
        .get(`/api/deliveries?visit=${visit._id}&limit=200`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.pageInfo.total).toBe(1);
      expect(res.body.data[0]._id).toBe(mine._id.toString());
    });

    it('should reject an invalid visit id filter', async () => {
      const res = await request(app)
        .get('/api/deliveries?visit=not-an-id')
        .set('Cookie', cookie)
        .expect(400);

      expect(res.body.error).toBe('Invalid visit id');
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

      // "today" as a UTC calendar date, so tell the server the dates are UTC days
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/deliveries?from=${today}&to=${today}&tz=UTC`)
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

  describe('GET /api/deliveries/by-visit', () => {
    const make = (overrides) => Delivery.create({
      location: location._id, box: box._id, repName: 'Alice',
      lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
      subtotal: 10, tax: 0, total: 10, ...overrides
    });
    const at = (min) => new Date(Date.UTC(2026, 0, 1, 12, min));

    it('pages by visit, so a visit is never split and totals cover all its boxes', async () => {
      const older = await createVisit(Visit, user._id, location._id);
      // newest visit: 3 deliveries
      for (const m of [30, 31, 32]) await make({ visit: visit._id, deliveredAt: at(m) });
      // older visit: 2 deliveries
      for (const m of [10, 11]) await make({ visit: older._id, deliveredAt: at(m), total: 5 });

      const page1 = await request(app).get('/api/deliveries/by-visit?limit=1').set('Cookie', cookie).expect(200);
      expect(page1.body.pageInfo).toMatchObject({ total: 2, hasMore: true });
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.data[0]).toMatchObject({ visitId: String(visit._id), boxCount: 3, total: 30 });

      const page2 = await request(app).get('/api/deliveries/by-visit?limit=1&page=2').set('Cookie', cookie).expect(200);
      expect(page2.body.data[0]).toMatchObject({ visitId: String(older._id), boxCount: 2, total: 10 });
      expect(page2.body.pageInfo.hasMore).toBe(false);
    });

    it('lists each delivery without a visit as its own row', async () => {
      const other = await createLocation(Location, { name: 'Other place' });
      const a = await make({ deliveredAt: at(1) });
      const b = await make({ location: other._id, deliveredAt: at(2) });

      const res = await request(app).get('/api/deliveries/by-visit').set('Cookie', cookie).expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.map(g => g.deliveryId)).toEqual([String(b._id), String(a._id)]);
      expect(res.body.data.map(g => g.locationName)).toEqual(['Other place', location.name]);
      expect(res.body.data.every(g => g.visitId === null && g.boxCount === 1)).toBe(true);
    });

    it('applies the same filters as the plain list', async () => {
      await make({ visit: visit._id, repName: 'Alice' });
      await make({ repName: 'Bob' });

      const res = await request(app).get('/api/deliveries/by-visit?repName=bo').set('Cookie', cookie).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].repName).toBe('Bob');

      await request(app).get('/api/deliveries/by-visit?location=nope').set('Cookie', cookie).expect(400);
    });
  });

  describe('rep name search', () => {
    it('treats regex characters literally instead of failing', async () => {
      await Delivery.create({
        location: location._id, box: box._id, repName: 'Ann (North)',
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      for (const url of ['/api/deliveries', '/api/deliveries/by-visit']) {
        const bad = await request(app).get(`${url}?repName=${encodeURIComponent('(')}`).set('Cookie', cookie).expect(200);
        expect(bad.body.data).toHaveLength(1);
        const evil = await request(app).get(`${url}?repName=${encodeURIComponent('(a+)+$')}`).set('Cookie', cookie).expect(200);
        expect(evil.body.data).toHaveLength(0);
      }

      const csv = await request(app).get(`/api/exports/deliveries.csv?repName=${encodeURIComponent('(North)')}`).set('Cookie', cookie).expect(200);
      expect(csv.text).toContain('Ann (North)');
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

    it('should price edited lines the same way as creation and update subtotal', async () => {
      const packItem = await createItem(Item, { packaging: 'case', unitsPerPack: 12, pricePerPack: 30 });
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
          lines: [
            { item: packItem._id.toString(), quantity: 5, packaging: 'each' },
            { item: packItem._id.toString(), quantity: 1, packaging: 'Case' }
          ]
        })
        .expect(200);

      expect(res.body.lines[0].unitPrice).toBe(2.5);
      expect(res.body.lines[0].lineTotal).toBe(12.5);
      expect(res.body.lines[1].packaging).toBe('case');
      expect(res.body.lines[1].lineTotal).toBe(30);
      expect(res.body.subtotal).toBe(42.5);
      expect(res.body.total).toBe(42.5);
    });

    it('should return 404 for non-existent delivery', async () => {
      await request(app)
        .patch('/api/deliveries/507f1f77bcf86cd799439011')
        .set('Cookie', cookie)
        .send({ lines: [] })
        .expect(404);
    });

    it.each([
      ['unknown packaging', { quantity: 1, packaging: 'box' }, /must be "each" or "case"/],
      ['zero quantity', { quantity: 0, packaging: 'each' }, /must be greater than 0/],
      ['fractional "each" quantity', { quantity: 1.5, packaging: 'each' }, /whole number/],
    ])('should reject %s with a 400 (not a 500)', async (_label, line, message) => {
      const delivery = await Delivery.create({
        location: location._id,
        box: box._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 25, lineTotal: 25 }],
        subtotal: 25, tax: 0, total: 25
      });

      const res = await request(app)
        .patch(`/api/deliveries/${delivery._id}`)
        .set('Cookie', cookie)
        .send({ lines: [{ item: item._id.toString(), ...line }] })
        .expect(400);

      expect(res.body.error).toMatch(message);
      const unchanged = await Delivery.findById(delivery._id).lean();
      expect(unchanged.total).toBe(25);
    });

    it('should reject a malformed item id with a 400', async () => {
      const delivery = await Delivery.create({
        location: location._id,
        box: box._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 25, lineTotal: 25 }],
        subtotal: 25, tax: 0, total: 25
      });

      const res = await request(app)
        .patch(`/api/deliveries/${delivery._id}`)
        .set('Cookie', cookie)
        .send({ lines: [{ item: 'nope', quantity: 1, packaging: 'each' }] })
        .expect(400);

      expect(res.body.error).toBe('Invalid item in lines');
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
