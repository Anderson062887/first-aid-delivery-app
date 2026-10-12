import request from 'supertest';
import app from '../../../src/app.js';
import User from '../../../src/models/User.js';
import { createUser } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

// A malformed id is a client mistake: 404 for a path id, 400 for a filter. Never 500.
describe('malformed ids', () => {
  let cookie;
  beforeEach(async () => {
    cookie = authCookie(await createUser(User, { roles: ['admin', 'rep'] }));
  });

  const send = (method, url, body) => {
    const req = request(app)[method](url).set('Cookie', cookie);
    return body ? req.send(body) : req;
  };
  const body = { name: 'x', note: 'x', outcome: 'skipped' };

  it.each([
    ['get', '/api/visits/bad'], ['patch', '/api/visits/bad'], ['patch', '/api/visits/bad/note'],
    ['post', '/api/visits/bad/submit'],
    ['get', '/api/items/bad'], ['patch', '/api/items/bad'], ['delete', '/api/items/bad'],
    ['get', '/api/locations/bad'], ['put', '/api/locations/bad'], ['delete', '/api/locations/bad'],
    ['get', '/api/users/bad'], ['patch', '/api/users/bad'], ['delete', '/api/users/bad'],
    ['get', '/api/deliveries/bad'], ['patch', '/api/deliveries/bad'],
    ['get', '/api/boxes/bad'], ['patch', '/api/boxes/bad'], ['delete', '/api/boxes/bad'],
  ])('%s %s -> 404', async (method, url) => {
    await send(method, url, ['get', 'delete'].includes(method) ? null : body).expect(404);
  });

  it.each([
    '/api/visits?location=bad', '/api/visits?repId=bad',
    '/api/exports/deliveries.csv?location=bad', '/api/exports/location-history.csv?location=bad',
    '/api/reports/outcomes?location=bad', '/api/reports/rep-productivity?location=bad',
    '/api/deliveries?location=bad', '/api/boxes?location=bad',
  ])('GET %s -> 400', async (url) => {
    const res = await send('get', url).expect(400);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it('starting a visit at a missing location is a 400', async () => {
    await send('post', '/api/visits', { location: 'bad' }).expect(400);
    await send('post', '/api/visits', { location: '64b7f0000000000000000000' }).expect(400);
  });

  it('a malformed JSON body is a 400 with JSON, not a 500', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"email":').expect(400);
    expect(res.body.error).toBeTruthy();
  });
});
