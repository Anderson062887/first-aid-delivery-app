import { Router } from 'express';
import Visit from '../models/Visit.js';
import Box from '../models/Box.js';
import Delivery from '../models/Delivery.js';

const r = Router();

// Start (or reuse) today's open visit for a rep+location
r.post('/', async (req,res)=>{
  const { rep, location } = req.body;
  if(!rep || !location) return res.status(400).json({ error:'rep and location are required' });

  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date();   end.setHours(23,59,59,999);

  const existing = await Visit.findOne({
    rep, location, status: 'open',
    startedAt: { $gte: start, $lte: end }
  });
  if (existing) return res.status(200).json(existing);

  const v = await Visit.create({ rep, location });
  res.status(201).json(v);
});

// Get visit + per-box coverage
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

// Submit only if every box has at least one delivery in this visit
r.post('/:id/submit', async (req,res)=>{
  const v = await Visit.findById(req.params.id);
  if(!v) return res.sendStatus(404);
  if(v.status === 'submitted') return res.json(v);

  const boxes = await Box.find({ location: v.location });
  const deliveries = await Delivery.find({ visit: v._id });

  const covered = new Set(deliveries.map(d=> String(d.box)));
  const missing = boxes.filter(b => !covered.has(String(b._id)));

  if(missing.length){
    return res.status(400).json({
      error: 'All boxes must be refilled before submitting',
      missingBoxes: missing.map(b => ({ id: b._id, label: b.label }))
    });
  }

  v.status = 'submitted';
  v.submittedAt = new Date();
  await v.save();
  res.json(v);
});

export default r;
