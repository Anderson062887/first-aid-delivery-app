import { Router } from 'express';
import Location from '../models/Location.js';
import Box from '../models/Box.js';

const r = Router();

// Escape special regex characters to prevent ReDoS attacks
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** List locations */
r.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    const query = {};
    if (q && String(q).trim()) {
      const escaped = escapeRegex(String(q).trim());
      const rx = new RegExp(escaped, 'i');
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
  } catch (e) {
    console.error('List locations failed:', e);
    res.status(500).json({ error: 'Failed to list locations' });
  }
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

/** Update location */
r.put('/:id', async (req, res) => {
  try {
    const { name, address } = req.body;

    // Only allow updating specific fields
    const updates = {};
    if (name !== undefined) updates.name = String(name);
    if (address !== undefined) {
      updates.address = {
        street: String(address.street || ''),
        city: String(address.city || ''),
        state: String(address.state || ''),
        zip: String(address.zip || '')
      };
    }

    const loc = await Location.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!loc) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(loc);
  } catch (e) {
    console.error('Update location failed:', e);
    res.status(400).json({ error: e.message || 'Update location failed' });
  }
});

/** Delete location */
r.delete('/:id', async (req, res) => {
  try {
    const loc = await Location.findByIdAndDelete(req.params.id);
    if (!loc) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.sendStatus(204);
  } catch (e) {
    console.error('Delete location failed:', e);
    res.status(500).json({ error: 'Delete location failed' });
  }
});

export default r;

