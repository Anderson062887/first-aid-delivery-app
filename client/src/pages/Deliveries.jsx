// client/src/pages/Deliveries.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, usersApi } from '../api';
import Badge from '../components/Badge.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function outcomeKind(o){
  if (o === 'completed') return 'completed';
  if (o === 'partial') return 'partial';
  if (o === 'no_access') return 'no_access';
  if (o === 'skipped') return 'skipped';
  return 'default';
}

export default function Deliveries() {
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes('admin');

  // --- filters ---
  const [location, setLocation] = useState('');
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');
  const [repId, setRepId]       = useState('');   // used only by admin
  const [repName, setRepName]   = useState('');   // available to everyone
  const [limit, setLimit]       = useState(25);
  const [page, setPage]         = useState(1);

  // --- data ---
  const [rows, setRows]         = useState([]);   // deliveries from API (data)
  const [pageInfo, setPageInfo] = useState({ page:1, limit:25, total:0, hasMore:false });
  const [locations, setLocations] = useState([]);
  const [reps, setReps]         = useState([]);   // admin list; reps won't use this
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');

  // Load locations for the filter
  useEffect(() => {
    let cancelled = false;
    async function loadLocations(){
      try {
        const locs = await api.locations.list('');
        if (!cancelled) setLocations(Array.isArray(locs) ? locs : []);
      } catch (e) {
        if (!cancelled) setLocations([]);
      }
    }
    loadLocations();
    return () => { cancelled = true; };
  }, []);

  // Load reps list: only for admin. Reps do NOT call /api/users.
  useEffect(() => {
    let cancelled = false;
    async function loadReps(){
      if (!user) {
        if (!cancelled) { setReps([]); setRepId(''); }
        return;
      }
      if (isAdmin) {
        const arr = await usersApi.list();  // returns [] if anything goes wrong
        if (!cancelled) setReps(Array.isArray(arr) ? arr : []);
      } else {
        // non-admin: do nothing (can see all deliveries); they can filter by repName
        if (!cancelled) { setReps([]); setRepId(''); }
      }
    }
    loadReps();
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  // Build query & load deliveries
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setErr('');
        const filters = {
          location: location || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          limit
        };
        // Admins can filter by specific rep or by name
        if (isAdmin) {
          if (repId) filters.repId = repId;
          else if (repName) filters.repName = repName;
        } else {
          // Reps: do NOT force repId; allow seeing all. They can filter by repName if desired.
          if (repName) filters.repName = repName;
        }

        const res = await api.deliveries.list(filters); // { data, pageInfo }
        if (cancelled) return;
        const data = res?.data ?? [];
        setRows(Array.isArray(data) ? data : []);
        setPageInfo(res?.pageInfo || { page, limit, total: data.length, hasMore:false });
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [location, from, to, repId, repName, page, limit, isAdmin]);

  // Group deliveries by visit
  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of rows) {
      const key = d.visit?._id || 'no-visit';
      if (!map.has(key)) {
        map.set(key, {
          visitId: d.visit?._id || 'no-visit',
          when: new Date(d.deliveredAt || d.createdAt || Date.now()),
          repName: d.visit?.rep?.name || d.repName || '—',
          locationName: d.location?.name || '—',
          boxCount: 0,
          total: 0,
          outcome: d.visit?.outcome || '',
          note: d.visit?.note || ''
        });
      }
      const g = map.get(key);
      g.boxCount += 1;
      g.total += Number(d.total || 0) || 0;

      const dt = new Date(d.deliveredAt || d.createdAt || Date.now());
      if (dt < g.when) g.when = dt;

      if (!g.locationName && d.location?.name) g.locationName = d.location.name;
      if ((!g.repName || g.repName === '—') && (d.visit?.rep?.name || d.repName)) {
        g.repName = d.visit?.rep?.name || d.repName;
      }
      if (!g.outcome && d.visit?.outcome) g.outcome = d.visit.outcome;
      if (!g.note && d.visit?.note) g.note = d.visit.note;
    }
    return Array.from(map.values()).sort((a, b) => b.when - a.when);
  }, [rows]);

  const totalAmount = useMemo(
    () => grouped.reduce((sum, g) => sum + (Number(g.total || 0) || 0), 0),
    [grouped]
  );

  function clearFilters(){
    setLocation('');
    setFrom('');
    setTo('');
    setRepId('');
    setRepName('');
    setLimit(25);
    setPage(1);
  }
  function nextPage(){ if (pageInfo?.hasMore) setPage(p => p + 1); }
  function prevPage(){ setPage(p => Math.max(1, p - 1)); }

  return (
    <div>
      <h2>Deliveries</h2>

      {/* Filters */}
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div className="row">
          <div>
            <label>Location</label>
            <select
              className="input"
              value={location}
              onChange={(e) => { setLocation(e.target.value); setPage(1); }}
            >
              <option value="">All</option>
              {(locations || []).map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>From (date)</label>
            <input
              className="input"
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            />
          </div>

          <div>
            <label>To (date)</label>
            <input
              className="input"
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Rep (by user)</label>
            {isAdmin ? (
              <select
                className="input"
                value={repId}
                onChange={(e) => { setRepId(e.target.value); setPage(1); }}
              >
                <option value="">Any</option>
                {(Array.isArray(reps) ? reps : []).map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({(u.roles || []).join(', ') || '—'})
                  </option>
                ))}
              </select>
            ) : (
              <div className="input" style={{ display:'flex', alignItems:'center', height:'38px' }}>
                All reps
              </div>
            )}
          </div>

          <div>
            <label>Rep name contains</label>
            <input
              className="input"
              placeholder="e.g. Maria"
              value={repName}
              onChange={(e) => { setRepName(e.target.value); setPage(1); }}
              disabled={false /* reps can filter by name too */}
            />
          </div>

          <div>
            <label>Page size</label>
            <select
              className="input"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <button className="btn" onClick={clearFilters}>Clear Filters</button>
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
                    {g.visitId !== 'no-visit'
                      ? <Link to={`/deliveries/visit/${g.visitId}`}>View details</Link>
                      : <span style={{ opacity: 0.6 }}>—</span>}
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
              Showing {grouped.length} of {pageInfo.total} results
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn" onClick={prevPage} disabled={page <= 1}>Prev</button>
              <button className="btn" onClick={nextPage} disabled={!pageInfo.hasMore}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




