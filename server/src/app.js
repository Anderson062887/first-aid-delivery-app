import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import items from './routes/Items.js';
import locations from './routes/Locations.js';
import boxes from './routes/Boxes.js';
import deliveries from './routes/Deliveries.js';
import users from './routes/users.js';
import visits from './routes/visits.js';
import exportsRoutes from './routes/exports.js';
import reportsRoutes from './routes/reports.js';

import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import { authRequired, requireRoles } from './middleware/auth.js';
import { setCsrfToken, validateCsrf } from './middleware/csrf.js';
import { validIdQuery } from './middleware/validateIds.js';

const app = express();
app.set('etag', false);
// Nginx on the same host forwards requests; use its X-Forwarded-For as req.ip so
// rate limits apply per client instead of to everyone at once. Only loopback is
// trusted, so clients reaching the port directly cannot spoof their address.
app.set('trust proxy', 'loopback');
// The app is served from the same origin as the API (Nginx in production, the
// Vite proxy in development), so cross-origin requests are refused unless
// CLIENT_ORIGIN lists the allowed origins (comma-separated).
const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieParser());

// Set CSRF token for all authenticated requests
app.use(setCsrfToken);

// server/src/app.js


// Public routes
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Protected routes with CSRF validation on state-changing requests
app.use('/api/users', authRequired, validateCsrf, requireRoles('admin'), users);
app.use('/api/visits', authRequired, validateCsrf, validIdQuery('location', 'repId'), visits);
app.use('/api/items', authRequired, validateCsrf, items);
app.use('/api/locations', authRequired, validateCsrf, locations);
app.use('/api/boxes', authRequired, validateCsrf, boxes);
app.use('/api/deliveries', authRequired, validateCsrf, requireRoles('admin', 'rep'), deliveries);
app.use('/api/exports', authRequired, requireRoles('admin'), validIdQuery('location', 'repId'), exportsRoutes);
app.use('/api/reports', authRequired, validIdQuery('location', 'repId'), reportsRoutes);

// Errors not handled by a route (Express 5 forwards rejected async handlers here)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}` });
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) console.error('Unhandled error:', err);
  // e.g. malformed JSON bodies (400) keep their message; server errors don't leak details
  res.status(status).json({ error: status < 500 && err.expose ? err.message : 'Internal server error' });
});

export default app;


// ...
