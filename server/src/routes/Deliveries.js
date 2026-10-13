import { Router } from 'express';
import mongoose from 'mongoose';
import Delivery from '../models/Delivery.js';
import Item from '../models/Item.js';
import Visit from '../models/Visit.js';
import Box from '../models/Box.js';
import { isAdmin } from '../middleware/auth.js';
import { dayRange } from '../utils/dates.js';
import { escapeRegex } from '../utils/regex.js';
import { repDeliveriesFilter, isOwnDelivery } from '../utils/repDeliveries.js';
import { validIdParam } from '../middleware/validateIds.js';

// Must match the client (ItemPicker/Cart): a case costs pricePerPack,
// a single unit costs pricePerPack / unitsPerPack.
function unitPriceFor(item, packaging) {
  const packPrice = Number(item.pricePerPack);
  const unitsPerPack = Number(item.unitsPerPack) || 1;
  return packaging === 'case' ? packPrice : packPrice / unitsPerPack;
}



const r = Router();
r.param('id', validIdParam);

function paging(q) {
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50));
  return { page, limit };
}

/**
 * Build the Mongo filter shared by the list endpoints. Ids are cast to ObjectId
 * so the same filter works in both find() and aggregate().
 * Returns { query } or { error } (bad input).
 */
async function buildListQuery(q, user) {
  const { location, from, to, repName, visit } = q;
  // Reps only ever see their own deliveries; admins can pick any rep
  const repId = isAdmin(user) ? q.repId : user?._id;
  const query = {};

  for (const [name, id] of [['location', location], ['visit', visit], ['repId', repId]]) {
    if (id && !mongoose.isValidObjectId(id)) return { error: `Invalid ${name} id` };
  }
  const oid = (id) => new mongoose.Types.ObjectId(String(id));

  if (location) query.location = oid(location);
  if (visit) query.visit = oid(visit);

  // Filter by date range (calendar days in the user's timezone)
  const deliveredRange = dayRange(from, to, q.tz);
  if (deliveredRange) query.deliveredAt = deliveredRange;

  // Filter by rep
  if (repId) {
    query.$and = [await repDeliveriesFilter(oid(repId), isAdmin(user) ? undefined : user.name)];
  } else if (repName && String(repName).trim()) {
    query.repName = { $regex: escapeRegex(String(repName).trim()), $options: 'i' };
  }

  return { query };
}

r.get('/', async (req, res) => {
  try {
    const { page, limit } = paging(req.query);
    const { query, error } = await buildListQuery(req.query, req.user);
    if (error) return res.status(400).json({ error });

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

/**
 * Deliveries grouped by visit, paged by group so a visit is never split across
 * pages. Deliveries without a visit are one row each.
 * Same filters as GET /. Returns { data: [group], pageInfo } where total counts groups.
 */
r.get('/by-visit', async (req, res) => {
  try {
    const { page, limit } = paging(req.query);
    const { query, error } = await buildListQuery(req.query, req.user);
    if (error) return res.status(400).json({ error });

    const [result] = await Delivery.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $ifNull: ['$visit', '$_id'] },
          visit: { $first: '$visit' },
          delivery: { $first: '$_id' },
          location: { $first: '$location' },
          repName: { $first: '$repName' },
          when: { $min: { $ifNull: ['$deliveredAt', '$createdAt'] } },
          boxCount: { $sum: 1 },
          total: { $sum: { $ifNull: ['$total', 0] } }
        }
      },
      { $sort: { when: -1, _id: -1 } },
      {
        $facet: {
          rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          count: [{ $count: 'total' }]
        }
      }
    ]);

    const rows = result?.rows || [];
    const total = result?.count?.[0]?.total || 0;

    await Delivery.populate(rows, [
      { path: 'location', model: 'Location', select: 'name' },
      { path: 'visit', model: 'Visit', select: 'rep outcome note status', populate: { path: 'rep', select: 'name' } }
    ]);

    const data = rows.map(g => ({
      key: String(g._id),
      visitId: g.visit?._id ? String(g.visit._id) : null,
      deliveryId: g.visit ? null : String(g.delivery),
      when: g.when,
      repName: g.visit?.rep?.name || g.repName || '',
      locationName: g.location?.name || '',
      boxCount: g.boxCount,
      total: Math.round(g.total * 100) / 100,
      outcome: g.visit?.outcome || '',
      note: g.visit?.note || ''
    }));

    res.json({ data, pageInfo: { page, limit, total, hasMore: page * limit < total } });
  } catch (err) {
    console.error('List deliveries by visit failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.post('/', async (req, res) => {
  try {
    const { deliveredAt, location, box, visit, lines: rawLines } = req.body || {};
    const clientId = typeof req.body?.clientId === 'string' && req.body.clientId.trim()
      ? req.body.clientId.trim().slice(0, 100)
      : undefined;

    // --- a retry of a request that was already saved: return that delivery ---
    if (clientId) {
      const existing = await Delivery.findOne({ clientId }).populate('location box visit lines.item');
      if (existing) return res.status(200).json(existing);
    }

    // --- basic validation ---
    if (!location) return res.status(400).json({ error: 'location is required' });
    if (!box)      return res.status(400).json({ error: 'box is required' });
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      return res.status(400).json({ error: 'lines must have at least one item' });
    }
    for (const [name, id] of [['location', location], ['box', box], ['visit', visit]]) {
      if (id && !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: `Invalid ${name} id` });
      }
    }

    // --- the box must be one of this location's boxes ---
    const boxDoc = await Box.findById(box).lean();
    if (!boxDoc) return res.status(400).json({ error: 'Box not found' });
    if (String(boxDoc.location) !== String(location)) {
      return res.status(400).json({ error: 'That box does not belong to this location' });
    }
    if (boxDoc.active === false) {
      return res.status(400).json({ error: 'That box has been retired' });
    }

    // --- rep name: from visit.rep if provided, otherwise from the logged-in user ---
    let repName = req.user?.name || '';
    let rep = req.user?._id;
    if (visit) {
      const vdoc = await Visit.findById(visit).populate('rep', 'name').lean();
      if (!vdoc) return res.status(400).json({ error: 'Visit not found' });
      if (!isAdmin(req.user) && String(vdoc.rep?._id) !== String(req.user?._id)) {
        return res.status(403).json({ error: 'You can only add deliveries to your own visits' });
      }
      if (vdoc.status === 'submitted') {
        return res.status(409).json({ error: 'This visit was already submitted; deliveries can no longer be added' });
      }
      if (String(vdoc.location) !== String(location)) {
        return res.status(400).json({ error: 'The visit is for a different location' });
      }
      // One delivery per box per visit; changes go through editing that delivery
      if (await Delivery.exists({ visit, box })) {
        return res.status(409).json({
          error: 'This box was already refilled on this visit. Edit that delivery instead.'
        });
      }
      if (vdoc.rep?._id) rep = vdoc.rep._id;
      if (vdoc.rep?.name) repName = vdoc.rep.name;
    }

    // --- Validate all items exist upfront (prevents race condition) ---
    const itemIds = rawLines.map(l => l?.item).filter(Boolean);
    if (itemIds.length !== rawLines.length) {
      return res.status(400).json({ error: 'line.item is required for all lines' });
    }

    const items = await Item.find({ _id: { $in: itemIds } }).lean();
    const itemMap = new Map(items.map(it => [String(it._id), it]));

    // Check all items were found
    for (const id of itemIds) {
      if (!itemMap.has(String(id))) {
        return res.status(400).json({ error: `Item not found: ${id}` });
      }
    }

    // --- hydrate lines & compute totals ---
    const hydrated = [];
    let subtotal = 0;

    for (const l of rawLines) {
      const q = Number(l.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        return res.status(400).json({ error: 'line.quantity must be > 0' });
      }

      const it = itemMap.get(String(l.item));

      // packaging: prefer explicit line.packaging, fallback to item.packaging, default 'each'
      const packaging = l.packaging || it.packaging || 'each';

      // Validation rules:
      // - 'each' must be whole number
      // - 'case' can be fractional (e.g., 0.5)
      if (packaging === 'each' && !Number.isInteger(q)) {
        return res.status(400).json({ error: 'Quantity for EACH items must be a whole number' });
      }

      // Validate price is a valid positive number
      const unitPrice = unitPriceFor(it, packaging);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: `Invalid price for item: ${it.name || l.item}` });
      }

      // Use fixed-point math to avoid floating point errors
      const lineTotal = Math.round(unitPrice * q * 100) / 100;

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
    // Round subtotal to avoid floating point errors
    subtotal = Math.round(subtotal * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    let created;
    try {
      created = await Delivery.create({
        clientId,
        rep,
        repName,
        deliveredAt: deliveredAt ? new Date(deliveredAt) : new Date(),
        location,
        box,
        visit: visit || null,
        lines: hydrated,
        subtotal,
        tax,
        total
      });
    } catch (e) {
      // The same request arrived twice at once: the other one saved it
      if (e?.code === 11000 && clientId) {
        const existing = await Delivery.findOne({ clientId }).populate('location box visit lines.item');
        if (existing) return res.status(200).json(existing);
      }
      throw e;
    }

    const doc = await Delivery.findById(created._id)
      .populate('location box visit lines.item');

    res.status(201).json(doc);
  } catch (err) {
    console.error('Create delivery failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// r.post('/', async (req, res) => {
//   try {
//     const { deliveredAt, location, box, visit, lines: rawLines } = req.body;
//     const currentUserName = req.user?.name || '';
//     const visitDoc = payload.visit ? await Visit.findById(payload.visit).populate('rep','name').lean() : null;
// const repName = visitDoc?.rep?.name || currentUserName;

//     if (!location) return res.status(400).json({ error: 'location is required' });
//     if (!box)      return res.status(400).json({ error: 'box is required' });
//     if (!Array.isArray(rawLines) || rawLines.length === 0) {
//       return res.status(400).json({ error: 'lines must have at least one item' });
//     }

//     const hydrated = [];
//     let subtotal = 0;

//     for (const l of rawLines) {
//       if (!l?.item) return res.status(400).json({ error: 'line.item is required' });

//       const q = Number(l.quantity);
//       if (!Number.isFinite(q) || q <= 0) {
//         return res.status(400).json({ error: 'line.quantity must be > 0' });
//       }

//       const it = await Item.findById(l.item);
//       if (!it) return res.status(400).json({ error: `Item not found: ${l.item}` });

//       // Determine packaging for this line
//       const packaging = l.packaging || it.packaging; // 'each' | 'case'

//       // Validation rules:
//       // - 'each' must be whole number
//       // - 'case' can be fractional (e.g., 0.5)
//       if (packaging === 'each' && !Number.isInteger(q)) {
//         return res.status(400).json({ error: 'Quantity for EACH items must be a whole number' });
//       }

//       // unitPrice is price per pack (for 'each' it's per item; for 'case' it's per case)
//       const unitPrice = Number(it.pricePerPack);
//       const lineTotal = unitPrice * q;

//       subtotal += lineTotal;
//       hydrated.push({
//         item: it._id,
//         quantity: q,
//         packaging,
//         unitPrice,
//         lineTotal
//       });
//     }

//     const tax = 0;
//     const total = subtotal + tax;

//     const created = await Delivery.create({
//       repName,
//       deliveredAt,
//       location,
//       box,
//       visit,
//       lines: hydrated,
//       subtotal,
//       tax,
//       total
//     });

//     const doc = await Delivery.findById(created._id)
//       .populate('location box visit lines.item');

//     res.status(201).json(doc);
//   } catch (err) {
//     console.error('Create delivery failed:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });


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

    // Another rep's delivery looks the same as a missing one
    if (!d || (!isAdmin(req.user) && !isOwnDelivery(req.user, d))) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    res.json(d);
  } catch (err) {
    console.error('Get delivery failed:', err);
    res.status(500).json({ error: 'Failed to get delivery' });
  }
});


// PATCH /api/deliveries/:id
r.patch('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Delivery not found' });
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    // Admins can edit any delivery; a rep only their own, while the visit is still open
    if (!isAdmin(req.user)) {
      const v = delivery.visit ? await Visit.findById(delivery.visit).lean() : null;
      if (!v || String(v.rep) !== String(req.user?._id)) {
        return res.status(403).json({ error: 'Only an admin or the visit\'s rep can edit this delivery' });
      }
      if (v.status === 'submitted') {
        return res.status(403).json({ error: 'This visit was already submitted. Ask an admin to make changes.' });
      }
    }

    if (!Array.isArray(req.body?.lines)) {
      return res.status(400).json({ error: 'lines must be an array' });
    }

    // Build new lines from payload, computing unitPrice from Item + packaging
    const newLines = [];
    for (const raw of req.body.lines) {
      if (!raw?.item) return res.status(400).json({ error: 'Each line must include item' });
      if (!mongoose.isValidObjectId(raw.item)) return res.status(400).json({ error: 'Invalid item in lines' });

      const item = await Item.findById(raw.item).lean();
      if (!item) return res.status(400).json({ error: 'Invalid item in lines' });

      const quantity = Number(raw.quantity ?? 0);
      const packaging = String(raw.packaging || item.packaging || 'each').toLowerCase().trim();

      // Same rules as creating a delivery
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: `Quantity for ${item.name} must be greater than 0` });
      }
      if (!['each', 'case'].includes(packaging)) {
        return res.status(400).json({ error: `Packaging for ${item.name} must be "each" or "case"` });
      }
      if (packaging === 'each' && !Number.isInteger(quantity)) {
        return res.status(400).json({ error: `Quantity for ${item.name} (each) must be a whole number` });
      }

      const unitPrice = unitPriceFor(item, packaging);
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;

      newLines.push({
        item: item._id,
        quantity,
        packaging,
        unitPrice,
        lineTotal
      });
    }

    // Recompute delivery total
    const total = newLines.reduce((s, l) => s + Number(l.lineTotal || 0), 0);

    // Snapshot for optional audit log
    // const before = { lines: delivery.toObject().lines, total: delivery.total };

    // Apply changes
    delivery.lines = newLines;
    delivery.subtotal = Math.round(total * 100) / 100;
    delivery.total = Math.round((delivery.subtotal + (delivery.tax || 0)) * 100) / 100;
    await delivery.save();

    // Optional: write audit log if you created ChangeLog model
    // try {
    //   await ChangeLog.create({
    //     entityType: 'Delivery',
    //     entityId: delivery._id,
    //     action: 'update',
    //     before,
    //     after: { lines: newLines, total: delivery.total }
    //   });
    // } catch (_) {}

    // Return updated, populated delivery for the UI
    const updated = await Delivery.findById(delivery._id)
      .populate({ path: 'location', select: 'name address' })
      .populate({ path: 'box', select: 'label size' })
      .populate({ path: 'lines.item', select: 'name price pricePerPack' })
      .populate({ path: 'visit', populate: [{ path: 'rep', select: 'name' }, { path: 'location', select: 'name' }] });

    res.json(updated);
  } catch (e) {
    console.error('Update delivery failed:', e);
    res.status(500).json({ error: 'Failed to update delivery' });
  }
});



export default r;

