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

function rows(text) {
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

describe('Report times and visit counts', () => {
  let admin, rep, cookie, location, boxes, item;
  const deliver = (visit, box, deliveredAt) => Delivery.create({
    location: location._id, box: box._id, visit: visit._id, rep: rep._id,
    lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 5, lineTotal: 5 }],
    subtotal: 5, tax: 0, total: 5, deliveredAt
  });

  beforeEach(async () => {
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    rep = await createUser(User, { name: 'Riley', email: 'riley@example.com' });
    cookie = authCookie(admin);
    location = await createLocation(Location);
    boxes = await Promise.all([1, 2].map(n => createBox(Box, location._id, { label: `Box ${n}` })));
    item = await createItem(Item);
  });

  it('CSV times are local, matching the date filters', async () => {
    // 9:35 PM on Oct 13 in New York is 01:35 on Oct 14 in UTC
    const v = await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'completed', submittedAt: new Date('2026-10-14T01:40:00Z') });
    await deliver(v, boxes[0], new Date('2026-10-14T01:35:00Z'));
    const q = 'from=2026-10-13&to=2026-10-13&tz=America/New_York';

    for (const mode of ['lines', 'deliveries']) {
      const res = await request(app).get(`/api/exports/deliveries.csv?mode=${mode}&${q}`).set('Cookie', cookie).expect(200);
      expect(rows(res.text)).toEqual([expect.objectContaining({ DeliveredAt: '2026-10-13 21:35' })]);
    }
  });

  it('VisitCount matches the outcome columns; visits in progress are counted separately', async () => {
    const done = await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'partial', submittedAt: new Date() });
    await deliver(done, boxes[0], new Date());
    const open = await createVisit(Visit, rep._id, location._id); // still in progress
    await deliver(open, boxes[1], new Date());

    const csv = await request(app).get('/api/exports/reps.csv').set('Cookie', cookie).expect(200);
    const [r] = rows(csv.text);
    expect(r).toMatchObject({ RepName: 'Riley', VisitCount: '1', OpenVisits: '1', Partial: '1', DeliveryCount: '2', Total: '10.00' });
    const outcomes = ['Completed', 'Partial', 'NoAccess', 'Skipped', 'Other'].reduce((s, k) => s + Number(r[k]), 0);
    expect(outcomes).toBe(Number(r.VisitCount));

    const json = await request(app).get('/api/reports/rep-productivity').set('Cookie', cookie).expect(200);
    expect(json.body.rows).toEqual([expect.objectContaining({ visitCount: 1, openVisits: 1, partial: 1, deliveries: 2 })]);
  });
});
