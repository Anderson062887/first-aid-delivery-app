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

const app = express();
app.set('etag', false);
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || true,
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
app.use('/api/visits', authRequired, validateCsrf, visits);
app.use('/api/items', authRequired, validateCsrf, items);
app.use('/api/locations', authRequired, validateCsrf, locations);
app.use('/api/boxes', authRequired, validateCsrf, boxes);
app.use('/api/deliveries', authRequired, validateCsrf, requireRoles('admin', 'rep'), deliveries);
app.use('/api/exports', authRequired, requireRoles('admin'), exportsRoutes);
app.use('/api/reports', authRequired, reportsRoutes);

export default app;


// ...
