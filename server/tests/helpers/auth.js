import jwt from 'jsonwebtoken';

export function generateAuthToken(user) {
  return jwt.sign(
    { _id: user._id, name: user.name, email: user.email, roles: user.roles },
    process.env.JWT_SECRET || 'test-jwt-secret-for-testing',
    { expiresIn: '1h' }
  );
}

export function authCookie(user) {
  const token = generateAuthToken(user);
  return `token=${token}`;
}
