import request from 'supertest';
import app from '../../../src/app.js';
import Location from '../../../src/models/Location.js';
import Visit from '../../../src/models/Visit.js';
import User from '../../../src/models/User.js';
import { createUser, createLocation, createVisit } from '../../helpers/fixtures.js';
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
    await createVisit(Visit, rep._id, a._id, { startedAt: day(9) });
    await createVisit(Visit, rep._id, b._id, { status: 'submitted', outcome: 'no_access', startedAt: day(2), submittedAt: day(2) });

    const res = await request(app).get('/api/visits/recent-by-location?per=2')
      .set('Cookie', authCookie(rep)).expect(200);

    expect(Object.keys(res.body).sort()).toEqual([String(a._id), String(b._id)].sort());
    expect(res.body[a._id].map(v => v.outcome ?? 'open')).toEqual(['open', 'partial']);
    expect(res.body[b._id]).toHaveLength(1);
    expect(res.body[b._id][0].rep.name).toBe('Ann');
  });
});
