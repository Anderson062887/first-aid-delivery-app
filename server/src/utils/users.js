// Shared user rules for /api/auth/register and /api/users

export const VALID_ROLES = ['rep', 'admin'];

export function validateRoles(roles) {
  if (!Array.isArray(roles)) return false;
  return roles.every(role => VALID_ROLES.includes(role));
}

// Password validation: min 8 chars, at least one uppercase, one lowercase, one number
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null; // valid
}
