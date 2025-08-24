import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import items from './routes/items.js';
import locations from './routes/locations.js';
import boxes from './routes/boxes.js';
import deliveries from './routes/deliveries.js';
import users from './routes/users.js';
import visits from './routes/visits.js';

import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import { authRequired, requireRoles } from './middleware/auth.js';

const app = express();
app.set('etag', false);
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieParser());

// server/src/app.js


// ...
app.use('/api/auth', authRoutes);
app.use('/api/users', authRequired, requireRoles('admin'),users);
app.use('/api/visits', authRequired,visits);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/items',authRequired, requireRoles('admin'), items);
app.use('/api/locations',authRequired, locations);
app.use('/api/boxes',authRequired, boxes);
app.use('/api/deliveries',authRequired, requireRoles('admin',"rep"), deliveries);

export default app;
