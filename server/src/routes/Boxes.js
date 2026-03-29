import { Router } from 'express';
import Box from '../models/Box.js';

const r = Router();

r.get('/', async (req, res) => {
  try {
    const { location } = req.query;
    const q = location ? { location } : {};
    const boxes = await Box.find(q).populate('location').populate('items.item');
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

export default r;

