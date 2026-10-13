import jwt from 'jsonwebtoken';

// Log the user in on this response (httpOnly cookie with a 7-day token).
// `tv` ties the token to the user's current tokenVersion.
export function setAuthCookie(res, user) {
  const payload = { _id: user._id, tv: user.tokenVersion || 0 };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
    path: '/',
  });
}
