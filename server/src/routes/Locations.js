import { Router } from 'express';
import Location from '../models/Location.js';
import Box from '../models/Box.js';

const r = Router();

/** List locations */
r.get('/', async (req, res) => {
  const list = await Location.find().sort('name');
  res.json(list);
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

