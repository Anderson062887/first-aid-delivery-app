import request from 'supertest';
import app from '../../../src/app.js';
import Visit from '../../../src/models/Visit.js';
import Delivery from '../../../src/models/Delivery.js';
import Box from '../../../src/models/Box.js';
import Location from '../../../src/models/Location.js';
import Item from '../../../src/models/Item.js';
import User from '../../../src/models/User.js';
import { createUser, createLocation, createBox, createItem } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

describe('Visits API', () => {
  let user, location, box1, box2, item, cookie;

  beforeEach(async () => {
    user = await createUser(User, { roles: ['rep'] });
    location = await createLocation(Location);
    box1 = await createBox(Box, location._id, { label: 'Box A' });
    box2 = await createBox(Box, location._id, { label: 'Box B' });
    item = await createItem(Item);
    cookie = authCookie(user);
  });

  describe('POST /api/visits', () => {
    it('should create new visit for location', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Cookie', cookie)
        .send({ location: location._id.toString() })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.status).toBe('open');
      expect(res.body.rep._id.toString()).toBe(user._id.toString());
    });

    it('should return existing open visit instead of creating new', async () => {
      const existing = await Visit.create({
        rep: user._id,
        location: location._id,
        status: 'open'
      });

      const res = await request(app)
        .post('/api/visits')
        .set('Cookie', cookie)
        .send({ location: location._id.toString() })
        .expect(201);

      expect(res.body._id.toString()).toBe(existing._id.toString());
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/visits')
        .send({ location: location._id.toString() })
        .expect(401);
    });

    it('should require location', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Cookie', cookie)
        .send({})
        .expect(400);

      expect(res.body.error).toBe('location is required');
    });
  });

  describe('GET /api/visits', () => {
    it('should list visits', async () => {
      await Visit.create({ rep: user._id, location: location._id });
      await Visit.create({ rep: user._id, location: location._id });

      const res = await request(app)
        .get('/api/visits')
        .set('Cookie', cookie)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('should filter by location', async () => {
      const location2 = await createLocation(Location);
      await Visit.create({ rep: user._id, location: location._id });
      await Visit.create({ rep: user._id, location: location2._id });

      const res = await request(app)
        .get(`/api/visits?location=${location._id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.length).toBe(1);
    });

    it('should filter by repId', async () => {
      const user2 = await createUser(User);
      await Visit.create({ rep: user._id, location: location._id });
      await Visit.create({ rep: user2._id, location: location._id });

      const res = await request(app)
        .get(`/api/visits?repId=${user._id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].rep._id.toString()).toBe(user._id.toString());
    });
  });

  describe('GET /api/visits/:id', () => {
    it('should return visit with box coverage', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      // Create delivery for box1 only
      await Delivery.create({
        location: location._id,
        box: box1._id,
        visit: visit._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      const res = await request(app)
        .get(`/api/visits/${visit._id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.visit._id.toString()).toBe(visit._id.toString());
      expect(res.body.boxes).toHaveLength(2);

      const coveredBox = res.body.boxes.find(b => b.boxId.toString() === box1._id.toString());
      const uncoveredBox = res.body.boxes.find(b => b.boxId.toString() === box2._id.toString());

      expect(coveredBox.covered).toBe(true);
      expect(uncoveredBox.covered).toBe(false);
    });

    it('should return 404 for non-existent visit', async () => {
      await request(app)
        .get('/api/visits/507f1f77bcf86cd799439011')
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  describe('PATCH /api/visits/:id/note', () => {
    it('should update visit note', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      const res = await request(app)
        .patch(`/api/visits/${visit._id}/note`)
        .set('Cookie', cookie)
        .send({ note: 'Test note content' })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.visit.note).toBe('Test note content');
    });

    it('should return 404 for non-existent visit', async () => {
      await request(app)
        .patch('/api/visits/507f1f77bcf86cd799439011/note')
        .set('Cookie', cookie)
        .send({ note: 'Test' })
        .expect(404);
    });
  });

  describe('POST /api/visits/:id/submit', () => {
    it('should submit visit as completed when all boxes covered', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      // Cover both boxes
      for (const box of [box1, box2]) {
        await Delivery.create({
          location: location._id,
          box: box._id,
          visit: visit._id,
          lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
          subtotal: 10, tax: 0, total: 10
        });
      }

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'completed', note: 'All done' })
        .expect(200);

      expect(res.body.status).toBe('submitted');
      expect(res.body.outcome).toBe('completed');
      expect(res.body.note).toBe('All done');
      expect(res.body.submittedAt).toBeTruthy();
    });

    it('should reject completed outcome if boxes not covered', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      // Only cover box1
      await Delivery.create({
        location: location._id,
        box: box1._id,
        visit: visit._id,
        lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
        subtotal: 10, tax: 0, total: 10
      });

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'completed' })
        .expect(400);

      expect(res.body.error).toContain('All boxes must be refilled');
      expect(res.body.missingBoxes).toHaveLength(1);
      expect(res.body.missingBoxes[0].label).toBe('Box B');
    });

    it('should allow partial outcome without full coverage', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'partial', note: 'Could not access box B' })
        .expect(200);

      expect(res.body.status).toBe('submitted');
      expect(res.body.outcome).toBe('partial');
    });

    it('should allow no_access outcome without any deliveries', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'no_access', note: 'Gate locked' })
        .expect(200);

      expect(res.body.outcome).toBe('no_access');
    });

    it('should allow skipped outcome', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'skipped' })
        .expect(200);

      expect(res.body.outcome).toBe('skipped');
    });

    it('should reject invalid outcome', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id
      });

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'invalid_outcome' })
        .expect(400);

      expect(res.body.error).toContain('Invalid outcome');
    });

    it('should return already submitted visit without error', async () => {
      const visit = await Visit.create({
        rep: user._id,
        location: location._id,
        status: 'submitted',
        outcome: 'partial',
        submittedAt: new Date()
      });

      const res = await request(app)
        .post(`/api/visits/${visit._id}/submit`)
        .set('Cookie', cookie)
        .send({ outcome: 'completed' })
        .expect(200);

      // Should return the existing visit without changing it
      expect(res.body.outcome).toBe('partial');
    });

    it('should return 404 for non-existent visit', async () => {
      await request(app)
        .post('/api/visits/507f1f77bcf86cd799439011/submit')
        .set('Cookie', cookie)
        .send({ outcome: 'completed' })
        .expect(404);
    });
  });
});
