import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSearchParams, Link } from 'react-router-dom';
import Badge from '../components/Badge.jsx';

function useQueryState() {
  const [sp, setSp] = useSearchParams();
  const get = (k, d = '') => sp.get(k) ?? d;
  const setMany = (obj) => {
    const next = new URLSearchParams(sp);
    Object.entries(obj).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    });
    setSp(next, { replace: true });
  };
  return { sp, get, setMany };
}

function outcomeKind(o) {
  if (o === 'completed') return 'completed';
  if (o === 'partial') return 'partial';
  if (o === 'no_access') return 'no_access';
  if (o === 'skipped') return 'skipped';
  return 'default';
}

// Group individual delivery rows (one per box) into one row per visit
function groupByVisit(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const vid = r.visit?._id || 'no-visit';
    if (!map.has(vid)) {
      map.set(vid, {
        visitId: vid,
        when: new Date(r.deliveredAt || r.createdAt || Date.now()),
        repName: r.visit?.rep?.name || r.repName || '—',
        locationName: r.visit?.location?.name || r.location?.name || '—',
        outcome: r.visit?.outcome,
        note: r.visit?.note,
        total: 0,
        boxCount: 0,
      });
    }
    const g = map.get(vid);
    g.total += Number(r.total || 0);
    g.boxCount += 1;
    // Prefer the earliest timestamp as the "visit time" if needed:
    if (r.deliveredAt || r.createdAt) {
      const t = new Date(r.deliveredAt || r.createdAt);
      if (t < g.when) g.when = t;
    }
  }
  // newest first
  return Array.from(map.values()).sort((a, b) => b.when - a.when);
}

export default function Deliveries() {
  const { get, setMany } = useQueryState();

  // Filters from URL
  const [location, setLocation] = useState(get('location'));
  const [from, setFrom] = useState(get('from'));
  const [to, setTo] = useState(get('to'));
  const [repId, setRepId] = useState(get('repId'));
  const [repName, setRepName] = useState(get('repName'));
  const [page, setPage] = useState(Number(get('page', '1')) || 1);
  const [limit, setLimit] = useState(Number(get('limit', '25')) || 25);

  // Dropdown data
  const [locations, setLocations] = useState([]);
  const [reps, setReps] = useState([]);

  // Raw rows from API (box-level)
  const [rows, setRows] = useState([]);
  const [pageInfo, setPageInfo] = useState({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Load dropdowns
  useEffect(() => {
    api.locations.list().then(setLocations).catch(console.error);
    fetch('/api/users')
      .then((r) => r.json())
      .then((users) => setReps((users || []).filter((u) => u.active)))
      .catch(console.error);
  }, []);

  // Sync URL with filters/pagination
  useEffect(() => {
    setMany({ location, from, to, repId, repName, page, limit });
  }, [location, from, to, repId, repName, page, limit]);

  // Build filters for API
  const filters = useMemo(() => {
    const f = { page, limit };
    if (location) f.location = location;
    if (from) f.from = from;
    if (to) f.to = to;
    if (repId) f.repId = repId;
    else if (repName) f.repName = repName.trim();
    return f;
  }, [location, from, to, repId, repName, page, limit]);

  // Fetch deliveries (box-level rows)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    api.deliveries
      .list(filters)
      .then((resp) => {
        if (cancelled) return;
        const data = resp?.data ?? (Array.isArray(resp) ? resp : []);
        const info = resp?.pageInfo ?? {
          page,
          limit,
          total: data.length,
          hasMore: false,
        };
        setRows(Array.isArray(data) ? data : []);
        setPageInfo(info);
      })
      .catch((e) => !cancelled && setErr(String(e?.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page, limit]);

  // Clear repName if repId chosen
  useEffect(() => {
    if (repId && repName) setRepName('');
  }, [repId]);

  function clearFilters() {
    setLocation('');
    setFrom('');
    setTo('');
    setRepId('');
    setRepName('');
    setPage(1);
  }

  function prevPage() {
    setPage((p) => Math.max(1, p - 1));
  }
  function nextPage() {
    if (pageInfo.hasMore) setPage((p) => p + 1);
  }

  // Grouped view (one row per visit)
  const grouped = useMemo(() => groupByVisit(rows), [rows]);

  const totalAmount = grouped.reduce((s, g) => s + Number(g.total || 0), 0);

  return (
    <div>
      <h2>Deliveries</h2>

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div className="row">
          <div>
            <label>Location</label>
            <select
              className="input"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>From (date)</label>
            <input
              className="input"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label>To (date)</label>
            <input
              className="input"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Rep (by user)</label>
            <select
              className="input"
              value={repId}
              onChange={(e) => {
                setRepId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any</option>
              {reps.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({(u.roles || []).join(', ') || '—'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Rep name contains</label>
            <input
              className="input"
              placeholder="e.g. Maria"
              value={repName}
              onChange={(e) => {
                setRepName(e.target.value);
                setPage(1);
              }}
              disabled={!!repId}
            />
          </div>
          <div>
            <label>Page size</label>
            <select
              className="input"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <button className="btn" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <strong>Total on page: ${totalAmount.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {err && <div style={{ color: 'red', margin: '12px 0' }}>{err}</div>}
      {loading && <div className="card">Loading…</div>}

      {!loading && grouped.length === 0 && (
        <div className="card">No deliveries found for the selected filters.</div>
      )}

      {!loading && grouped.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rep</th>
                <th>Location</th>
                <th># Boxes</th>
                <th>Details</th>
                <th>Visit Outcome</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {grouped.map((g) => (
                <tr key={g.visitId}>
                  <td>{g.when.toLocaleString()}</td>
                  <td>{g.repName}</td>
                  <td>{g.locationName}</td>
                  <td>{g.boxCount}</td>
                  <td>
                     {g.visitId !== 'no-visit' ? (
                        <Link to={`/deliveries/visit/${g.visitId}`}>View details</Link>
                      ) : (
                        <span style={{ opacity: 0.6 }}>—</span>
                      )}
                  </td>
                  <td>
                    {g.outcome ? (
                      <div>
                        <Badge kind={outcomeKind(g.outcome)}>
                          {g.outcome.replace('_', ' ')}
                        </Badge>
                        {g.note && (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                            <em>Note:</em> {g.note}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ opacity: 0.6 }}>—</span>
                    )}
                  </td>
                  <td>${g.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
            <div>
              Showing {grouped.length}  of {pageInfo.total}  results
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn" onClick={prevPage} disabled={page <= 1}>
                Prev
              </button>
              <button className="btn" onClick={nextPage} disabled={!pageInfo.hasMore}>
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



