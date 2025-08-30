import { Router } from 'express';
import Item from '../models/Item.js';
import { requireRoles } from '../middleware/auth.js';

const r = Router();

/**
 * GET /api/items
 * Visible to any authenticated user (admin or rep)
 */
r.get('/', async (_req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 }).lean();
    res.json(items);
  } catch (e) {
    console.error('Items list failed:', e);
    res.status(500).json({ error: 'Failed to load items' });
  }
});

/**
 * GET /api/items/:id
 * Visible to any authenticated user
 */
r.get('/:id', async (req, res) => {
  try {
    const it = await Item.findById(req.params.id).lean();
    if (!it) return res.sendStatus(404);
    res.json(it);
  } catch (e) {
    console.error('Item get failed:', e);
    res.status(500).json({ error: 'Failed to get item' });
  }
});

/**
 * POST /api/items
 * Admin only
 */
r.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const { name,sku,packaging = 'each', unitsPerPack = 1, pricePerPack } = req.body || {};
    console.log(req.body)
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (pricePerPack == null) return res.status(400).json({ error: 'pricePerPack is required' });

    const it = await Item.create({ name, sku,packaging, unitsPerPack, pricePerPack });
    res.status(201).json(it);
  } catch (e) {
    console.error('Item create failed:', e);
    res.status(400).json({ error: e.message || 'Create item failed' });
  }
});

/**
 * PATCH /api/items/:id
 * Admin only
 */
r.patch('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const it = await Item.findById(req.params.id);
    if (!it) return res.sendStatus(404);

    const { name, packaging, unitsPerPack, pricePerPack } = req.body || {};
    if (name !== undefined) it.name = name;
    if (packaging !== undefined) it.packaging = packaging;
    if (unitsPerPack !== undefined) it.unitsPerPack = unitsPerPack;
    if (pricePerPack !== undefined) it.pricePerPack = pricePerPack;

    await it.save();
    res.json(it);
  } catch (e) {
    console.error('Item update failed:', e);
    res.status(400).json({ error: e.message || 'Update item failed' });
  }
});

/**
 * DELETE /api/items/:id
 * Admin only
 */
r.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Item delete failed:', e);
    res.status(400).json({ error: e.message || 'Delete item failed' });
  }
});





export default r;
