import { Router } from 'express';
import Delivery from '../models/Delivery.js';

const r = Router();

// helpers
function parseDateStart(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  dt.setHours(0,0,0,0);
  return dt;
}
function parseDateEnd(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  dt.setHours(23,59,59,999);
  return dt;
}

async function loadDeliveries({ from, to, location }) {
  const q = {};
  const fromDt = from ? parseDateStart(from) : null;
  const toDt   = to   ? parseDateEnd(to)   : null;
  if (fromDt || toDt) {
    q.deliveredAt = {};
    if (fromDt) q.deliveredAt.$gte = fromDt;
    if (toDt)   q.deliveredAt.$lte = toDt;
  }
  if (location) q.location = location;

  // Populate what we need for charts
  const rows = await Delivery.find(q)
    .sort({ deliveredAt: -1 })
    .populate('visit')           // for rep + outcome (we didn't deep-populate rep model on purpose to avoid strictPopulate issues)
    .populate('location', 'name')
    .populate('box', 'label size')
    .populate('lines.item', 'name') // item name
    .lean();

  return rows;
}

/**
 * GET /api/reports/items-usage?from&to&location&limit=10
 * Returns top N items by quantity and amount in range.
 */
r.get('/items-usage', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit ?? '10', 10)));

    const deliveries = await loadDeliveries({ from, to, location });

    const map = new Map(); // itemId -> { itemId, name, quantity, amount }
    for (const d of deliveries) {
      const lines = Array.isArray(d.lines) ? d.lines : [];
      for (const l of lines) {
        const id = l.item?._id?.toString() || 'unknown';
        const name = l.item?.name || 'Unknown Item';
        if (!map.has(id)) map.set(id, { itemId: id, name, quantity: 0, amount: 0 });
        const agg = map.get(id);
        agg.quantity += Number(l.quantity) || 0;
        agg.amount   += Number(l.lineTotal) || 0;
      }
    }

    const rows = Array.from(map.values())
      .sort((a,b) => b.quantity - a.quantity)
      .slice(0, limit);

    res.json({ from, to, location, rows });
  } catch (e) {
    console.error('items-usage failed:', e);
    res.status(500).json({ error: 'items-usage failed' });
  }
});

/**
 * GET /api/reports/rep-productivity?from&to&location
 * Returns per-rep stats: visits, deliveries, line items, totals, outcomes.
 */
r.get('/rep-productivity', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const deliveries = await loadDeliveries({ from, to, location });

    const perRep = new Map(); // repName -> stats
    for (const d of deliveries) {
      const repName = d.visit?.rep?.name || d.repName || 'Unknown';
      if (!perRep.has(repName)) {
        perRep.set(repName, {
          repName,
          visitIds: new Set(),
          deliveries: 0,
          lineItems: 0,
          subtotal: 0,
          tax: 0,
          total: 0,
          outcomes: { completed:0, partial:0, no_access:0, skipped:0, other:0 }
        });
      }
      const agg = perRep.get(repName);
      if (d.visit?._id) agg.visitIds.add(String(d.visit._id));
      agg.deliveries += 1;
      agg.lineItems  += Array.isArray(d.lines) ? d.lines.length : 0;
      agg.subtotal   += Number(d.subtotal || 0);
      agg.tax        += Number(d.tax || 0);
      agg.total      += Number(d.total || 0);

      const oc = d.visit?.outcome || '';
      if (oc === 'completed') agg.outcomes.completed++;
      else if (oc === 'partial') agg.outcomes.partial++;
      else if (oc === 'no_access') agg.outcomes.no_access++;
      else if (oc === 'skipped') agg.outcomes.skipped++;
      else agg.outcomes.other++;
    }

    const rows = Array.from(perRep.values())
      .map(v => ({
        repName: v.repName,
        visitCount: v.visitIds.size,
        deliveries: v.deliveries,
        lineItems: v.lineItems,
        subtotal: v.subtotal,
        tax: v.tax,
        total: v.total,
        ...v.outcomes
      }))
      .sort((a,b) => b.total - a.total);

    res.json({ from, to, location, rows });
  } catch (e) {
    console.error('rep-productivity failed:', e);
    res.status(500).json({ error: 'rep-productivity failed' });
  }
});

/**
 * GET /api/reports/outcomes?from&to&location
 * Returns total counts per outcome for a donut/pie.
 */
r.get('/outcomes', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const deliveries = await loadDeliveries({ from, to, location });

    const counts = { completed:0, partial:0, no_access:0, skipped:0, other:0 };
    for (const d of deliveries) {
      const oc = d.visit?.outcome || '';
      if (oc === 'completed') counts.completed++;
      else if (oc === 'partial') counts.partial++;
      else if (oc === 'no_access') counts.no_access++;
      else if (oc === 'skipped') counts.skipped++;
      else counts.other++;
    }

    res.json({ from, to, location, counts });
  } catch (e) {
    console.error('outcomes failed:', e);
    res.status(500).json({ error: 'outcomes failed' });
  }
});

export default r;
