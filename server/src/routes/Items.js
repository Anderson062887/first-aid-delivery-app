import { Router } from 'express';
import Item from '../models/Item.js';

const r = Router();

r.get('/', async (req, res) => {
  const items = await Item.find({}).sort('name');
  res.json(items);
});

r.post('/', async (req, res) => {
  try {
    // Basic normalization
    const payload = {
      name: req.body.name?.trim(),
      sku: req.body.sku?.trim(),
      packaging: req.body.packaging,               // 'each' | 'case'
      unitsPerPack: Number(req.body.unitsPerPack), // e.g. 1 or 100
      pricePerPack: Number(req.body.pricePerPack), // e.g. 2.00 or 18.50
      active: req.body.active ?? true
    };

    // Simple validation guardrails (optional but helpful)
    if (!payload.name) return res.status(400).json({ error: 'name is required' });
    if (!['each', 'case'].includes(payload.packaging)) {
      return res.status(400).json({ error: "packaging must be 'each' or 'case'" });
    }
    if (Number.isNaN(payload.unitsPerPack) || payload.unitsPerPack < 1) {
      return res.status(400).json({ error: 'unitsPerPack must be a positive number' });
    }
    if (Number.isNaN(payload.pricePerPack) || payload.pricePerPack < 0) {
      return res.status(400).json({ error: 'pricePerPack must be a non-negative number' });
    }

    const item = await Item.create(payload);
    res.status(201).json(item);
  } catch (err) {
    console.error('Create item failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default r;
