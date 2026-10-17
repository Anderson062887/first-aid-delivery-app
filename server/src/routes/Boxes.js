import { Router } from 'express';
import mongoose from 'mongoose';
import Box, { ACTIVE_BOX } from '../models/Box.js';
import Location from '../models/Location.js';
import Delivery from '../models/Delivery.js';
import Item from '../models/Item.js';
import { requireRoles } from '../middleware/auth.js';
import { validIdParam } from '../middleware/validateIds.js';

const r = Router();
r.param('id', validIdParam);

const SIZES = ['S', 'M', 'L', 'XL'];

/** List boxes. Retired boxes are left out unless ?all=1. */
r.get('/', async (req, res) => {
  try {
    const { location, all } = req.query;
    if (location && !mongoose.isValidObjectId(location)) {
      return res.status(400).json({ error: 'Invalid location id' });
    }
    const q = location ? { location } : {};
    if (all !== '1' && all !== 'true') Object.assign(q, ACTIVE_BOX);
    const boxes = await Box.find(q).sort({ createdAt: 1, _id: 1 }).populate('location').populate('items.item');
    res.json(boxes);
  } catch (e) {
    console.error('List boxes failed:', e);
    res.status(500).json({ error: 'Failed to list boxes' });
  }
});

r.get('/:id', async (req, res) => {
  try {
    const b = await Box.findById(req.params.id).populate('location').populate('items.item');
    if (!b) return res.status(404).json({ error: 'Box not found' });
    res.json(b);
  } catch (e) {
    console.error('Get box failed:', e);
    res.status(500).json({ error: 'Failed to get box' });
  }
});

/**
 * GET /api/boxes/:id/last-refill
 * What to start a refill of this box with: the items and amounts of its most
 * recent refill, or else the box's standard contents (items with a par level).
 * Items that are no longer active are left out.
 * Returns { source: 'last-refill' | 'standard' | null, date, lines: [{ item, packaging, quantity }] }
 */
r.get('/:id/last-refill', async (req, res) => {
  try {
    const box = await Box.findById(req.params.id).lean();
    if (!box) return res.status(404).json({ error: 'Box not found' });

    let source = null, date = null, lines = [];
    const last = await Delivery.findOne({ box: box._id }).sort({ deliveredAt: -1, _id: -1 }).lean();
    if (last?.lines?.length) {
      source = 'last-refill';
      date = last.deliveredAt || last.createdAt;
      lines = last.lines.map(l => ({ item: String(l.item), packaging: l.packaging, quantity: l.quantity }));
    } else if (box.items?.some(i => i.par > 0)) {
      source = 'standard';
      const defs = await Item.find({ _id: { $in: box.items.map(i => i.item) } }).select('packaging').lean();
      const pkg = new Map(defs.map(i => [String(i._id), i.packaging || 'each']));
      lines = box.items.filter(i => i.par > 0)
        .map(i => ({ item: String(i.item), packaging: pkg.get(String(i.item)) || 'each', quantity: i.par }));
    }

    if (lines.length) {
      const active = new Set((await Item.find({ _id: { $in: lines.map(l => l.item) }, active: { $ne: false } })
        .select('_id').lean()).map(i => String(i._id)));
      lines = lines.filter(l => active.has(l.item));
    }
    res.json({ source: lines.length ? source : null, date, lines });
  } catch (e) {
    console.error('Last refill failed:', e);
    res.status(500).json({ error: 'Failed to load the last refill' });
  }
});

/** Add a box to a location. Body: { location, size, label? } */
r.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const { location, size } = req.body || {};
    let label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';

    if (!location || !mongoose.isValidObjectId(location)) {
      return res.status(400).json({ error: 'location is required' });
    }
    if (!SIZES.includes(size)) {
      return res.status(400).json({ error: `size must be one of ${SIZES.join(', ')}` });
    }
    if (!(await Location.exists({ _id: location }))) {
      return res.status(400).json({ error: 'Location not found' });
    }
    if (!label) label = `Box ${(await Box.countDocuments({ location })) + 1}`;

    const box = await Box.create({ location, size, label });
    res.status(201).json(box);
  } catch (e) {
    console.error('Create box failed:', e);
    res.status(500).json({ error: 'Failed to create box' });
  }
});

/** Rename, resize, retire or restore a box. Body: { label?, size?, active? } */
r.patch('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const { label, size, active } = req.body || {};
    const update = {};

    if (label !== undefined) {
      if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label cannot be empty' });
      update.label = label.trim();
    }
    if (size !== undefined) {
      if (!SIZES.includes(size)) return res.status(400).json({ error: `size must be one of ${SIZES.join(', ')}` });
      update.size = size;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be true or false' });
      update.active = active;
    }

    const box = await Box.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!box) return res.status(404).json({ error: 'Box not found' });
    res.json(box);
  } catch (e) {
    console.error('Update box failed:', e);
    res.status(500).json({ error: 'Failed to update box' });
  }
});

/** Delete a box. Refused if deliveries reference it: retire it instead. */
r.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    if (await Delivery.exists({ box: req.params.id })) {
      return res.status(409).json({ error: 'This box has delivery history. Retire it instead.' });
    }
    const box = await Box.findByIdAndDelete(req.params.id);
    if (!box) return res.status(404).json({ error: 'Box not found' });
    res.status(204).end();
  } catch (e) {
    console.error('Delete box failed:', e);
    res.status(500).json({ error: 'Failed to delete box' });
  }
});

export default r;
