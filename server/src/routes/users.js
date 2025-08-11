import { Router } from 'express';
import User from '../models/User.js';

const r = Router();

r.get('/', async (_req, res) => {
  const users = await User.find().sort({ name: 1 });
  res.json(users);
});

r.post('/', async (req, res) => {
  try {
    const { name, email, active = true, roles = ['rep'] } = req.body;
    const u = await User.create({ name, email, active, roles });
    res.status(201).json(u);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Create user failed' });
  }
});

r.get('/:id', async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.sendStatus(404);
  res.json(u);
});

r.patch('/:id', async (req, res) => {
  try {
    const { name, email, active, roles } = req.body;
    const u = await User.findById(req.params.id);
    if (!u) return res.sendStatus(404);
    if (name !== undefined) u.name = name;
    if (email !== undefined) u.email = email;
    if (active !== undefined) u.active = !!active;
    if (roles !== undefined) u.roles = roles;
    await u.save(); // will trigger validator
    res.json(u);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Update user failed' });
  }
});

r.delete('/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default r;



