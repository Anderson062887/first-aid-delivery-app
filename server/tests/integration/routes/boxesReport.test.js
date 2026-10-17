import request from 'supertest';
import app from '../../../src/app.js';
import Delivery from '../../../src/models/Delivery.js';
import Item from '../../../src/models/Item.js';
import Location from '../../../src/models/Location.js';
import Box from '../../../src/models/Box.js';
import User from '../../../src/models/User.js';
import { createUser, createLocation, createBox, createItem } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

describe('Boxes report', () => {
  let adminCookie, rep, plant, office, b1, b2, old, item;
  const refill = (box, total, deliveredAt, who = rep) => Delivery.create({
    location: box.location, box: box._id, rep: who._id,
    lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: total, lineTotal: total }],
    subtotal: total, tax: 0, total, deliveredAt
  });

  beforeEach(async () => {
    const admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    adminCookie = authCookie(admin);
    rep = await createUser(User, { name: 'Riley', email: 'riley@example.com' });
    plant = await createLocation(Location, { name: 'Plant' });
    office = await createLocation(Location, { name: 'Office' });
    b1 = await createBox(Box, plant._id, { label: 'Box 1', size: 'S' });
    b2 = await createBox(Box, plant._id, { label: 'Box 2', size: 'M' });
    old = await createBox(Box, plant._id, { label: 'Box 10', size: 'L', active: false });
    await createBox(Box, office._id, { label: 'Box 1', size: 'XL' });
    item = await createItem(Item);
    await refill(b1, 10, new Date('2026-09-20T12:00:00Z'));
    await refill(b1, 5, new Date('2026-10-05T12:00:00Z'));
    await refill(b1, 7, new Date('2026-10-09T12:00:00Z'));
    await refill(old, 3, new Date('2026-08-01T12:00:00Z'));
  });

  it('lists every box by location with counts, last refill and refills in the dates', async () => {
    const res = await request(app).get('/api/reports/boxes?from=2026-10-01&to=2026-10-31&tz=UTC').set('Cookie', adminCookie).expect(200);
    expect(res.body.rows.map(r => [r.location, r.label, r.size, r.active, r.refills, r.amount])).toEqual([
      ['Office', 'Box 1', 'XL', true, 0, 0],
      ['Plant', 'Box 1', 'S', true, 2, 12],
      ['Plant', 'Box 2', 'M', true, 0, 0],
      ['Plant', 'Box 10', 'L', false, 0, 0],
    ]);
    expect(new Date(res.body.rows[1].lastRefilled).toISOString()).toBe('2026-10-09T12:00:00.000Z');
    expect(res.body.rows[2].lastRefilled).toBeNull();
    expect(res.body.locations).toEqual([
      expect.objectContaining({ location: 'Office', active: 1, retired: 0 }),
      expect.objectContaining({ location: 'Plant', active: 2, retired: 1 }),
    ]);
    expect(res.body.totals).toEqual({ locations: 2, active: 3, retired: 1, refills: 2, amount: 12 });
  });

  it('narrows to one location', async () => {
    const res = await request(app).get(`/api/reports/boxes?location=${office._id}`).set('Cookie', adminCookie).expect(200);
    expect(res.body.rows.map(r => r.location)).toEqual(['Office']);
  });

  it("a rep's refill numbers only count their own refills", async () => {
    const other = await createUser(User, { name: 'Other', email: 'other@example.com' });
    await refill(b2, 50, new Date('2026-10-10T12:00:00Z'), other);
    const res = await request(app).get('/api/reports/boxes?from=2026-10-01&to=2026-10-31&tz=UTC').set('Cookie', authCookie(rep)).expect(200);
    expect(res.body.totals).toMatchObject({ refills: 2, amount: 12 });
  });

  it('CSV: one row per box plus a TOTAL row, local dates', async () => {
    const res = await request(app).get(`/api/exports/boxes.csv?location=${plant._id}&tz=America/New_York`).set('Cookie', adminCookie).expect(200);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('Location,Box,Size,Status,LastRefilled,RefillsInDates,AmountInDates,BoxID');
    expect(lines[1]).toMatch(/^Plant,Box 1,S,active,2026-10-09 08:00,3,22.00,/);
    expect(lines[3]).toMatch(/^Plant,Box 10,L,retired,2026-08-01 08:00,1,3.00,/);
    expect(lines.at(-1)).toBe('TOTAL,"2 active, 1 retired",,,,4,25.00,');
  });
});
