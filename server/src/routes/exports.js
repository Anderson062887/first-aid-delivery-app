// server/src/routes/exports.js
import { Router } from 'express';
import Delivery from '../models/Delivery.js';

const r = Router();

// tiny CSV escape
function csvEscape(x) {
  if (x === null || x === undefined) return '';
  const s = String(x);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// parse YYYY-MM-DD to day bounds
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

/**
 * Helper: load deliveries with common filters + populates, then optional repId filter.
 */
async function loadDeliveriesWithFilters(qs) {
  const { from, to, location, repId, repName } = qs || {};
  const query = {};
  const fromDt = from ? parseDateStart(from) : null;
  const toDt   = to   ? parseDateEnd(to)   : null;
  if (fromDt || toDt) {
    query.deliveredAt = {};
    if (fromDt) query.deliveredAt.$gte = fromDt;
    if (toDt)   query.deliveredAt.$lte = toDt;
  }
  if (location) query.location = location;
  if (repName)  query.repName = { $regex: repName, $options: 'i' };

  const deliveries = await Delivery.find(query)
    .sort({ deliveredAt: 1, _id: 1 })
    .populate('location box visit lines.item')
    .lean();

  if (repId) {
    return deliveries.filter(d => d.visit?.rep?._id?.toString() === String(repId));
  }
  return deliveries;
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
        'Subtotal','Tax','Total','LineCount'
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
          d.visit?.rep?.name || d.repName || '',
          d.visit?.outcome || '',
          d.visit?.note || '',
          Number(d.subtotal || 0).toFixed(2),
          Number(d.tax || 0).toFixed(2),
          Number(d.total || 0).toFixed(2),
          Array.isArray(d.lines) ? d.lines.length : 0
        ].map(csvEscape);
        res.write(row.join(',') + '\n');
      }
      return res.end();
    }

    // Default: mode=lines
    const headers = [
      'DeliveryID','VisitID','DeliveredAt',
      'LocationID','Location','BoxID','BoxLabel','BoxSize',
      'RepName','Outcome','Note',
      'ItemID','ItemName','Packaging','Quantity','UnitPrice','LineTotal',
      'Subtotal','Tax','Total'
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
        d.visit?.rep?.name || d.repName || '',
        d.visit?.outcome || '',
        d.visit?.note || ''
      ].map(csvEscape);

      const lines = Array.isArray(d.lines) ? d.lines : [];
      if (lines.length === 0) {
        const row = [
          ...common,
          '', '', '', '', '', '',
          Number(d.subtotal || 0).toFixed(2),
          Number(d.tax || 0).toFixed(2),
          Number(d.total || 0).toFixed(2)
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
            Number(l.lineTotal || 0).toFixed(2),
            Number(d.subtotal || 0).toFixed(2),
            Number(d.tax || 0).toFixed(2),
            Number(d.total || 0).toFixed(2)
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

    // Aggregate by item
    const byItem = new Map(); // key = itemId
    for (const d of deliveries) {
      const lines = Array.isArray(d.lines) ? d.lines : [];
      for (const l of lines) {
        const id = l.item?._id?.toString() || 'unknown';
        if (!byItem.has(id)) {
          byItem.set(id, {
            itemId: id,
            itemName: l.item?.name || 'Unknown Item',
            packaging: l.packaging || '',
            totalQty: 0,
            totalAmount: 0,
            deliveries: 0
          });
        }
        const agg = byItem.get(id);
        agg.totalQty += Number(l.quantity) || 0;
        agg.totalAmount += Number(l.lineTotal) || 0;
        agg.deliveries += 1;
      }
    }

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="items_summary_${dtStamp}.csv"`);

    const headers = ['ItemID','ItemName','Packaging','TotalQuantity','TotalAmount','LineCount'];
    res.write(headers.join(',') + '\n');

    for (const agg of byItem.values()) {
      const row = [
        agg.itemId,
        agg.itemName,
        agg.packaging,
        agg.totalQty.toString(),
        agg.totalAmount.toFixed(2),
        agg.deliveries.toString()
      ].map(csvEscape);
      res.write(row.join(',') + '\n');
    }
    res.end();
  } catch (e) {
    console.error('items-summary export failed:', e);
    res.status(500).json({ error: 'items-summary export failed' });
  }
});

/**
 * GET /api/exports/reps.csv
 * Per-rep productivity over filters
 * Filters: from, to, location
 */
r.get('/reps.csv', async (req, res) => {
  try {
    const deliveries = await loadDeliveriesWithFilters(req.query);

    // Group per repId
    const perRep = new Map(); // repId -> stats
    for (const d of deliveries) {
      const repId = d.visit?.rep?._id?.toString() || 'unknown';
      const repName = d.visit?.rep?.name || d.repName || 'Unknown';
      if (!perRep.has(repId)) {
        perRep.set(repId, {
          repId,
          repName,
          visits: new Set(),   // unique visit ids
          deliveries: 0,       // boxes (rows)
          items: 0,            // line items
          subtotal: 0,
          tax: 0,
          total: 0,
          outcomes: { completed:0, partial:0, no_access:0, skipped:0, other:0 }
        });
      }
      const agg = perRep.get(repId);
      if (d.visit?._id) agg.visits.add(d.visit._id.toString());
      agg.deliveries += 1;
      agg.items += (Array.isArray(d.lines) ? d.lines.length : 0);
      agg.subtotal += Number(d.subtotal || 0);
      agg.tax += Number(d.tax || 0);
      agg.total += Number(d.total || 0);
      const oc = d.visit?.outcome || '';
      if (oc === 'completed') agg.outcomes.completed++;
      else if (oc === 'partial') agg.outcomes.partial++;
      else if (oc === 'no_access') agg.outcomes.no_access++;
      else if (oc === 'skipped') agg.outcomes.skipped++;
      else agg.outcomes.other++;
    }

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rep_productivity_${dtStamp}.csv"`);

    const headers = [
      'RepID','RepName','VisitCount','DeliveryCount','LineItems',
      'Subtotal','Tax','Total',
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
        agg.subtotal.toFixed(2),
        agg.tax.toFixed(2),
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
 * Requires: location=<id>
 * Optional: from, to
 * Produces: one row per line item (auditable full history for that location)
 */
r.get('/location-history.csv', async (req, res) => {
  try {
    const { location } = req.query || {};
    if (!location) return res.status(400).json({ error: 'location is required' });

    const deliveries = await loadDeliveriesWithFilters(req.query);

    const dtStamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="location_history_${dtStamp}.csv"`);

    const headers = [
      'LocationID','Location',
      'VisitID','DeliveredAt','RepName','Outcome','Note',
      'DeliveryID','BoxLabel','BoxSize',
      'ItemID','ItemName','Packaging','Quantity','UnitPrice','LineTotal',
      'DeliverySubtotal','DeliveryTax','DeliveryTotal'
    ];
    res.write(headers.join(',') + '\n');

    for (const d of deliveries) {
      const base = [
        d.location?._id || '',
        d.location?.name || '',
        d.visit?._id || '',
        d.deliveredAt ? new Date(d.deliveredAt).toISOString() : '',
        d.visit?.rep?.name || d.repName || '',
        d.visit?.outcome || '',
        d.visit?.note || '',
        d._id,
        d.box?.label || '',
        d.box?.size || ''
      ].map(csvEscape);

      const lines = Array.isArray(d.lines) ? d.lines : [];
      if (lines.length === 0) {
        const row = [
          ...base,
          '', '', '', '', '', '',
          Number(d.subtotal || 0).toFixed(2),
          Number(d.tax || 0).toFixed(2),
          Number(d.total || 0).toFixed(2)
        ];
        res.write(row.join(',') + '\n');
      } else {
        for (const l of lines) {
          const row = [
            ...base,
            l.item?._id || '',
            l.item?.name || '',
            l.packaging || '',
            (Number(l.quantity)).toString(),
            Number(l.unitPrice || 0).toFixed(2),
            Number(l.lineTotal || 0).toFixed(2),
            Number(d.subtotal || 0).toFixed(2),
            Number(d.tax || 0).toFixed(2),
            Number(d.total || 0).toFixed(2)
          ].map(csvEscape);
          res.write(row.join(',') + '\n');
        }
      }
    }

    res.end();
  } catch (e) {
    console.error('location-history export failed:', e);
    res.status(500).json({ error: 'location-history export failed' });
  }
});

export default r;
