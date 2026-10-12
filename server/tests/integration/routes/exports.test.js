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

// Parse the CSV into { repName: row } (no quoted commas in this data)
function parse(text) {
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return Object.fromEntries(lines.map(l => {
    const row = Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]));
    return [row.RepName, row];
  }));
}

describe('GET /api/exports/reps.csv', () => {
  let alice, bob, location, boxes, item, cookie;

  const deliver = (visit, box, total, extra = {}) => Delivery.create({
    location: location._id, box: box._id, visit: visit?._id,
    lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: total, lineTotal: total }],
    subtotal: total, tax: 0, total, ...extra
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

    const v1 = await submitted(alice, 'completed');       // 3 boxes
    for (const b of boxes) await deliver(v1, b, 10);
    const v2 = await submitted(alice, 'partial');         // 1 box
    await deliver(v2, boxes[0], 5);
    await submitted(bob, 'no_access');                    // no deliveries
    await createVisit(Visit, bob._id, location._id);      // still open: no outcome
  });

  it('counts each visit outcome once, including visits without deliveries', async () => {
    const res = await request(app).get('/api/exports/reps.csv').set('Cookie', cookie).expect(200);
    const rows = parse(res.text);

    expect(rows.Alice).toMatchObject({
      RepID: String(alice._id), VisitCount: '2', DeliveryCount: '4', Total: '35.00',
      Completed: '1', Partial: '1', NoAccess: '0', Skipped: '0', Other: '0'
    });
    expect(rows.Bob).toMatchObject({
      RepID: String(bob._id), VisitCount: '1', DeliveryCount: '0', Total: '0.00', NoAccess: '1', Other: '0'
    });
  });

  it("adds visit-less deliveries to the rep with that name, not one shared 'unknown' row", async () => {
    await deliver(null, boxes[1], 7, { repName: 'Alice' });
    await deliver(null, boxes[2], 4, { repName: 'Carol' });

    const rows = parse((await request(app).get('/api/exports/reps.csv').set('Cookie', cookie).expect(200)).text);
    expect(rows.Alice).toMatchObject({ DeliveryCount: '5', Total: '42.00', Other: '0' });
    expect(rows.Carol).toMatchObject({ RepID: '', DeliveryCount: '1', Total: '4.00', Other: '0' });
  });

  it('applies the rep filter to outcomes too', async () => {
    const res = await request(app).get(`/api/exports/reps.csv?repId=${bob._id}`).set('Cookie', cookie).expect(200);
    const rows = parse(res.text);
    expect(Object.keys(rows)).toEqual(['Bob']);
    expect(rows.Bob.NoAccess).toBe('1');
  });
});
