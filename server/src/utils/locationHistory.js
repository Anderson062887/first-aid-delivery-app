import Delivery from '../models/Delivery.js';
import Visit from '../models/Visit.js';
import Location from '../models/Location.js';
import { dayRange, resolveTimeZone } from './dates.js';
import { emptyUsage, addLineUsage } from './itemUsage.js';

/**
 * Everything that happened at one location, one row per visit (newest first).
 * Visits where nothing was refilled ("no access", "skipped") are included,
 * and so are older deliveries that were recorded without a visit.
 *
 * A visit's date is when it was submitted, or when it started if it is still open.
 * `scope` ({ repId }) limits it to one rep's visits; null means everyone.
 */
export async function buildLocationHistory({ location, from, to, tz, scope }) {
  const loc = await Location.findById(location).select('name address').lean();
  if (!loc) return null;

  const range = dayRange(from, to, tz);
  const vq = { location };
  if (range) vq.$or = [{ submittedAt: range }, { submittedAt: null, startedAt: range }];
  if (scope) vq.rep = scope.repId;
  const visits = await Visit.find(vq).populate('rep', 'name').lean();

  const dq = {
    location,
    $or: [
      { visit: { $in: visits.map(v => v._id) } },
      // older deliveries without a visit, by their own date
      { visit: null, ...(range ? { deliveredAt: range } : {}), ...(scope ? { rep: scope.repId } : {}) }
    ]
  };
  const deliveries = await Delivery.find(dq)
    .populate('box', 'label')
    .populate('lines.item', 'name unitsPerPack')
    .populate('rep', 'name')
    .lean();

  const byVisit = new Map();
  const loose = [];
  for (const d of deliveries) {
    if (d.visit) {
      const k = String(d.visit);
      if (!byVisit.has(k)) byVisit.set(k, []);
      byVisit.get(k).push(d);
    } else {
      loose.push(d);
    }
  }

  const rows = [
    // An open visit with nothing refilled yet isn't history (often a mistaken start)
    ...visits.filter(v => v.status !== 'open' || byVisit.has(String(v._id))).map(v => summarize({
      visitId: String(v._id),
      date: v.submittedAt || v.startedAt,
      status: v.status,
      outcome: v.outcome || '',
      note: v.note || '',
      repName: v.rep?.name || '',
    }, byVisit.get(String(v._id)) || [])),
    ...loose.map(d => summarize({
      visitId: '',
      date: d.deliveredAt || d.createdAt,
      status: 'no visit',
      outcome: '',
      note: '',
      repName: d.rep?.name || d.repName || '',
    }, [d])),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return { location: { _id: String(loc._id), name: loc.name, address: loc.address || null }, rows };
}

function summarize(base, deliveries) {
  const items = new Map();
  let total = 0;
  for (const d of deliveries) {
    total += Number(d.total || 0);
    for (const l of (d.lines || [])) {
      const id = String(l.item?._id || 'unknown');
      if (!items.has(id)) items.set(id, { name: l.item?.name || 'Unknown Item', ...emptyUsage() });
      addLineUsage(items.get(id), l);
    }
  }
  return {
    ...base,
    boxes: deliveries.map(d => d.box?.label || '').filter(Boolean).sort(),
    items: [...items.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, cases, each, units }) => ({ name, cases, each, units })),
    total: Math.round(total * 100) / 100,
  };
}

// "Gloves: 2 cases + 5 each" — readable in one spreadsheet cell
export function itemsText(items) {
  return items.map(i => {
    const parts = [];
    if (i.cases) parts.push(`${i.cases} case${i.cases === 1 ? '' : 's'}`);
    if (i.each) parts.push(`${i.each} each`);
    return `${i.name}: ${parts.join(' + ') || '0'}`;
  }).join('; ');
}

// Local date and time for CSVs (the date filters use the same timezone)
export function localDateTime(d, tz) {
  if (!d) return '';
  const zone = resolveTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(zone ? { timeZone: zone } : {}), hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(d));
  const get = (t) => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}
