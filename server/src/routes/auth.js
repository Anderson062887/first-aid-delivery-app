import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { authRequired, requireRoles, userFromToken } from '../middleware/auth.js';
import { VALID_ROLES, validateRoles, validatePassword } from '../utils/users.js';
import { setAuthCookie } from '../utils/authCookie.js';

const r = Router();

// POST /api/auth/login
r.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    // Must be plain text (an object here would crash .toLowerCase() or reach the query)
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), active: true });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    setAuthCookie(res, user);
    res.json({ _id: user._id, name: user.name, email: user.email, roles: user.roles });
  } catch (e) {
    console.error('login failed:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
r.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

// GET /api/auth/me
r.get('/me', async (req, res) => {
  try {
    // Fresh from the DB: reflects role changes and deactivation right away
    const user = await userFromToken(req.cookies?.token);
    if (!user && req.cookies?.token) res.clearCookie('token', { path: '/' });
    res.json(user);
  } catch {
    res.json(null);
  }
});

// POST /api/auth/register  (admin only, to create users)
r.post('/register', registerLimiter, authRequired, requireRoles('admin'), async (req, res) => {
  try {
    const { name, email, password, roles = ['rep'] } = req.body || {};
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name.trim() || !email.trim() || !password) {
      return res.status(400).json({ error: 'name, email, password required' });
    }

    // Validate roles against the allowed set
    if (!validateRoles(roles) || roles.length === 0) {
      return res.status(400).json({ error: `Invalid roles. Allowed: ${VALID_ROLES.join(', ')}` });
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase().trim(), passwordHash, roles });

    res.status(201).json({ _id: user._id, name: user.name, email: user.email, roles: user.roles });
  } catch (e) {
    console.error('register failed:', e);
    res.status(500).json({ error: 'Register failed' });
  }
});

export default r;
