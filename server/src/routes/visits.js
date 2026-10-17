import { Router } from 'express';
import Visit from '../models/Visit.js';
import Location from '../models/Location.js';
import Box, { ACTIVE_BOX } from '../models/Box.js';
import Delivery from '../models/Delivery.js';
import mongoose from 'mongoose';
import { isAdmin } from '../middleware/auth.js';
import { dayRange } from '../utils/dates.js';
import { validIdParam } from '../middleware/validateIds.js';

const r = Router();
r.param('id', validIdParam);

// Load a visit the current user may change: their own, or any visit for admins.
// Sends the error response and returns null otherwise.
async function loadVisitForChange(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Visit not found' });
    return null;
  }
  const v = await Visit.findById(req.params.id);
  if (!v) {
    res.status(404).json({ error: 'Visit not found' });
    return null;
  }
  if (!isAdmin(req.user) && String(v.rep) !== String(req.user?._id)) {
    res.status(403).json({ error: 'Only the visit\'s rep or an admin can change this visit' });
    return null;
  }
  return v;
}

// Like loadVisitForChange, but a rep can't edit a visit once it's submitted
async function loadOpenVisitForEdit(req, res) {
  const v = await loadVisitForChange(req, res);
  if (v && v.status === 'submitted' && !isAdmin(req.user)) {
    res.status(403).json({ error: 'This visit was already submitted. Ask an admin to make changes.' });
    return null;
  }
  return v;
}

// Boxes of the visit's location that have no delivery on this visit
async function missingBoxes(v) {
  const boxes = await Box.find({ location: v.location, ...ACTIVE_BOX });
  const deliveries = await Delivery.find({ visit: v._id });
  const covered = new Set(deliveries.map(d => String(d.box)));
  return boxes.filter(b => !covered.has(String(b._id)));
}

function incompleteResponse(res, missing) {
  return res.status(400).json({
    error: 'All boxes must be refilled before submitting a COMPLETED visit',
    missingBoxes: missing.map(b => ({ id: b._id, label: b.label }))
  });
}

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
    // Reps only see their own visits; admins can pick any rep
    if (!isAdmin(req.user)) q.rep = req.user._id;
    else if (repId) q.rep = repId;

    // Date filter: use submittedAt if present, else startedAt/createdAt
    // We'll filter on createdAt as a conservative baseline.
    const createdRange = dayRange(from, to, req.query.tz);
    if (createdRange) q.createdAt = createdRange;

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
    if (!mongoose.isValidObjectId(location) || !(await Location.exists({ _id: location }))) {
      return res.status(400).json({ error: 'Location not found' });
    }

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

/**
 * GET /api/visits/my-open
 * The logged-in user's visits still in progress, with how many of the
 * location's boxes are already refilled: [{ _id, location, startedAt, boxesDone, boxesTotal }]
 */
r.get('/my-open', async (req, res) => {
  try {
    const visits = await Visit.find({ rep: req.user._id, status: 'open' })
      .sort({ startedAt: -1 })
      .populate('location', 'name')
      .lean();
    const rows = await Promise.all(visits.map(async v => {
      const [boxes, refilled] = await Promise.all([
        Box.find({ location: v.location?._id, ...ACTIVE_BOX }).select('_id').lean(),
        Delivery.distinct('box', { visit: v._id })
      ]);
      const active = new Set(boxes.map(b => String(b._id)));
      return {
        _id: v._id,
        location: v.location,
        startedAt: v.startedAt,
        boxesTotal: active.size,
        boxesDone: refilled.filter(id => active.has(String(id))).length
      };
    }));
    res.json(rows.filter(v => v.location));
  } catch (e) {
    console.error('My open visits failed:', e);
    res.status(500).json({ error: 'Failed to load visits in progress' });
  }
});

/**
 * GET /api/visits/recent-by-location?per=2
 * The latest `per` visits of every location in one request, for the Locations page.
 * Returns { [locationId]: [visit] }, newest first.
 */
r.get('/recent-by-location', async (req, res) => {
  const per = Math.max(1, Math.min(10, parseInt(req.query.per ?? '2', 10) || 2));

  const groups = await Visit.aggregate([
    // Reps only see their own visits
    // (aggregate doesn't cast ids, so make it an ObjectId)
    { $match: isAdmin(req.user) ? {} : { rep: new mongoose.Types.ObjectId(String(req.user._id)) } },
    // Same "when" the page shows: submitted, else started (open visits included)
    { $addFields: { at: { $ifNull: ['$submittedAt', { $ifNull: ['$startedAt', '$createdAt'] }] } } },
    { $sort: { location: 1, at: -1, _id: -1 } },
    { $group: { _id: '$location', ids: { $push: '$_id' } } },
    { $project: { ids: { $slice: ['$ids', per] } } }
  ]).allowDiskUse(true);

  const visits = await Visit.find({ _id: { $in: groups.flatMap(g => g.ids) } })
    .select('location rep outcome note status startedAt submittedAt createdAt')
    .populate('rep', 'name')
    .lean();
  const byId = new Map(visits.map(v => [String(v._id), v]));

  const result = {};
  for (const g of groups) {
    result[String(g._id)] = g.ids.map(id => byId.get(String(id))).filter(Boolean);
  }
  res.json(result);
});

// Get visit + per-box coverage for that location
r.get('/:id', async (req,res)=>{
  const v = await Visit.findById(req.params.id).populate('rep location');
  // Another rep's visit looks the same as a missing one
  if (!v || (!isAdmin(req.user) && String(v.rep?._id) !== String(req.user._id))) {
    return res.sendStatus(404);
  }
  const boxes = await Box.find({ location: v.location, ...ACTIVE_BOX });
  const deliveries = await Delivery.find({ visit: v._id });
  const covered = new Set(deliveries.map(d=> String(d.box)));
  const coverage = boxes.map(b => ({
    boxId: b._id, label: b.label, size: b.size, covered: covered.has(String(b._id))
  }));
  res.json({ visit: v, boxes: coverage });
});

r.patch('/:id/note', async (req, res) => {
  const v = await loadOpenVisitForEdit(req, res);
  if (!v) return;
  v.note = String(req.body?.note || '');
  await v.save();
  res.json({ ok: true, visit: v });
});

// General update for visit (note and/or outcome)
r.patch('/:id', async (req, res) => {
  try {
    const v = await loadOpenVisitForEdit(req, res);
    if (!v) return;

    const { note, outcome } = req.body || {};

    if (note !== undefined) {
      v.note = String(note);
    }

    if (outcome !== undefined) {
      const allowed = ['completed', 'partial', 'no_access', 'skipped'];
      if (!allowed.includes(outcome)) {
        return res.status(400).json({ error: `Invalid outcome. Use one of: ${allowed.join(', ')}` });
      }
      // Same rule as submitting: "completed" means every box was refilled
      if (outcome === 'completed' && v.outcome !== 'completed') {
        const missing = await missingBoxes(v);
        if (missing.length) return incompleteResponse(res, missing);
      }
      v.outcome = outcome;
    }

    await v.save();
    res.json(v);
  } catch (e) {
    console.error('Update visit failed:', e);
    res.status(500).json({ error: 'Update visit failed' });
  }
});

// Submit only if every box has at least one delivery for this visit
r.post('/:id/submit', async (req,res)=>{
  const { outcome = 'completed', note } = req.body || {};
  const v = await loadVisitForChange(req, res);
  if (!v) return;
  if(v.status === 'submitted') return res.json(v);

  if (note !== undefined) v.note = String(note || '');

  const allowed = ['completed','partial','no_access','skipped'];
  if (!allowed.includes(outcome)) {
    return res.status(400).json({ error: `Invalid outcome. Use one of: ${allowed.join(', ')}` });
  }

  // Only enforce coverage if outcome is "completed"
  if (outcome === 'completed') {
    const missing = await missingBoxes(v);
    if (missing.length) return incompleteResponse(res, missing);
  }

  v.status = 'submitted';
  v.outcome = outcome;
  v.submittedAt = new Date();
  await v.save();
  res.json(v);
});
export default r;

