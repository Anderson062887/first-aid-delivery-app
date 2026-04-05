// server/src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

// Skip rate limiting in test environment
const skip = () => process.env.NODE_ENV === 'test';

// Strict rate limit for login attempts - prevents brute force
export const loginLimiter = rateLimit({
  skip,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Moderate rate limit for registration
export const registerLimiter = rateLimit({
  skip,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 registrations per hour per IP
  message: { error: 'Too many accounts created. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// General API rate limit
export const apiLimiter = rateLimit({
  skip,
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});
