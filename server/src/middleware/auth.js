import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Resolve the logged-in user from the auth cookie.
 * The token only identifies the user; name, roles and active status are read
 * from the database on every request, so deactivating a user or changing
 * their roles takes effect immediately (not when the 7-day token expires),
 * and changing the password ends every older session.
 * Returns null when there is no valid session.
 */
export async function userFromToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  const user = await User.findById(payload?._id).select('name email roles active tokenVersion').lean();
  if (!user || user.active === false) return null;
  // Password changed since this token was issued (older tokens have no tv: version 0)
  if ((payload.tv || 0) !== (user.tokenVersion || 0)) return null;
  return { _id: String(user._id), name: user.name, email: user.email, roles: user.roles || [] };
}

export async function authRequired(req, res, next) {
  try {
    if (!req.cookies?.token) return res.status(401).json({ error: 'Auth required' });

    const user = await userFromToken(req.cookies.token);
    if (!user) {
      res.clearCookie('token', { path: '/' });
      return res.status(401).json({ error: 'Session expired or account disabled. Please log in again.' });
    }
    req.user = user; // { _id, name, email, roles }
    next();
  } catch (e) {
    console.error('Auth check failed:', e);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

export function requireRoles(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    const ok = roles.some(r => allowed.includes(r));
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

export function isAdmin(user) {
  return (user?.roles || []).includes('admin');
}
