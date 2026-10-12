// Day boundaries for YYYY-MM-DD date filters.
//
// "2026-10-11" must mean that calendar day where the user is, not in the
// server's timezone (and not UTC, which is what new Date('2026-10-11') gives).
// The client sends its IANA timezone as ?tz=...; APP_TIMEZONE is the fallback,
// then the server's own timezone.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(tz) {
  if (isValidTimeZone(tz)) return tz;
  if (isValidTimeZone(process.env.APP_TIMEZONE)) return process.env.APP_TIMEZONE;
  return null; // server local time
}

// Offset (ms) of `tz` from UTC at instant `t`
function tzOffsetMs(t, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(t));
  const get = (type) => Number(parts.find(p => p.type === type).value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUTC - t;
}

// Midnight at the start of y-m-d in tz (or server local time)
function midnight(y, m, d, tz) {
  if (!tz) return new Date(y, m - 1, d);
  const utcMidnight = Date.UTC(y, m - 1, d);
  let t = utcMidnight - tzOffsetMs(utcMidnight, tz);
  // Re-check in case a DST change happens between the guess and the answer
  const corrected = utcMidnight - tzOffsetMs(t, tz);
  if (corrected !== t) t = corrected;
  return new Date(t);
}

function parseYMD(d) {
  const m = YMD.exec(String(d ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function startOfDay(d, tz) {
  const ymd = parseYMD(d);
  return ymd ? midnight(...ymd, resolveTimeZone(tz)) : null;
}

export function endOfDay(d, tz) {
  const ymd = parseYMD(d);
  if (!ymd) return null;
  const [y, m, day] = ymd;
  const next = new Date(Date.UTC(y, m - 1, day + 1)); // handles month/year rollover
  const start = midnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), resolveTimeZone(tz));
  return new Date(start.getTime() - 1);
}

/**
 * Mongo range condition for a from/to (YYYY-MM-DD) filter, or null when
 * neither is given/valid. Usage: if (range) query.deliveredAt = range;
 */
export function dayRange(from, to, tz) {
  const gte = from ? startOfDay(from, tz) : null;
  const lte = to ? endOfDay(to, tz) : null;
  if (!gte && !lte) return null;
  const range = {};
  if (gte) range.$gte = gte;
  if (lte) range.$lte = lte;
  return range;
}
