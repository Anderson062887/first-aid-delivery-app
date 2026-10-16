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

const at = (s) => new Date(s);

describe('Reports: items delivered and location history', () => {
  let admin, rep, other, adminCookie, repCookie, plant, office, boxes, gloves, wipes;

  const deliver = (visit, box, lines, extra = {}) => Delivery.create({
    location: visit?.location || plant._id, box: box._id, visit: visit?._id, rep: visit?.rep,
    lines, subtotal: lines.reduce((s, l) => s + l.lineTotal, 0), tax: 0,
    total: lines.reduce((s, l) => s + l.lineTotal, 0), deliveredAt: extra.deliveredAt || visit?.submittedAt, ...extra
  });
  const glovesCase = (q) => ({ item: gloves._id, quantity: q, packaging: 'case', unitPrice: 10, lineTotal: 10 * q });
  const wipesEach = (q) => ({ item: wipes._id, quantity: q, packaging: 'each', unitPrice: 0.5, lineTotal: 0.5 * q });

  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    rep = await createUser(User, { name: 'Riley', email: 'riley@example.com' });
    other = await createUser(User, { name: 'Other', email: 'other@example.com' });
    adminCookie = authCookie(admin); repCookie = authCookie(rep);
    plant = await createLocation(Location, { name: 'Plant' });
    office = await createLocation(Location, { name: 'Office' });
    boxes = await Promise.all([1, 2].map(n => createBox(Box, plant._id, { label: `Box ${n}` })));
    gloves = await createItem(Item, { name: 'Gloves', sku: 'GLV', packaging: 'case', unitsPerPack: 50, pricePerPack: 10 });
    wipes = await createItem(Item, { name: 'Wipes', sku: 'WIP', packaging: 'each', unitsPerPack: 1, pricePerPack: 0.5 });

    // Sep 30: completed, both boxes (outside an October range)
    const sep = await createVisit(Visit, rep._id, plant._id, { status: 'submitted', outcome: 'completed', startedAt: at('2026-09-30T14:00:00Z'), submittedAt: at('2026-09-30T15:00:00Z') });
    await deliver(sep, boxes[0], [glovesCase(1)]);
    await deliver(sep, boxes[1], [wipesEach(4)]);
    // Oct 5: no access, nothing refilled
    await createVisit(Visit, rep._id, plant._id, { status: 'submitted', outcome: 'no_access', startedAt: at('2026-10-05T14:00:00Z'), submittedAt: at('2026-10-05T14:10:00Z'), note: 'Gate locked' });
    // Oct 10: another rep, partial
    const oct = await createVisit(Visit, other._id, plant._id, { status: 'submitted', outcome: 'partial', startedAt: at('2026-10-10T14:00:00Z'), submittedAt: at('2026-10-10T15:00:00Z') });
    await deliver(oct, boxes[0], [glovesCase(2), wipesEach(6)]);
    // Oct 12: still open
    const open = await createVisit(Visit, rep._id, plant._id, { startedAt: at('2026-10-12T14:00:00Z') });
    await deliver(open, boxes[1], [wipesEach(10)], { deliveredAt: at('2026-10-12T14:30:00Z') });
    // Oct 11: an old delivery recorded without a visit
    await deliver(null, boxes[1], [glovesCase(1)], { location: plant._id, rep: rep._id, repName: 'Riley', deliveredAt: at('2026-10-11T12:00:00Z') });
    // Different location, same month
    const away = await createVisit(Visit, rep._id, office._id, { status: 'submitted', outcome: 'completed', submittedAt: at('2026-10-08T12:00:00Z') });
    const officeBox = await createBox(Box, office._id);
    await deliver(away, officeBox, [glovesCase(5)]);
  });

  const oct = 'from=2026-10-01&to=2026-10-31&tz=UTC';

  describe('GET /api/reports/items-summary', () => {
    it('lists every item in the dates with cases, singles, units and totals', async () => {
      const res = await request(app).get(`/api/reports/items-summary?${oct}`).set('Cookie', adminCookie).expect(200);
      expect(res.body.rows).toEqual([
        expect.objectContaining({ name: 'Gloves', sku: 'GLV', unitsPerPack: 50, cases: 8, each: 0, units: 400, amount: 80 }),
        expect.objectContaining({ name: 'Wipes', sku: 'WIP', cases: 0, each: 16, units: 16, amount: 8 }),
      ]);
      expect(res.body.totals).toMatchObject({ cases: 8, each: 16, units: 416, amount: 88 });
      expect(res.body.deliveries).toBe(4);
    });

    it('narrows to one location', async () => {
      const res = await request(app).get(`/api/reports/items-summary?${oct}&location=${office._id}`).set('Cookie', adminCookie).expect(200);
      expect(res.body.rows).toEqual([expect.objectContaining({ name: 'Gloves', cases: 5 })]);
    });

    it("a rep only counts their own deliveries", async () => {
      const res = await request(app).get(`/api/reports/items-summary?${oct}&location=${plant._id}`).set('Cookie', repCookie).expect(200);
      expect(res.body.totals).toMatchObject({ cases: 1, each: 10 }); // open visit + visit-less delivery
    });
  });

  describe('GET /api/reports/location-history', () => {
    it('one row per visit, newest first, including visits with nothing refilled', async () => {
      const res = await request(app).get(`/api/reports/location-history?${oct}&location=${plant._id}`).set('Cookie', adminCookie).expect(200);
      expect(res.body.location.name).toBe('Plant');
      expect(res.body.rows.map(r => [r.status, r.outcome, r.repName, r.boxes, r.total])).toEqual([
        ['open', '', 'Riley', ['Box 2'], 5],
        ['no visit', '', 'Riley', ['Box 2'], 10],
        ['submitted', 'partial', 'Other', ['Box 1'], 23],
        ['submitted', 'no_access', 'Riley', [], 0],
      ]);
      expect(res.body.rows[2].items).toEqual([
        { name: 'Gloves', cases: 2, each: 0, units: 100 },
        { name: 'Wipes', cases: 0, each: 6, units: 6 },
      ]);
      expect(res.body.rows[3].note).toBe('Gate locked');
    });

    it('without dates shows the whole history', async () => {
      const res = await request(app).get(`/api/reports/location-history?location=${plant._id}`).set('Cookie', adminCookie).expect(200);
      expect(res.body.rows).toHaveLength(5);
      expect(res.body.rows.at(-1)).toMatchObject({ outcome: 'completed', boxes: ['Box 1', 'Box 2'], total: 12 });
    });

    it('reps see only their own visits', async () => {
      const res = await request(app).get(`/api/reports/location-history?${oct}&location=${plant._id}`).set('Cookie', repCookie).expect(200);
      expect(res.body.rows.map(r => r.repName)).toEqual(['Riley', 'Riley', 'Riley']);
    });

    it('needs a location that exists', async () => {
      await request(app).get('/api/reports/location-history').set('Cookie', adminCookie).expect(400);
      await request(app).get('/api/reports/location-history?location=507f1f77bcf86cd799439011').set('Cookie', adminCookie).expect(404);
    });
  });

  describe('CSV downloads match the screens', () => {
    it('location history CSV: one row per visit, local dates, readable items', async () => {
      const res = await request(app)
        .get(`/api/exports/location-history.csv?from=2026-10-01&to=2026-10-31&tz=America/New_York&location=${plant._id}`)
        .set('Cookie', adminCookie).expect(200);
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toBe('Date,Location,Rep,Status,Outcome,Note,BoxesRefilled,Boxes,Items,Total,VisitID');
      expect(lines).toHaveLength(5);
      expect(lines[3]).toMatch(/^2026-10-10 11:00,Plant,Other,submitted,partial,,1,Box 1,Gloves: 2 cases; Wipes: 6 each,23.00,/);
      expect(lines[4]).toMatch(/^2026-10-05 10:10,Plant,Riley,submitted,no_access,Gate locked,0,,,0.00,/);
    });

    it('items CSV ends with a TOTAL row', async () => {
      const res = await request(app).get(`/api/exports/items-summary.csv?${oct}`).set('Cookie', adminCookie).expect(200);
      expect(res.text.trim().split('\n').at(-1)).toBe(',TOTAL,,,8,16,416,88.00,5');
    });
  });
});
