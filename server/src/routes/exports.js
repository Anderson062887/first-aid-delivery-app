// server/src/routes/exports.js
import { Router } from 'express';
import Delivery from '../models/Delivery.js';
import Visit from '../models/Visit.js';
import { dayRange } from '../utils/dates.js';
import { escapeRegex } from '../utils/regex.js';
import { repDeliveriesFilter } from '../utils/repDeliveries.js';
import { summarizeItems } from '../utils/itemUsage.js';
import { buildLocationHistory, itemsText, localDateTime } from '../utils/locationHistory.js';

const r = Router();

// CSV escape with Excel formula injection protection
function csvEscape(x) {
  if (x === null || x === undefined) return '';
  let s = String(x);

  // Protect against Excel formula injection
  // Values starting with =, +, -, @, tab, or carriage return can be interpreted as formulas
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s; // Prefix with single quote to prevent formula execution
  }

  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}


/**
 * Helper: load deliveries with common filters + populates, then optional repId filter.
 */
async function loadDeliveriesWithFilters(qs) {
  const { from, to, location, repId, repName, tz } = qs || {};
  const query = {};
  const deliveredRange = dayRange(from, to, tz);
  if (deliveredRange) query.deliveredAt = deliveredRange;
  if (location) query.location = location;
  if (repName && String(repName).trim()) {
    query.repName = { $regex: escapeRegex(String(repName).trim()), $options: 'i' };
  }

  if (repId) query.$and = [await repDeliveriesFilter(repId)];

  return Delivery.find(query)
    .sort({ deliveredAt: 1, _id: 1 })
    .populate('location box lines.item')
    .populate('rep', 'name')
    .populate({ path: 'visit', populate: { path: 'rep', select: 'name' } })
    .lean();
}

const OUTCOMES = ['completed', 'partial', 'no_access', 'skipped'];

// Submitted visits matching the export filters (outcomes belong to visits, not deliveries)
async function loadSubmittedVisits(qs) {
  const { from, to, location, repId, repName, tz } = qs || {};
  const query = { status: 'submitted' };
  const submittedRange = dayRange(from, to, tz);
  if (submittedRange) query.submittedAt = submittedRange;
  if (location) query.location = location;
  if (repId) query.rep = repId;

  let visits = await Visit.find(query).populate('rep', 'name').lean();
  if (!repId && repName && String(repName).trim()) {
    const rx = new RegExp(escapeRegex(String(repName).trim()), 'i');
    visits = visits.filter(v => rx.test(v.rep?.name || ''));
  }
  return visits;
}

function addDelivery(agg, d) {
  agg.deliveries += 1;
  agg.items += (Array.isArray(d.lines) ? d.lines.length : 0);
  agg.total += Number(d.total || 0);
}

/**
 * GET /api/exports/deliveries.csv
 * mode=lines | deliveries (default lines)
 * Other filters: from, to, location, repId, repName
 */
r.get('/deliveries.csv', async (req, res) => {
  try {
    const { mode = 'lines' } = req.query || {};
    const deliveries = await loadDeliveriesWithFilters(req.query);

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const fname = `deliveries_${mode}_${dtStamp}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);

    if (mode === 'deliveries') {
      const headers = [
        'DeliveryID','VisitID','DeliveredAt',
        'LocationID','Location','BoxID','BoxLabel','BoxSize',
        'RepName','Outcome','Note',
        'Total','LineCount'
      ];
      res.write(headers.join(',') + '\n');

      for (const d of deliveries) {
        const row = [
          d._id,
          d.visit?._id || '',
          d.deliveredAt ? new Date(d.deliveredAt).toISOString() : '',
          d.location?._id || '',
          d.location?.name || '',
          d.box?._id || '',
          d.box?.label || '',
          d.box?.size || '',
          d.visit?.rep?.name || d.rep?.name || d.repName || '',
          d.visit?.outcome || '',
          d.visit?.note || '',
          Number(d.total || 0).toFixed(2),
          Array.isArray(d.lines) ? d.lines.length : 0
        ].map(csvEscape);
        res.write(row.join(',') + '\n');
      }
      return res.end();
    }

    // Default: mode=lines. Only the line's own total: repeating the delivery
    // total on every line would multiply it when the column is summed.
    const headers = [
      'DeliveryID','VisitID','DeliveredAt',
      'LocationID','Location','BoxID','BoxLabel','BoxSize',
      'RepName','Outcome','Note',
      'ItemID','ItemName','Packaging','Quantity','UnitPrice','LineTotal'
    ];
    res.write(headers.join(',') + '\n');

    for (const d of deliveries) {
      const common = [
        d._id,
        d.visit?._id || '',
        d.deliveredAt ? new Date(d.deliveredAt).toISOString() : '',
        d.location?._id || '',
        d.location?.name || '',
        d.box?._id || '',
        d.box?.label || '',
        d.box?.size || '',
        d.visit?.rep?.name || d.rep?.name || d.repName || '',
        d.visit?.outcome || '',
        d.visit?.note || ''
      ].map(csvEscape);

      const lines = Array.isArray(d.lines) ? d.lines : [];
      if (lines.length === 0) {
        const row = [
          ...common,
          '', '', '', '', '', ''
        ];
        res.write(row.join(',') + '\n');
      } else {
        for (const l of lines) {
          const row = [
            ...common,
            l.item?._id || '',
            l.item?.name || '',
            l.packaging || '',
            (Number(l.quantity)).toString(),
            Number(l.unitPrice || 0).toFixed(2),
            Number(l.lineTotal || 0).toFixed(2)
          ].map(csvEscape);
          res.write(row.join(',') + '\n');
        }
      }
    }

    res.end();
  } catch (e) {
    console.error('CSV export failed:', e);
    res.status(500).json({ error: 'CSV export failed' });
  }
});

/**
 * GET /api/exports/items-summary.csv
 * Totals by item over the date range (and other filters)
 * Filters: from, to, location, repId, repName
 */
r.get('/items-summary.csv', async (req, res) => {
  try {
    const deliveries = await loadDeliveriesWithFilters(req.query);

    const { rows, totals } = summarizeItems(deliveries);

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="items_summary_${dtStamp}.csv"`);

    // Cases and single units are separate; TotalUnits converts cases with the item's units per case
    const headers = ['ItemID','ItemName','SKU','UnitsPerCase','Cases','Each','TotalUnits','TotalAmount','LineCount'];
    res.write(headers.join(',') + '\n');
    for (const agg of rows) {
      const row = [
        agg.itemId, agg.name, agg.sku, agg.unitsPerPack,
        agg.cases, agg.each, agg.units, agg.amount.toFixed(2), agg.lines
      ].map(csvEscape);
      res.write(row.join(',') + '\n');
    }
    res.write(['', 'TOTAL', '', '', totals.cases, totals.each, totals.units, totals.amount.toFixed(2), totals.lines].map(csvEscape).join(',') + '\n');
    res.end();
  } catch (e) {
    console.error('items-summary export failed:', e);
    res.status(500).json({ error: 'items-summary export failed' });
  }
});

/**
 * GET /api/exports/reps.csv
 * Per-rep productivity over filters
 * Filters: from, to, location, repId, repName
 * Money/boxes come from deliveries (by delivery date); outcome columns count
 * each submitted visit once (by submitted date), like /api/reports/rep-productivity.
 */
r.get('/reps.csv', async (req, res) => {
  try {
    const [deliveries, visits] = await Promise.all([
      loadDeliveriesWithFilters(req.query),
      loadSubmittedVisits(req.query)
    ]);

    const perRep = new Map(); // key -> stats
    const statsFor = (key, repId, repName) => {
      if (!perRep.has(key)) {
        perRep.set(key, {
          repId,
          repName,
          visits: new Set(),   // unique visit ids
          deliveries: 0,       // boxes (rows)
          items: 0,            // line items
          total: 0,
          outcomes: { completed:0, partial:0, no_access:0, skipped:0, other:0 }
        });
      }
      return perRep.get(key);
    };
    const forRep = (rep) => statsFor(String(rep?._id || rep), String(rep?._id || rep || ''), rep?.name || 'Unknown');

    // Outcomes come from submitted visits, counted once per visit (also visits
    // with no deliveries, e.g. "no access"). Dates apply to when it was submitted.
    for (const v of visits) {
      const agg = forRep(v.rep);
      agg.visits.add(String(v._id));
      agg.outcomes[OUTCOMES.includes(v.outcome) ? v.outcome : 'other']++;
    }

    // Money and boxes come from deliveries
    const nameOnly = [];
    for (const d of deliveries) {
      const rep = d.visit?.rep || d.rep;
      if (!rep) { nameOnly.push(d); continue; }
      const agg = forRep(rep);
      if (d.visit?._id) agg.visits.add(String(d.visit._id));
      addDelivery(agg, d);
    }

    // Older visit-less deliveries only carry a name: add them to the rep with
    // that name if there is exactly one, otherwise to a row without a RepID.
    for (const d of nameOnly) {
      const name = d.repName || 'Unknown';
      const matches = [...perRep.values()].filter(a => a.repId && a.repName === name);
      addDelivery(matches.length === 1 ? matches[0] : statsFor(`name:${name}`, '', name), d);
    }

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rep_productivity_${dtStamp}.csv"`);

    const headers = [
      'RepID','RepName','VisitCount','DeliveryCount','LineItems',
      'Total',
      'Completed','Partial','NoAccess','Skipped','Other'
    ];
    res.write(headers.join(',') + '\n');

    for (const agg of perRep.values()) {
      const row = [
        agg.repId,
        agg.repName,
        agg.visits.size.toString(),
        agg.deliveries.toString(),
        agg.items.toString(),
        agg.total.toFixed(2),
        agg.outcomes.completed.toString(),
        agg.outcomes.partial.toString(),
        agg.outcomes.no_access.toString(),
        agg.outcomes.skipped.toString(),
        agg.outcomes.other.toString(),
      ].map(csvEscape);
      res.write(row.join(',') + '\n');
    }
    res.end();
  } catch (e) {
    console.error('reps export failed:', e);
    res.status(500).json({ error: 'reps export failed' });
  }
});

/**
 * GET /api/exports/location-history.csv
 * Requires: location=<id>. Optional: from, to, tz.
 * One row per visit at the location (newest first), including visits where
 * nothing was refilled. Line-by-line detail: the line-item CSV filtered by location.
 */
r.get('/location-history.csv', async (req, res) => {
  try {
    const { location, from, to, tz } = req.query || {};
    if (!location) return res.status(400).json({ error: 'location is required' });

    const history = await buildLocationHistory({ location, from, to, tz, scope: null });
    if (!history) return res.status(404).json({ error: 'Location not found' });

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="location_history_${dtStamp}.csv"`);

    const headers = ['Date','Location','Rep','Status','Outcome','Note','BoxesRefilled','Boxes','Items','Total','VisitID'];
    res.write(headers.join(',') + '\n');
    for (const v of history.rows) {
      const row = [
        localDateTime(v.date, tz),
        history.location.name,
        v.repName,
        v.status,
        v.outcome,
        v.note,
        v.boxes.length,
        v.boxes.join('; '),
        itemsText(v.items),
        v.total.toFixed(2),
        v.visitId
      ].map(csvEscape);
      res.write(row.join(',') + '\n');
    }
    res.end();
  } catch (e) {
    console.error('location-history export failed:', e);
    res.status(500).json({ error: 'location-history export failed' });
  }
});

export default r;
