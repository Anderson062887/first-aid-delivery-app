import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const r = Router();

// helper to sign cookie
function setAuthCookie(res, user) {
  const payload = { _id: user._id, name: user.name, email: user.email, roles: user.roles || [] };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
    path: '/',
  });
}

// POST /api/auth/login
r.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

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
    const token = req.cookies?.token;
    if (!token) return res.json(null);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json(payload);
  } catch {
    res.json(null);
  }
});

// POST /api/auth/register  (admin only, to create users)
r.post('/register', async (req, res) => {
  try {
    const { name, email, password, roles = ['rep'] } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });

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
