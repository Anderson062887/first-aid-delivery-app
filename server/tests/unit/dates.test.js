import { startOfDay, endOfDay, dayRange, resolveTimeZone } from '../../src/utils/dates.js';

describe('date filter helpers', () => {
  const iso = (d) => d.toISOString();

  afterEach(() => {
    delete process.env.APP_TIMEZONE;
  });

  it('uses the requested timezone for calendar days', () => {
    // New York is UTC-4 in October (EDT)
    expect(iso(startOfDay('2026-10-11', 'America/New_York'))).toBe('2026-10-11T04:00:00.000Z');
    expect(iso(endOfDay('2026-10-11', 'America/New_York'))).toBe('2026-10-12T03:59:59.999Z');
  });

  it('handles daylight saving changes (25-hour day)', () => {
    // DST ends in New York on 2026-11-01: midnight is still EDT (UTC-4), next midnight is EST (UTC-5)
    expect(iso(startOfDay('2026-11-01', 'America/New_York'))).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(endOfDay('2026-11-01', 'America/New_York'))).toBe('2026-11-02T04:59:59.999Z');
  });

  it('rolls over month and year ends', () => {
    expect(iso(endOfDay('2026-12-31', 'UTC'))).toBe('2026-12-31T23:59:59.999Z');
    expect(iso(endOfDay('2026-02-28', 'UTC'))).toBe('2026-02-28T23:59:59.999Z');
  });

  it('falls back to APP_TIMEZONE, ignoring invalid tz values', () => {
    process.env.APP_TIMEZONE = 'Asia/Tokyo'; // UTC+9
    expect(resolveTimeZone('Not/AZone')).toBe('Asia/Tokyo');
    expect(iso(startOfDay('2026-10-11', 'Not/AZone'))).toBe('2026-10-10T15:00:00.000Z');
  });

  it('rejects malformed dates', () => {
    expect(startOfDay('10/11/2026', 'UTC')).toBeNull();
    expect(dayRange('nope', '', 'UTC')).toBeNull();
  });

  it('builds a Mongo range from either bound', () => {
    expect(dayRange('', '', 'UTC')).toBeNull();
    expect(Object.keys(dayRange('2026-10-11', '', 'UTC'))).toEqual(['$gte']);
    expect(Object.keys(dayRange('', '2026-10-11', 'UTC'))).toEqual(['$lte']);
  });
});
