import { Router } from 'express';
import Location from '../models/Location.js';
import Box from '../models/Box.js';

const r = Router();

/** List locations */
r.get('/', async (req, res) => {
  const { q } = req.query;
console.log('GET /api/locations q=', req.query.q);
  const query = {};
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim(), 'i');
    query.$or = [
      { name: rx },
      { 'address.street': rx },
      { 'address.city': rx },
      { 'address.state': rx },
      { 'address.zip': rx },
    ];
  }

  const locations = await Location.find(query).sort({ name: 1 });
  res.json(locations);
});

/**
 * Create location and (optionally) auto-create boxes.
 * Body:
 * {
 *   name, address: { street, city, state, zip },
 *   boxCount?: number (1..20),
 *   boxSizes?: string[] of 'S'|'M'|'L'|'XL' (length = boxCount),
 *   boxLabelPrefix?: string (default 'Box')
 * }
 */
r.post('/', async (req, res) => {
  const { name, address, boxCount, boxSizes, boxLabelPrefix='Box' } = req.body;
  if(!name) return res.status(400).json({ error: 'name is required' });

  const loc = await Location.create({ name, address });

  // Auto-create boxes if requested
  if (boxCount) {
    const n = Math.max(1, Math.min(20, Number(boxCount)));
    const sizes = Array.isArray(boxSizes) && boxSizes.length === n
      ? boxSizes
      : Array.from({length:n}, ()=> 'M'); // default all 'M' if not provided

    const payload = sizes.map((sz, idx) => ({
      label: `${boxLabelPrefix} ${idx+1}`,
      location: loc._id,
      size: sz,
      items: []  // you can fill later or via UI
    }));

    await Box.insertMany(payload);
  }

  res.status(201).json(loc);
});

/** Update / Delete (unchanged) */
r.put('/:id', async (req, res) => {
  const loc = await Location.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(loc);
});

r.delete('/:id', async (req, res) => {
  await Location.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

export default r;

