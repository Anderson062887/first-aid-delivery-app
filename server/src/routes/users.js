// server/src/routes/users.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const r = Router();

/**
 * List users (no passwordHash leaked)
 */
r.get('/', async (_req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ name: 1 })
    .lean();
  res.json(users);
});

/**
 * Create user (requires email + password)
 * Body: { name, email, password, roles?, active? }
 */
r.post('/', async (req, res) => {
  try {
    const { name, email, password, roles = ['rep'], active = true } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'User already exists for this email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name || '',
      email: String(email).toLowerCase().trim(),
      roles: Array.isArray(roles) && roles.length ? roles : ['rep'],
      active: !!active,
      passwordHash
    });

    const { passwordHash: _ph, ...safe } = user.toObject();
    res.status(201).json(safe);
  } catch (err) {
    console.error('User create failed:', err);
    res.status(400).json({ error: err.message || 'Create user failed' });
  }
});

/**
 * Get user by id (no passwordHash)
 */
r.get('/:id', async (req, res) => {
  const u = await User.findById(req.params.id).select('-passwordHash').lean();
  if (!u) return res.sendStatus(404);
  res.json(u);
});

/**
 * Update user
 * Body: { name?, email?, active?, roles?, password? }
 * If password is provided, it will be reset.
 */
r.patch('/:id', async (req, res) => {
  try {
    const { name, email, active, roles, password } = req.body || {};
    const u = await User.findById(req.params.id);
    if (!u) return res.sendStatus(404);

    if (name !== undefined) u.name = name;
    if (email !== undefined) {
      const lower = String(email).toLowerCase().trim();
      if (lower !== u.email) {
        const exists = await User.findOne({ email: lower, _id: { $ne: u._id } });
        if (exists) return res.status(400).json({ error: 'Another user already uses this email' });
        u.email = lower;
      }
    }
    if (active !== undefined) u.active = !!active;
    if (roles !== undefined) u.roles = Array.isArray(roles) ? roles : u.roles;

    if (password !== undefined && password !== '') {
      u.passwordHash = await bcrypt.hash(password, 10);
    }

    await u.save();

    const { passwordHash: _ph, ...safe } = u.toObject();
    res.json(safe);
  } catch (err) {
    console.error('User update failed:', err);
    res.status(400).json({ error: err.message || 'Update user failed' });
  }
});

/**
 * Delete user
 */
r.delete('/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default r;




