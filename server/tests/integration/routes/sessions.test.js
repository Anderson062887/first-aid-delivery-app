import request from 'supertest';
import app from '../../../src/app.js';
import User from '../../../src/models/User.js';
import { createUser } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

const cookieFrom = (res) => (res.headers['set-cookie'] || []).find(c => c.startsWith('token='))?.split(';')[0];

describe('password reset ends existing sessions', () => {
  it("logs the user out everywhere; their new login works", async () => {
    const admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    const rep = await createUser(User, { name: 'Ann', email: 'ann@example.com' });

    // Ann is logged in somewhere (e.g. a lost phone)
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'ann@example.com', password: 'password123' }).expect(200);
    const oldSession = cookieFrom(login);
    await request(app).get('/api/items').set('Cookie', oldSession).expect(200);

    await request(app).patch(`/api/users/${rep._id}`).set('Cookie', authCookie(admin))
      .send({ password: 'NewPassw0rd' }).expect(200);

    await request(app).get('/api/items').set('Cookie', oldSession).expect(401);
    await request(app).get('/api/items').set('Cookie', authCookie(rep)).expect(401); // tokens without a version too

    const relogin = await request(app).post('/api/auth/login')
      .send({ email: 'ann@example.com', password: 'NewPassw0rd' }).expect(200);
    await request(app).get('/api/items').set('Cookie', cookieFrom(relogin)).expect(200);
  });

  it('an admin resetting their own password stays logged in on this device', async () => {
    const admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    const res = await request(app).patch(`/api/users/${admin._id}`).set('Cookie', authCookie(admin))
      .send({ password: 'NewPassw0rd' }).expect(200);
    expect(res.body).not.toHaveProperty('tokenVersion');
    await request(app).get('/api/items').set('Cookie', cookieFrom(res)).expect(200);
  });

  it('other changes (name, roles) do not log the user out', async () => {
    const admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    const rep = await createUser(User, { name: 'Ann', email: 'ann@example.com' });
    await request(app).patch(`/api/users/${rep._id}`).set('Cookie', authCookie(admin))
      .send({ name: 'Ann B' }).expect(200);
    await request(app).get('/api/items').set('Cookie', authCookie(rep)).expect(200);
  });
});

describe('CORS', () => {
  it('does not let other sites make logged-in requests', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
