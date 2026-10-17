import request from 'supertest';
import app from '../../../src/app.js';
import Location from '../../../src/models/Location.js';
import Visit from '../../../src/models/Visit.js';
import User from '../../../src/models/User.js';
import Box from '../../../src/models/Box.js';
import Item from '../../../src/models/Item.js';
import Delivery from '../../../src/models/Delivery.js';
import { createUser, createLocation, createVisit, createBox, createItem } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

describe('GET /api/visits/recent-by-location', () => {
  it('returns the latest visits of every location in one request', async () => {
    const rep = await createUser(User, { name: 'Ann' });
    const a = await createLocation(Location, { name: 'A' });
    const b = await createLocation(Location, { name: 'B' });
    await createLocation(Location, { name: 'No visits' });
    const day = (d) => new Date(Date.UTC(2026, 0, d));

    await createVisit(Visit, rep._id, a._id, { status: 'submitted', outcome: 'completed', startedAt: day(1), submittedAt: day(1) });
    await createVisit(Visit, rep._id, a._id, { status: 'submitted', outcome: 'partial', startedAt: day(5), submittedAt: day(5) });
    await createVisit(Visit, rep._id, a._id, { status: 'submitted', outcome: 'skipped', startedAt: day(3), submittedAt: day(3) });
    // still open, but the newest: must not be pushed behind submitted visits
    // (it has a refilled box; empty open visits are left out)
    const open = await createVisit(Visit, rep._id, a._id, { startedAt: day(9) });
    const box = await createBox(Box, a._id);
    const item = await createItem(Item);
    await Delivery.create({
      location: a._id, box: box._id, visit: open._id, rep: rep._id,
      lines: [{ item: item._id, quantity: 1, packaging: 'each', unitPrice: 1, lineTotal: 1 }],
      subtotal: 1, tax: 0, total: 1
    });
    await createVisit(Visit, rep._id, b._id, { status: 'submitted', outcome: 'no_access', startedAt: day(2), submittedAt: day(2) });

    const res = await request(app).get('/api/visits/recent-by-location?per=2')
      .set('Cookie', authCookie(rep)).expect(200);

    expect(Object.keys(res.body).sort()).toEqual([String(a._id), String(b._id)].sort());
    expect(res.body[a._id].map(v => v.outcome ?? 'open')).toEqual(['open', 'partial']);
    expect(res.body[b._id]).toHaveLength(1);
    expect(res.body[b._id][0].rep.name).toBe('Ann');
  });
});

describe('reps only see their own visits', () => {
  it('in the list, the recent-visits summary and the visit page; admins see all', async () => {
    const ann = await createUser(User, { name: 'Ann', email: 'ann@example.com' });
    const bob = await createUser(User, { name: 'Bob', email: 'bob@example.com' });
    const admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    const loc = await createLocation(Location, { name: 'Shared' });
    const annVisit = await createVisit(Visit, ann._id, loc._id, { status: 'submitted', outcome: 'completed', submittedAt: new Date() });
    const bobVisit = await createVisit(Visit, bob._id, loc._id, { status: 'submitted', outcome: 'skipped', note: 'private', submittedAt: new Date() });
    const as = (u, url) => request(app).get(url).set('Cookie', authCookie(u));

    const list = await as(ann, `/api/visits?location=${loc._id}&limit=10&repId=${bob._id}`).expect(200);
    expect(list.body.map(v => v._id)).toEqual([String(annVisit._id)]);

    const recent = await as(ann, '/api/visits/recent-by-location?per=5').expect(200);
    expect(recent.body[loc._id].map(v => v._id)).toEqual([String(annVisit._id)]);

    await as(ann, `/api/visits/${bobVisit._id}`).expect(404);
    await as(ann, `/api/visits/${annVisit._id}`).expect(200);

    const all = await as(admin, '/api/visits/recent-by-location?per=5').expect(200);
    expect(all.body[loc._id]).toHaveLength(2);
    await as(admin, `/api/visits/${bobVisit._id}`).expect(200);
  });
});
