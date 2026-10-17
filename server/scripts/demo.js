// Demo sandbox: the API on a throwaway in-memory database filled with sample
// data, to try changes without touching a real database. Everything is gone
// when it stops. It never reads server/.env.
//
//   cd server && npm run demo                                  (API on :4790)
//   cd client && DEMO_API=http://localhost:4790 npx vite --port 5180
//   open http://localhost:5180
//
// Demo logins (password for both: demo1234)
//   admin@demo.test   admin + rep
//   rep@demo.test     rep only
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'demo-sandbox-secret';
process.env.JWT_EXPIRES ||= '7d';
process.env.NODE_ENV ||= 'development';
const PORT = Number(process.env.DEMO_PORT) || 4790;
const PASSWORD = 'demo1234';

const mongo = await MongoMemoryServer.create();
const { connectDB } = await import('../src/db.js');
await connectDB(mongo.getUri());

const User = (await import('../src/models/User.js')).default;
const Location = (await import('../src/models/Location.js')).default;
const Box = (await import('../src/models/Box.js')).default;
const Item = (await import('../src/models/Item.js')).default;
const Visit = (await import('../src/models/Visit.js')).default;
const Delivery = (await import('../src/models/Delivery.js')).default;

const passwordHash = await bcrypt.hash(PASSWORD, 10);
await User.create({ name: 'Alex Admin', email: 'admin@demo.test', roles: ['admin', 'rep'], passwordHash });
const rep = await User.create({ name: 'Riley Rep', email: 'rep@demo.test', roles: ['rep'], passwordHash });

const items = await Item.insertMany([
  { name: 'Adhesive Bandages 1x3', sku: 'BAN-13', packaging: 'case', unitsPerPack: 100, pricePerPack: 12.5 },
  { name: 'Gauze Pads 4x4', sku: 'GAU-44', packaging: 'case', unitsPerPack: 25, pricePerPack: 8.75 },
  { name: 'Antiseptic Wipes', sku: 'ANT-W', packaging: 'each', unitsPerPack: 1, pricePerPack: 0.35 },
  { name: 'Burn Gel Packet', sku: 'BRN-G', packaging: 'each', unitsPerPack: 1, pricePerPack: 1.2 },
  { name: 'Nitrile Gloves (pair)', sku: 'GLV-N', packaging: 'case', unitsPerPack: 50, pricePerPack: 9.9 },
  { name: 'Eye Wash 4oz', sku: 'EYE-4', packaging: 'each', unitsPerPack: 1, pricePerPack: 3.4 },
  { name: 'Cold Pack', sku: 'CLD-P', packaging: 'each', unitsPerPack: 1, pricePerPack: 1.75 },
]);
const [bandages, gauze, wipes, burn, gloves, eyewash, cold] = items;

const locs = await Location.insertMany([
  { name: 'Acme Manufacturing', address: { street: '120 Industrial Way', city: 'Dayton', state: 'OH', zip: '45402' } },
  { name: 'Northside Warehouse', address: { street: '8 Depot Rd', city: 'Columbus', state: 'OH', zip: '43215' } },
  { name: 'Riverfront Offices', address: { street: '400 River St', city: 'Cincinnati', state: 'OH', zip: '45202' } },
  { name: 'Hilltop School', address: { street: '22 Summit Ave', city: 'Akron', state: 'OH', zip: '44308' } },
  { name: 'Lakeside Clinic', address: { street: '9 Shore Dr', city: 'Toledo', state: 'OH', zip: '43604' } },
]);
const boxes = {};
for (const [i, l] of locs.entries()) {
  boxes[l._id] = await Box.insertMany(Array.from({ length: 2 + (i % 3) }, (_, k) => ({
    label: `Box ${k + 1}`, location: l._id, size: ['S', 'M', 'L', 'XL'][k % 4],
    // Lakeside has standard contents set up instead of past refills
    items: i === 4 ? [{ item: bandages._id, par: 1 }, { item: wipes._id, par: 20 }, { item: cold._id, par: 4 }] : []
  })));
}

const line = (it, q, packaging = it.packaging) => {
  const unitPrice = packaging === 'case' ? it.pricePerPack : it.pricePerPack / it.unitsPerPack;
  return { item: it._id, quantity: q, packaging, unitPrice, lineTotal: Math.round(unitPrice * q * 100) / 100 };
};
const usual = [
  [line(bandages, 1), line(wipes, 20), line(burn, 5)],
  [line(gloves, 2), line(gauze, 1), line(eyewash, 2)],
  [line(bandages, 2), line(cold, 6), line(wipes, 10)],
];
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const deliver = (v, who, l, b, k, when) => {
  const lines = usual[k % usual.length];
  const total = Math.round(lines.reduce((s, x) => s + x.lineTotal, 0) * 100) / 100;
  return Delivery.create({ visit: v?._id, rep: who._id, repName: who.name, location: l._id, box: b._id, lines, subtotal: total, tax: 0, total, deliveredAt: when });
};

// Past visits: Acme 3 days ago, Northside 9, Riverfront 21, Hilltop 40; Lakeside never
const history = [[0, 3, 'completed'], [1, 9, 'partial'], [2, 21, 'completed'], [3, 40, 'no_access'], [0, 33, 'completed'], [1, 38, 'completed']];
for (const [i, ago, outcome] of history) {
  const l = locs[i]; const when = daysAgo(ago);
  const v = await Visit.create({ rep: rep._id, location: l._id, status: 'submitted', outcome, startedAt: when, submittedAt: when, note: outcome === 'no_access' ? 'Front desk closed.' : '' });
  if (outcome === 'no_access') continue;
  const bs = outcome === 'partial' ? boxes[l._id].slice(0, 1) : boxes[l._id];
  for (const [k, b] of bs.entries()) await deliver(v, rep, l, b, k, when);
}
// Riley has Northside in progress today: 1 of 3 boxes done
const open = await Visit.create({ rep: rep._id, location: locs[1]._id, status: 'open', startedAt: new Date() });
await deliver(open, rep, locs[1], boxes[locs[1]._id][0], 1, new Date());

const app = (await import('../src/app.js')).default;
app.listen(PORT, () => {
  console.log(`Demo API on http://localhost:${PORT} (in-memory sample data; logins in server/scripts/demo.js)`);
});
