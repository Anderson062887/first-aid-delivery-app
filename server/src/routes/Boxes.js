import { Router } from 'express';
import Box from '../models/Box.js';

const r = Router();

r.get('/', async (req, res) => {
  const { location } = req.query;
  const q = location ? { location } : {};
  const boxes = await Box.find(q).populate('location').populate('items.item');
  res.json(boxes);
});

// ADD THIS:
r.get('/:id', async (req, res) => {
  const b = await Box.findById(req.params.id).populate('location').populate('items.item');
  if (!b) return res.sendStatus(404);
  res.json(b);
});

export default r;

