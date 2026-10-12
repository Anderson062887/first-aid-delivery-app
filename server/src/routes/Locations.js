import { Router } from 'express';
import Location from '../models/Location.js';
import Box from '../models/Box.js';
import Visit from '../models/Visit.js';
import Delivery from '../models/Delivery.js';
import { requireRoles } from '../middleware/auth.js';

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
r.post('/', requireRoles('admin'), async (req, res) => {
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

