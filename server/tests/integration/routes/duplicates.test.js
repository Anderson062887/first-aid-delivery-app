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

describe('no duplicate deliveries', () => {
  let rep, location, box1, box2, item, cookie;
  beforeEach(async () => {
    await Delivery.init(); // make sure the unique clientId index exists
    rep = await createUser(User, { name: 'Ann', email: 'ann@example.com' });
    location = await createLocation(Location);
    box1 = await createBox(Box, location._id, { label: 'Box 1' });
    box2 = await createBox(Box, location._id, { label: 'Box 2' });
    item = await createItem(Item, { pricePerPack: 10 });
    cookie = authCookie(rep);
  });

  const post = (body) => request(app).post('/api/deliveries').set('Cookie', cookie).send({
    location: String(location._id), box: String(box1._id),
    lines: [{ item: String(item._id), quantity: 1, packaging: 'each' }], ...body
  });

  it('a resent request (same clientId) returns the first delivery instead of a second one', async () => {
    const first = await post({ clientId: 'abc-123' }).expect(201);
    const again = await post({ clientId: 'abc-123' }).expect(200);
    expect(again.body._id).toBe(first.body._id);
    expect(await Delivery.countDocuments()).toBe(1);

    // Two requests at the same moment still make one delivery
    await Promise.all([post({ clientId: 'xyz' }), post({ clientId: 'xyz' })]);
    expect(await Delivery.countDocuments({ clientId: 'xyz' })).toBe(1);

    // Without a clientId, older clients keep working
    await post({}).expect(201);
  });

  it('allows one delivery per box per visit', async () => {
    const visit = await createVisit(Visit, rep._id, location._id);
    await post({ visit: String(visit._id) }).expect(201);
    const dup = await post({ visit: String(visit._id) }).expect(409);
    expect(dup.body.error).toMatch(/already refilled/);

    await post({ visit: String(visit._id), box: String(box2._id) }).expect(201);
  });
});

describe('changing a visit outcome', () => {
  let rep, admin, location, box1, box2, item;
  beforeEach(async () => {
    rep = await createUser(User, { name: 'Ann', email: 'ann@example.com' });
    admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    location = await createLocation(Location);
    box1 = await createBox(Box, location._id);
    box2 = await createBox(Box, location._id);
    item = await createItem(Item);
  });

  const deliver = (visit, box) => Delivery.create({
    visit: visit._id, location: location._id, box: box._id,
    lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 10, lineTotal: 10 }],
    subtotal: 10, tax: 0, total: 10
  });
  const patch = (user, visit, body) =>
    request(app).patch(`/api/visits/${visit._id}`).set('Cookie', authCookie(user)).send(body);

  it('a rep cannot edit a visit after it was submitted; an admin can', async () => {
    const visit = await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'partial', submittedAt: new Date() });

    const res = await patch(rep, visit, { outcome: 'skipped' }).expect(403);
    expect(res.body.error).toMatch(/already submitted/);
    await request(app).patch(`/api/visits/${visit._id}/note`).set('Cookie', authCookie(rep)).send({ note: 'x' }).expect(403);

    await patch(admin, visit, { outcome: 'skipped' }).expect(200);
  });

  it('"completed" requires every box, for admins too', async () => {
    const visit = await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'partial', submittedAt: new Date() });
    await deliver(visit, box1);

    const res = await patch(admin, visit, { outcome: 'completed' }).expect(400);
    expect(res.body.missingBoxes).toHaveLength(1);
    expect((await Visit.findById(visit._id)).outcome).toBe('partial');

    await deliver(visit, box2);
    await patch(admin, visit, { outcome: 'completed' }).expect(200);
  });

  it('resubmitting an already submitted visit is still harmless (queued retries)', async () => {
    const visit = await createVisit(Visit, rep._id, location._id, { status: 'submitted', outcome: 'skipped', submittedAt: new Date() });
    await request(app).post(`/api/visits/${visit._id}/submit`).set('Cookie', authCookie(rep))
      .send({ outcome: 'skipped' }).expect(200);
  });
});
