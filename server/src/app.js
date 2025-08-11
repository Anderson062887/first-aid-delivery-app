import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import items from './routes/items.js';
import locations from './routes/locations.js';
import boxes from './routes/boxes.js';
import deliveries from './routes/deliveries.js';
import users from './routes/users.js';
import visits from './routes/visits.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// server/src/app.js


// ...

app.use('/api/users', users);
app.use('/api/visits', visits);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/items', items);
app.use('/api/locations', locations);
app.use('/api/boxes', boxes);
app.use('/api/deliveries', deliveries);

export default app;
