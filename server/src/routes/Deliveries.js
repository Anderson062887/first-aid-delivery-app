import { Router } from 'express';
import Delivery from '../models/Delivery.js';
import Item from '../models/Item.js';
import Visit from '../models/Visit.js';


const r = Router();

r.get('/', async (req, res) => {
  try {
    const { location, from, to, repId, repName } = req.query;
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10)));

    const query = {};

    // Filter by location
    if (location) query.location = location;

    // Filter by date range
    const parseDateStart = (d) => {
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      dt.setHours(0,0,0,0);
      return dt;
    };
    const parseDateEnd = (d) => {
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      dt.setHours(23,59,59,999);
      return dt;
    };

    const fromDt = from ? parseDateStart(from) : null;
    const toDt   = to   ? parseDateEnd(to)   : null;
    if (fromDt || toDt) {
      query.deliveredAt = {};
      if (fromDt) query.deliveredAt.$gte = fromDt;
      if (toDt)   query.deliveredAt.$lte = toDt;
    }

    // Filter by rep
    if (repId) {
      const visits = await Visit.find({ rep: repId }, { _id: 1 }).lean();
      const vIds = visits.map(v => v._id);
      if (vIds.length === 0) {
        return res.json({
          data: [],
          pageInfo: { page, limit, total: 0, hasMore: false }
        });
      }
      query.visit = { $in: vIds };
    } else if (repName) {
      query.repName = { $regex: repName, $options: 'i' };
    }

    const total = await Delivery.countDocuments(query);
    const data = await Delivery.find(query)
      .sort({ deliveredAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('location box visit lines.item');

    res.json({
      data,
      pageInfo: {
        page,
        limit,
        total,
        hasMore: page * limit < total
      }
    });
  } catch (err) {
    console.error('List deliveries failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


r.post('/', async (req, res) => {
  try {
    const { repName, deliveredAt, location, box, visit, lines: rawLines } = req.body;

    if (!location) return res.status(400).json({ error: 'location is required' });
    if (!box)      return res.status(400).json({ error: 'box is required' });
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      return res.status(400).json({ error: 'lines must have at least one item' });
    }

    const hydrated = [];
    let subtotal = 0;

    for (const l of rawLines) {
      if (!l?.item) return res.status(400).json({ error: 'line.item is required' });

      const q = Number(l.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        return res.status(400).json({ error: 'line.quantity must be > 0' });
      }

      const it = await Item.findById(l.item);
      if (!it) return res.status(400).json({ error: `Item not found: ${l.item}` });

      // Determine packaging for this line
      const packaging = l.packaging || it.packaging; // 'each' | 'case'

      // Validation rules:
      // - 'each' must be whole number
      // - 'case' can be fractional (e.g., 0.5)
      if (packaging === 'each' && !Number.isInteger(q)) {
        return res.status(400).json({ error: 'Quantity for EACH items must be a whole number' });
      }

      // unitPrice is price per pack (for 'each' it's per item; for 'case' it's per case)
      const unitPrice = Number(it.pricePerPack);
      const lineTotal = unitPrice * q;

      subtotal += lineTotal;
      hydrated.push({
        item: it._id,
        quantity: q,
        packaging,
        unitPrice,
        lineTotal
      });
    }

    const tax = 0;
    const total = subtotal + tax;

    const created = await Delivery.create({
      repName,
      deliveredAt,
      location,
      box,
      visit,
      lines: hydrated,
      subtotal,
      tax,
      total
    });

    const doc = await Delivery.findById(created._id)
      .populate('location box visit lines.item');

    res.status(201).json(doc);
  } catch (err) {
    console.error('Create delivery failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// r.get('/:id', async (req, res) => {
//   try {
//     const delivery = await Delivery.findById(req.params.id)
//       // .populate('rep', 'name') // if you have reps
//       .populate('location', 'name address')
//       .populate('lines.item', 'name price'); // populate items in lines

//     if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

//     res.json(delivery);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Failed to get delivery' });
//   }
// });

r.get('/:id', async (req, res) => {
  try {
    const d = await Delivery.findById(req.params.id)
      // location on the delivery
      .populate({ path: 'location', select: 'name address' })
      // box on the delivery (so the detail page can show label + size)
      .populate({ path: 'box', select: 'label size location' })
      // each line's item
      .populate({ path: 'lines.item', select: 'name pricePerPack packaging unitsPerPack' })
      // visit -> rep + location (rep is on Visit, not on Delivery)
      .populate({
        path: 'visit',
        populate: [
          { path: 'rep', select: 'name roles active' },
          { path: 'location', select: 'name' },
        ],
      });

    if (!d) return res.status(404).json({ error: 'Delivery not found' });
    res.json(d);
  } catch (err) {
    console.error('Get delivery failed:', err);
    res.status(500).json({ error: 'Failed to get delivery' });
  }
});

export default r;

