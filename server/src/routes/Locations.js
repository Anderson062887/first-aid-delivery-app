import { Router } from 'express';
import Location from '../models/Location.js';
import Box from '../models/Box.js';
import Visit from '../models/Visit.js';
import Delivery from '../models/Delivery.js';
import { requireRoles } from '../middleware/auth.js';
import { escapeRegex } from '../utils/regex.js';
import { validIdParam } from '../middleware/validateIds.js';

const r = Router();
r.param('id', validIdParam);

const BOX_SIZES = ['S', 'M', 'L', 'XL'];


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
r.post('/', requireRoles('admin'), async (req, res) => {
  const { name, address, boxCount, boxSizes, boxLabelPrefix='Box' } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });

  // Check the boxes before saving anything, so a bad request never leaves a location without its boxes
  let sizes = [];
  if (boxCount !== undefined && boxCount !== null && boxCount !== '' && Number(boxCount) !== 0) {
    const n = Number(boxCount);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      return res.status(400).json({ error: 'Number of boxes must be a whole number from 1 to 20' });
    }
    sizes = Array.isArray(boxSizes) && boxSizes.length === n
      ? boxSizes
      : Array.from({length:n}, ()=> 'M'); // default all 'M' if not provided
    const bad = sizes.find(sz => !BOX_SIZES.includes(sz));
    if (bad !== undefined) {
      return res.status(400).json({ error: `Box size must be one of ${BOX_SIZES.join(', ')}` });
    }
  }
  const prefix = String(boxLabelPrefix ?? '').trim() || 'Box';

  const loc = await Location.create({
    name: name.trim(),
    address: address && typeof address === 'object' ? {
      street: String(address.street || ''),
      city: String(address.city || ''),
      state: String(address.state || ''),
      zip: String(address.zip || '')
    } : undefined
  });

  if (sizes.length) {
    const payload = sizes.map((sz, idx) => ({
      label: `${prefix} ${idx+1}`,
      location: loc._id,
      size: sz,
      items: []  // you can fill later or via UI
    }));

    try {
      await Box.insertMany(payload);
    } catch (e) {
      await Location.findByIdAndDelete(loc._id); // don't leave a location without its boxes
      throw e;
    }
  }

  res.status(201).json(loc);
});

/** Get single location */
r.get('/:id', async (req, res) => {
  try {
    const loc = await Location.findById(req.params.id);
    if (!loc) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(loc);
  } catch (e) {
    console.error('Get location failed:', e);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

/** Update location */
r.put('/:id', requireRoles('admin'), async (req, res) => {
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

/** Delete location (and its boxes). Refused if it has visit/delivery history. */
r.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const loc = await Location.findById(req.params.id);
    if (!loc) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const [visits, deliveries] = await Promise.all([
      Visit.countDocuments({ location: loc._id }),
      Delivery.countDocuments({ location: loc._id })
    ]);
    if (visits > 0 || deliveries > 0) {
      return res.status(409).json({
        error: `"${loc.name}" has ${visits} visit(s) and ${deliveries} delivery(ies) on record, so it can't be deleted.`
      });
    }

    await Box.deleteMany({ location: loc._id });
    await Location.findByIdAndDelete(loc._id);
    res.sendStatus(204);
  } catch (e) {
    console.error('Delete location failed:', e);
    res.status(500).json({ error: 'Delete location failed' });
  }
});

export default r;

