import request from 'supertest';
import app from '../../../src/app.js';
import Delivery from '../../../src/models/Delivery.js';
import Item from '../../../src/models/Item.js';
import Location from '../../../src/models/Location.js';
import Box from '../../../src/models/Box.js';
import User from '../../../src/models/User.js';
import { createUser, createLocation, createBox, createItem } from '../../helpers/fixtures.js';
import { authCookie } from '../../helpers/auth.js';

// CSV text -> array of row objects (no quoted commas in this data)
function rows(text) {
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

describe('Report numbers', () => {
  let cookie, location, box, gloves, wipes;

  beforeEach(async () => {
    const admin = await createUser(User, { name: 'Admin', email: 'admin@example.com', roles: ['admin'] });
    cookie = authCookie(admin);
    location = await createLocation(Location);
    box = await createBox(Box, location._id);
    // 50 per case at $10 a case; wipes sold singly
    gloves = await createItem(Item, { name: 'Gloves', sku: 'GLV', packaging: 'case', unitsPerPack: 50, pricePerPack: 10 });
    wipes = await createItem(Item, { name: 'Wipes', sku: 'WIP', packaging: 'each', unitsPerPack: 1, pricePerPack: 0.5 });

    // One delivery: 2 cases of gloves, 5 single gloves, 3 wipes
    await Delivery.create({
      location: location._id, box: box._id,
      lines: [
        { item: gloves._id, quantity: 2, packaging: 'case', unitPrice: 10, lineTotal: 20 },
        { item: gloves._id, quantity: 5, packaging: 'each', unitPrice: 0.2, lineTotal: 1 },
        { item: wipes._id, quantity: 3, packaging: 'each', unitPrice: 0.5, lineTotal: 1.5 },
      ],
      subtotal: 22.5, tax: 0, total: 22.5
    });
  });

  describe('cases and single units are not added together', () => {
    it('dashboard Top Items counts cases, singles and total units separately', async () => {
      const res = await request(app).get('/api/reports/items-usage').set('Cookie', cookie).expect(200);
      expect(res.body.rows).toEqual([
        expect.objectContaining({ name: 'Gloves', cases: 2, each: 5, units: 105, amount: 21 }),
        expect.objectContaining({ name: 'Wipes', cases: 0, each: 3, units: 3, amount: 1.5 }),
      ]);
    });

    it('item summary CSV has Cases, Each and TotalUnits columns', async () => {
      const res = await request(app).get('/api/exports/items-summary.csv').set('Cookie', cookie).expect(200);
      const [g, w] = rows(res.text);
      expect(g).toMatchObject({ ItemName: 'Gloves', SKU: 'GLV', UnitsPerCase: '50', Cases: '2', Each: '5', TotalUnits: '105', TotalAmount: '21.00', LineCount: '2' });
      expect(w).toMatchObject({ ItemName: 'Wipes', Cases: '0', Each: '3', TotalUnits: '3', TotalAmount: '1.50' });
      expect(res.text.split('\n')[0]).not.toMatch(/Packaging|TotalQuantity/);
    });
  });

  describe('line rows carry only their own total', () => {
    it('summing LineTotal in the line-item CSV gives the delivery total', async () => {
      const res = await request(app).get('/api/exports/deliveries.csv?mode=lines').set('Cookie', cookie).expect(200);
      const header = res.text.split('\n')[0];
      expect(header).not.toMatch(/Subtotal|Tax|,Total/);
      const sum = rows(res.text).reduce((s, r) => s + Number(r.LineTotal), 0);
      expect(sum).toBeCloseTo(22.5);
    });

    it('location history has one row per visit, so its Total column adds up', async () => {
      const res = await request(app).get(`/api/exports/location-history.csv?location=${location._id}`).set('Cookie', cookie).expect(200);
      expect(res.text.split('\n')[0]).not.toMatch(/DeliveryTotal|DeliverySubtotal|DeliveryTax|LineTotal/);
      expect(rows(res.text).reduce((s, r) => s + Number(r.Total), 0)).toBeCloseTo(22.5);
    });

    it('per-delivery and per-rep CSVs keep one Total and drop the always-zero tax', async () => {
      const del = await request(app).get('/api/exports/deliveries.csv?mode=deliveries').set('Cookie', cookie).expect(200);
      expect(del.text.split('\n')[0]).not.toMatch(/Subtotal|Tax/);
      expect(rows(del.text)[0]).toMatchObject({ Total: '22.50', LineCount: '3' });

      const reps = await request(app).get('/api/exports/reps.csv').set('Cookie', cookie).expect(200);
      expect(reps.text.split('\n')[0]).not.toMatch(/Subtotal|Tax/);
      expect(reps.text.split('\n')[0]).toMatch(/,Total,/);
    });
  });
});
