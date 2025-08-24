import jwt from 'jsonwebtoken';

export function authRequired(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Auth required' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { _id, name, email, roles }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid/expired token' });
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
