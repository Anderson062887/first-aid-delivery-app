import { Router } from 'express';
import Delivery from '../models/Delivery.js';
import Visit from '../models/Visit.js';
import { dayRange } from '../utils/dates.js';
import { isAdmin } from '../middleware/auth.js';
import { repDeliveriesFilter } from '../utils/repDeliveries.js';
import { emptyUsage, addLineUsage, roundUsage, summarizeItems } from '../utils/itemUsage.js';
import { buildLocationHistory } from '../utils/locationHistory.js';

const r = Router();

// Admins see everyone's numbers; anyone else only their own.
// Returns null (no restriction) or { repId, repName }.
function scopeFor(user) {
  return isAdmin(user) ? null : { repId: user._id, repName: user.name };
}

async function restrictDeliveries(q, scope) {
  if (scope) Object.assign(q, await repDeliveriesFilter(scope.repId, scope.repName));
}

async function loadDeliveries({ from, to, location, tz, scope }) {
  const q = {};
  const deliveredRange = dayRange(from, to, tz);
  if (deliveredRange) q.deliveredAt = deliveredRange;
  if (location) q.location = location;
  await restrictDeliveries(q, scope);

  // Populate what we need for charts
  const rows = await Delivery.find(q)
    .sort({ deliveredAt: -1 })
    .populate({ path: 'visit', populate: { path: 'rep', select: 'name email' } })
    .populate('rep', 'name email')
    .populate('location', 'name')
    .populate('box', 'label size')
    .populate('lines.item', 'name sku unitsPerPack') // unitsPerPack turns cases into units
    .lean();

  return rows;
}

const OUTCOME_KEYS = ['completed', 'partial', 'no_access', 'skipped'];
const emptyOutcomes = () => ({ completed:0, partial:0, no_access:0, skipped:0, other:0 });
const outcomeKey = (o) => (OUTCOME_KEYS.includes(o) ? o : 'other');

// Outcomes belong to visits, not deliveries: a visit counts once however many
// boxes were refilled, and "no access"/"skipped" visits usually have no
// deliveries at all. Date range applies to when the visit was submitted.
async function loadSubmittedVisits({ from, to, location, tz, scope }) {
  const q = { status: 'submitted' };
  const submittedRange = dayRange(from, to, tz);
  if (submittedRange) q.submittedAt = submittedRange;
  if (location) q.location = location;
  if (scope) q.rep = scope.repId;

  return Visit.find(q).populate('rep', 'name email').lean();
}

/**
 * GET /api/reports/items-usage?from&to&location&limit=10
 * Returns the top N items by units delivered in range.
 * Cases and single units ("each") are counted separately, and `units` adds
 * them up as single units (a case counts as the item's unitsPerPack).
 */
r.get('/items-usage', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit ?? '10', 10)));

    const deliveries = await loadDeliveries({ from, to, location, tz: req.query.tz, scope: scopeFor(req.user) });

    const map = new Map(); // itemId -> usage
    for (const d of deliveries) {
      for (const l of (Array.isArray(d.lines) ? d.lines : [])) {
        const id = l.item?._id?.toString() || 'unknown';
        if (!map.has(id)) map.set(id, { itemId: id, name: l.item?.name || 'Unknown Item', ...emptyUsage() });
        addLineUsage(map.get(id), l);
      }
    }

    const rows = Array.from(map.values())
      .map(roundUsage)
      .sort((a,b) => b.units - a.units || b.amount - a.amount)
      .slice(0, limit);

    res.json({ from, to, location, rows });
  } catch (e) {
    console.error('items-usage failed:', e);
    res.status(500).json({ error: 'items-usage failed' });
  }
});

/**
 * GET /api/reports/items-summary?from&to&location
 * Every item delivered in range: cases, single units, total units and amount,
 * with grand totals. The on-screen version of items-summary.csv.
 */
r.get('/items-summary', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    const deliveries = await loadDeliveries({ from, to, location, tz: req.query.tz, scope: scopeFor(req.user) });
    res.json({ from, to, location, ...summarizeItems(deliveries) });
  } catch (e) {
    console.error('items-summary failed:', e);
    res.status(500).json({ error: 'items-summary failed' });
  }
});

/**
 * GET /api/reports/location-history?location&from&to
 * One row per visit at that location (newest first), including visits where
 * nothing was refilled. Reps only see their own visits.
 */
r.get('/location-history', async (req, res) => {
  try {
    const { from, to, location } = req.query;
    if (!location) return res.status(400).json({ error: 'Pick a location' });
    const history = await buildLocationHistory({ location, from, to, tz: req.query.tz, scope: scopeFor(req.user) });
    if (!history) return res.status(404).json({ error: 'Location not found' });
    res.json({ from, to, ...history });
  } catch (e) {
    console.error('location-history failed:', e);
    res.status(500).json({ error: 'location-history failed' });
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
      loadDeliveries({ from, to, location, tz: req.query.tz, scope: scopeFor(req.user) }),
      loadSubmittedVisits({ from, to, location, tz: req.query.tz, scope: scopeFor(req.user) })
    ]);

    // Group by rep account, so two reps with the same name stay separate
    const perRep = new Map(); // key -> stats
    const statsFor = (key, repId, repName, repEmail = '') => {
      if (!perRep.has(key)) {
        perRep.set(key, {
          repId,
          repName,
          repEmail,
          visitIds: new Set(),     // submitted visits (each has one outcome)
          openVisitIds: new Set(), // visits still in progress that have deliveries
          deliveries: 0,
          lineItems: 0,
          subtotal: 0,
          tax: 0,
          total: 0,
          outcomes: emptyOutcomes()
        });
      }
      return perRep.get(key);
    };
    const forRep = (rep) => statsFor(String(rep?._id || rep), String(rep?._id || rep || ''), rep?.name || 'Unknown', rep?.email || '');
    const addDelivery = (agg, d) => {
      agg.deliveries += 1;
      agg.lineItems  += Array.isArray(d.lines) ? d.lines.length : 0;
      agg.subtotal   += Number(d.subtotal || 0);
      agg.tax        += Number(d.tax || 0);
      agg.total      += Number(d.total || 0);
    };

    // Outcomes come from submitted visits (one count per visit)
    for (const v of visits) {
      const agg = forRep(v.rep);
      agg.visitIds.add(String(v._id));
      agg.outcomes[outcomeKey(v.outcome)]++;
    }

    // Money and boxes come from deliveries
    const nameOnly = [];
    for (const d of deliveries) {
      const rep = d.visit?.rep || d.rep;
      if (!rep) { nameOnly.push(d); continue; }
      const agg = forRep(rep);
      if (d.visit?.status === 'open') agg.openVisitIds.add(String(d.visit._id));
      addDelivery(agg, d);
    }

    // Older visit-less deliveries only carry a name: add them to the rep with
    // that name if there is exactly one, otherwise to a row without a repId.
    for (const d of nameOnly) {
      const name = d.repName || 'Unknown';
      const matches = [...perRep.values()].filter(a => a.repId && a.repName === name);
      addDelivery(matches.length === 1 ? matches[0] : statsFor(`name:${name}`, '', name), d);
    }

    const rows = Array.from(perRep.values())
      .map(v => ({
        repId: v.repId,
        repName: v.repName,
        repEmail: v.repEmail,
        visitCount: v.visitIds.size,
        openVisits: v.openVisitIds.size,
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
    const visits = await loadSubmittedVisits({ from, to, location, tz: req.query.tz, scope: scopeFor(req.user) });

    const counts = emptyOutcomes();
    for (const v of visits) counts[outcomeKey(v.outcome)]++;

    res.json({ from, to, location, counts });
  } catch (e) {
    console.error('outcomes failed:', e);
    res.status(500).json({ error: 'outcomes failed' });
  }
});

export default r;
