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

describe('Items API: unique SKU', () => {
  let cookie, gauze;
  beforeEach(async () => {
    cookie = authCookie(await createUser(User, { roles: ['admin'] }));
    gauze = await createItem(Item, { name: 'Gauze', sku: 'GZ-10' });
  });
  const create = (sku) => request(app).post('/api/items').set('Cookie', cookie)
    .send({ name: 'Other', pricePerPack: 1, sku });

  it('rejects a SKU another item uses, ignoring case and spaces', async () => {
    const res = await create(' gz-10 ').expect(409);
    expect(res.body.error).toMatch(/GZ-10|gz-10/);
    await create('GZ-11').expect(201);
  });

  it('allows any number of items without a SKU', async () => {
    await create('').expect(201);
    await create('').expect(201);
    await create(undefined).expect(201);
  });

  it('checks SKU changes too, but an item can keep its own', async () => {
    const other = await createItem(Item, { name: 'Tape', sku: 'TP-1' });
    await request(app).patch(`/api/items/${other._id}`).set('Cookie', cookie).send({ sku: 'GZ-10' }).expect(409);
    await request(app).patch(`/api/items/${gauze._id}`).set('Cookie', cookie).send({ sku: 'GZ-10', name: 'Gauze 2' }).expect(200);
  });

  it('items that already share a SKU (older data) can still be edited', async () => {
    const twin = await createItem(Item, { name: 'Gauze twin', sku: 'GZ-10' });
    await request(app).patch(`/api/items/${twin._id}`).set('Cookie', cookie)
      .send({ sku: 'GZ-10', pricePerPack: 12 }).expect(200);
  });

  it('treats regex characters in a SKU literally', async () => {
    await createItem(Item, { name: 'Dot', sku: 'A.B' });
    await create('AxB').expect(201);
  });
});
