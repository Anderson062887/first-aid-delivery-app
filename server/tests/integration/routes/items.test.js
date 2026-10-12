import request from 'supertest';
import app from '../../../src/app.js';
import Item from '../../../src/models/Item.js';
import User from '../../../src/models/User.js';
import { createUser, createItem } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

describe('Items API: unitsPerPack', () => {
  let cookie, item;
  beforeEach(async () => {
    cookie = authCookie(await createUser(User, { roles: ['admin'] }));
    item = await createItem(Item, { unitsPerPack: 10 });
  });

  const create = (unitsPerPack) => request(app).post('/api/items').set('Cookie', cookie)
    .send({ name: 'Gauze', pricePerPack: 12, unitsPerPack });

  it.each([
    [0, /at least 1/], [-5, /at least 1/], [2.5, /whole number/], [null, /required/],
  ])('rejects %p on create', async (value, message) => {
    const res = await create(value).expect(400);
    expect(res.body.error).toMatch(message);
  });

  it('rejects an invalid value on update and keeps the old one', async () => {
    const res = await request(app).patch(`/api/items/${item._id}`).set('Cookie', cookie)
      .send({ unitsPerPack: 0 }).expect(400);
    expect(res.body.error).toBe('unitsPerPack must be at least 1');
    expect((await Item.findById(item._id)).unitsPerPack).toBe(10);
  });

  it('accepts whole numbers and defaults to 1', async () => {
    await create(24).expect(201);
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .send({ name: 'Tape', pricePerPack: 3 }).expect(201);
    expect(res.body.unitsPerPack).toBe(1);
  });
});
