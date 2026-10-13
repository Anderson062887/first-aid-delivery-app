import Delivery from '../../src/models/Delivery.js';
import Item from '../../src/models/Item.js';
import Location from '../../src/models/Location.js';
import Box from '../../src/models/Box.js';
import { createLocation, createBox, createItem } from '../helpers/fixtures.js';
import { repriceEachLines } from '../../src/maintenance/repriceEachLines.js';

describe('repriceEachLines', () => {
  const future = new Date(Date.now() + 60_000); // treat everything as "before the fix"

  it('reprices old each-lines, leaves correct and uncertain ones, writes only with apply', async () => {
    const location = await createLocation(Location, { name: 'Shop' });
    const box = await createBox(Box, location._id);
    const gauze = await createItem(Item, { name: 'Gauze', sku: 'G', pricePerPack: 20, unitsPerPack: 10 });
    const tape = await createItem(Item, { name: 'Tape', sku: 'T', pricePerPack: 8, unitsPerPack: 4 });
    const kit = await createItem(Item, { name: 'Kit', sku: 'K', pricePerPack: 15, unitsPerPack: 1 });

    const line = (item, packaging, quantity, unitPrice) =>
      ({ item: item._id, packaging, quantity, unitPrice, lineTotal: Math.round(unitPrice * quantity * 100) / 100 });
    const make = (lines) => {
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      return Delivery.create({ location: location._id, box: box._id, repName: 'Ann', lines, subtotal, tax: 0, total: subtotal });
    };

    // Old bug: 3 gauze "each" at the case price ($20) + 1 case of tape (correct)
    const wrong = await make([line(gauze, 'each', 3, 20), line(tape, 'case', 1, 8)]);
    // Already right: $2 each; and a 1-unit item where each == case
    const right = await make([line(gauze, 'each', 3, 2), line(kit, 'each', 1, 15)]);
    // Tape was $6 per case back then: can't tell, leave it
    const unsure = await make([line(tape, 'each', 2, 6)]);

    const dry = await repriceEachLines({ before: future });
    expect(dry.changes).toEqual([expect.objectContaining({ delivery: String(wrong._id), oldTotal: 68, newTotal: 14 })]);
    expect(dry.overcharged).toBe(54);
    expect(dry.unsure).toEqual([expect.objectContaining({ delivery: String(unsure._id), item: 'Tape', unitPrice: 6 })]);
    expect((await Delivery.findById(wrong._id)).total).toBe(68); // dry run wrote nothing

    await repriceEachLines({ apply: true, before: future });
    const fixed = await Delivery.findById(wrong._id).lean();
    expect(fixed).toMatchObject({ subtotal: 14, total: 14 });
    expect(fixed.lines[0]).toMatchObject({ unitPrice: 2, lineTotal: 6 });
    expect(fixed.lines[1]).toMatchObject({ unitPrice: 8, lineTotal: 8 });
    expect((await Delivery.findById(right._id)).total).toBe(21);
    expect((await Delivery.findById(unsure._id)).total).toBe(12);

    // Running again changes nothing
    expect((await repriceEachLines({ before: future })).changes).toEqual([]);
  });

  it('ignores deliveries saved after the fix went live', async () => {
    const location = await createLocation(Location);
    const box = await createBox(Box, location._id);
    const gauze = await createItem(Item, { pricePerPack: 20, unitsPerPack: 10 });
    await Delivery.create({
      location: location._id, box: box._id,
      lines: [{ item: gauze._id, packaging: 'each', quantity: 1, unitPrice: 20, lineTotal: 20 }],
      subtotal: 20, tax: 0, total: 20
    });
    const r = await repriceEachLines({ before: new Date(Date.now() - 60_000) });
    expect(r.changes).toEqual([]);
  });
});
