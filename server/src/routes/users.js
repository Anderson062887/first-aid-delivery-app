// server/src/routes/users.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const r = Router();

// Valid role values
const VALID_ROLES = ['rep', 'admin'];

function validateRoles(roles) {
  if (!Array.isArray(roles)) return false;
  return roles.every(r => VALID_ROLES.includes(r));
}

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

    // Validate roles
    const userRoles = Array.isArray(roles) && roles.length ? roles : ['rep'];
    if (!validateRoles(userRoles)) {
      return res.status(400).json({ error: `Invalid roles. Allowed: ${VALID_ROLES.join(', ')}` });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name || '',
      email: String(email).toLowerCase().trim(),
      roles: userRoles,
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
    if (roles !== undefined) {
      if (!Array.isArray(roles) || !validateRoles(roles)) {
        return res.status(400).json({ error: `Invalid roles. Allowed: ${VALID_ROLES.join(', ')}` });
      }
      u.roles = roles;
    }

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
 * Cannot delete the last admin user
 */
r.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this user is an admin
    const isAdmin = (user.roles || []).includes('admin');
    if (isAdmin) {
      // Count how many active admin users exist
      const adminCount = await User.countDocuments({
        roles: 'admin',
        active: { $ne: false }
      });

      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last admin user'
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete user failed:', e);
    res.status(500).json({ error: 'Delete user failed' });
  }
});

export default r;




