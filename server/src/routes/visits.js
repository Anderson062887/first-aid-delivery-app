import { Router } from 'express';
import Visit from '../models/Visit.js';
import Box from '../models/Box.js';
import Delivery from '../models/Delivery.js';

const r = Router();

/**
 * GET /api/visits
 * Query (all optional):
 *  - location: ObjectId      -> filter by location
 *  - rep: ObjectId           -> filter by rep
 *  - from: YYYY-MM-DD        -> startedAt >= from (00:00)
 *  - to:   YYYY-MM-DD        -> startedAt <= to   (23:59)
 *  - limit: number           -> default 10
 */
// r.get('/', async (req, res) => {
//   const { location, rep, from, to } = req.query;
//   const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '10', 10)));

//   const q = {};
//   if (location) q.location = location;
//   if (rep) q.rep = rep;

//   const parseStart = (d) => { const dt = new Date(d); if (isNaN(dt)) return null; dt.setHours(0,0,0,0); return dt; };
//   const parseEnd   = (d) => { const dt = new Date(d); if (isNaN(dt)) return null; dt.setHours(23,59,59,999); return dt; };
//   const fromDt = from ? parseStart(from) : null;
//   const toDt   = to   ? parseEnd(to)     : null;
//   if (fromDt || toDt) {
//     q.startedAt = {};
//     if (fromDt) q.startedAt.$gte = fromDt;
//     if (toDt)   q.startedAt.$lte = toDt;
//   }

//   const list = await Visit.find(q)
//     .sort({ startedAt: -1, _id: -1 })
//     .limit(limit)
//     .populate('rep location');

//   res.json(list);
// });

r.get('/', async (req, res) => {
  try {
    const { location, repId, from, to } = req.query;
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit ?? '5', 10)));

    const q = {};
    if (location) q.location = location;
    if (repId) q.rep = repId;

    // Date filter: use submittedAt if present, else startedAt/createdAt
    // We'll filter on createdAt as a conservative baseline.
    const parseDateStart = (d) => {
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      dt.setHours(0, 0, 0, 0);
      return dt;
    };
    const parseDateEnd = (d) => {
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      dt.setHours(23, 59, 59, 999);
      return dt;
    };

    const fromDt = from ? parseDateStart(from) : null;
    const toDt   = to   ? parseDateEnd(to)   : null;
    if (fromDt || toDt) {
      q.createdAt = {};
      if (fromDt) q.createdAt.$gte = fromDt;
      if (toDt)   q.createdAt.$lte = toDt;
    }

    const rows = await Visit.find(q)
      .sort({ submittedAt: -1, startedAt: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'rep', select: 'name roles active' })
      .populate({ path: 'location', select: 'name' })
      .lean();

    // Return a plain array; the client tolerates array or {data}
    res.json(rows);
  } catch (e) {
    console.error('List visits failed:', e);
    res.status(500).json({ error: 'Failed to list visits' });
  }
});

// Start (or reuse) today's open visit for a rep+location
// r.post('/', async (req,res)=>{
//   const { rep, location } = req.body;
//   if(!rep || !location) return res.status(400).json({ error:'rep and location are required' });

//   const start = new Date(); start.setHours(0,0,0,0);
//   const end = new Date();   end.setHours(23,59,59,999);

//   const existing = await Visit.findOne({
//     rep, location, status: 'open',
//     startedAt: { $gte: start, $lte: end }
//   });
//   if (existing) return res.status(200).json(existing);

//   const v = await Visit.create({ rep, location });
//   res.status(201).json(v);
// });


// r.post('/', async (req, res) => {
//   try {
//     const repId = req.user?._id; // from auth cookie
//     if (!repId) return res.status(401).json({ error: 'Auth required' });

//     const { location } = req.body || {};
//     if (!location) return res.status(400).json({ error: 'location is required' });

//     // If there is an open (not submitted) visit for this rep+location, resume it
//     let visit = await Visit.findOne({ rep: repId, location, submittedAt: null });
//     if (!visit) {
//       visit = await Visit.create({
//         rep: repId,
//         location,
//         startedAt: new Date()
//       });
//     }

//     // return populated basics
//     visit = await Visit.findById(visit._id)
//       .populate('rep', 'name roles active')
//       .populate('location', 'name address')
//       .lean();

//     res.status(201).json(visit);
//   } catch (e) {
//     console.error('Start visit failed:', e);
//     res.status(500).json({ error: 'Start visit failed' });
//   }
// });

r.post('/', async (req, res) => {
  try {
    const repId = req.user?._id;
    if (!repId) return res.status(401).json({ error: 'Auth required' });

    const { location } = req.body || {};
    if (!location) return res.status(400).json({ error: 'location is required' });

    let visit = await Visit.findOne({ rep: repId, location, submittedAt: null });
    if (!visit) {
      visit = await Visit.create({ rep: repId, location, startedAt: new Date() });
    }

    visit = await Visit.findById(visit._id)
      .populate('rep', 'name roles active')
      .populate('location', 'name address')
      .lean();

    res.status(201).json(visit);
  } catch (e) {
    console.error('Start visit failed:', e);
    res.status(500).json({ error: 'Start visit failed' });
  }
});

// Get visit + per-box coverage for that location
r.get('/:id', async (req,res)=>{
  const v = await Visit.findById(req.params.id).populate('rep location');
  if(!v) return res.sendStatus(404);
  const boxes = await Box.find({ location: v.location });
  const deliveries = await Delivery.find({ visit: v._id });
  const covered = new Set(deliveries.map(d=> String(d.box)));
  const coverage = boxes.map(b => ({
    boxId: b._id, label: b.label, size: b.size, covered: covered.has(String(b._id))
  }));
  res.json({ visit: v, boxes: coverage });
});

r.patch('/:id/note', async (req, res) => {
  const v = await Visit.findById(req.params.id);
  if (!v) return res.sendStatus(404);
  v.note = String(req.body?.note || '');
  await v.save();
  res.json({ ok: true, visit: v });
});

// Submit only if every box has at least one delivery for this visit
r.post('/:id/submit', async (req,res)=>{
  const { outcome = 'completed', note } = req.body || {};
  const v = await Visit.findById(req.params.id);
  if(!v) return res.sendStatus(404);
  if(v.status === 'submitted') return res.json(v);

  if (note !== undefined) v.note = String(note || '');

  const allowed = ['completed','partial','no_access','skipped'];
  if (!allowed.includes(outcome)) {
    return res.status(400).json({ error: `Invalid outcome. Use one of: ${allowed.join(', ')}` });
  }

  // Only enforce coverage if outcome is "completed"
  if (outcome === 'completed') {
    const boxes = await Box.find({ location: v.location });
    const deliveries = await Delivery.find({ visit: v._id });
    const covered = new Set(deliveries.map(d=> String(d.box)));
    const missing = boxes.filter(b => !covered.has(String(b._id)));
    if(missing.length){
      return res.status(400).json({
        error: 'All boxes must be refilled before submitting a COMPLETED visit',
        missingBoxes: missing.map(b => ({ id: b._id, label: b.label }))
      });
    }
  }

  v.status = 'submitted';
  v.outcome = outcome;
  v.submittedAt = new Date();
  await v.save();
  res.json(v);
});
export default r;

