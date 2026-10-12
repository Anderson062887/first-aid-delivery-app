import { Router } from 'express';
import Delivery from '../models/Delivery.js';
import Visit from '../models/Visit.js';
import { dayRange } from '../utils/dates.js';

const r = Router();


async function loadDeliveries({ from, to, location, tz }) {
  const q = {};
  const deliveredRange = dayRange(from, to, tz);
  if (deliveredRange) q.deliveredAt = deliveredRange;
  if (location) q.location = location;

  // Populate what we need for charts
  const rows = await Delivery.find(q)
    .sort({ deliveredAt: -1 })
    .populate({ path: 'visit', populate: { path: 'rep', select: 'name' } })
    .populate('location', 'name')
    .populate('box', 'label size')
    .populate('lines.item', 'name') // item name
    .lean();

  return rows;
}

const OUTCOME_KEYS = ['completed', 'partial', 'no_access', 'skipped'];
const emptyOutcomes = () => ({ completed:0, partial:0, no_access:0, skipped:0, other:0 });
const outcomeKey = (o) => (OUTCOME_KEYS.includes(o) ? o : 'other');

// Outcomes belong to visits, not deliveries: a visit counts once however many
// boxes were refilled, and "no access"/"skipped" visits usually have no
// deliveries at all. Date range applies to when the visit was submitted.
async function loadSubmittedVisits({ from, to, location, tz }) {
  const q = { status: 'submitted' };
  const submittedRange = dayRange(from, to, tz);
  if (submittedRange) q.submittedAt = submittedRange;
  if (location) q.location = location;

  return Visit.find(q).populate('rep', 'name').lean();
}

/**
 * GET /api/reports/items-usage?from&to&location&limit=10
 * Returns top N items by quantity and amount in range.
 */
r.get('/items-usage', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit ?? '10', 10)));

    const deliveries = await loadDeliveries({ from, to, location, tz: req.query.tz });

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
    const [deliveries, visits] = await Promise.all([
      loadDeliveries({ from, to, location, tz: req.query.tz }),
      loadSubmittedVisits({ from, to, location, tz: req.query.tz })
    ]);

    const perRep = new Map(); // repName -> stats
    const statsFor = (repName) => {
      if (!perRep.has(repName)) {
        perRep.set(repName, {
          repName,
          visitIds: new Set(),
          deliveries: 0,
          lineItems: 0,
          subtotal: 0,
          tax: 0,
          total: 0,
          outcomes: emptyOutcomes()
        });
      }
      return perRep.get(repName);
    };

    // Money and boxes come from deliveries
    for (const d of deliveries) {
      const agg = statsFor(d.visit?.rep?.name || d.repName || 'Unknown');
      if (d.visit?._id) agg.visitIds.add(String(d.visit._id));
      agg.deliveries += 1;
      agg.lineItems  += Array.isArray(d.lines) ? d.lines.length : 0;
      agg.subtotal   += Number(d.subtotal || 0);
      agg.tax        += Number(d.tax || 0);
      agg.total      += Number(d.total || 0);
    }

    // Outcomes come from submitted visits (one count per visit)
    for (const v of visits) {
      const agg = statsFor(v.rep?.name || 'Unknown');
      agg.visitIds.add(String(v._id));
      agg.outcomes[outcomeKey(v.outcome)]++;
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
 * Returns the number of submitted visits per outcome for a donut/pie.
 */
r.get('/outcomes', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const visits = await loadSubmittedVisits({ from, to, location, tz: req.query.tz });

    const counts = emptyOutcomes();
    for (const v of visits) counts[outcomeKey(v.outcome)]++;

    res.json({ from, to, location, counts });
  } catch (e) {
    console.error('outcomes failed:', e);
    res.status(500).json({ error: 'outcomes failed' });
  }
});

export default r;
