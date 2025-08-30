// client/src/pages/Reports.jsx
import { useEffect, useState } from 'react';
import { api, usersApi } from '../api';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Reports(){
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes('admin');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [location, setLocation] = useState('');
  const [repId, setRepId] = useState('');
  const [repName, setRepName] = useState('');
  const [locations, setLocations] = useState([]);
  const [reps, setReps] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locs = await api.locations.list('');
        if (!cancelled) setLocations(Array.isArray(locs) ? locs : []);
      } catch {}
      if (isAdmin) {
        const arr = await usersApi.list();
        if (!cancelled) setReps(Array.isArray(arr) ? arr : []);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  function qs(base, params) {
    const u = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => {
      if (v !== undefined && v !== null && v !== '') u.set(k, v);
    });
    return `${base}?${u.toString()}`;
  }

  async function download(url, namePrefix){
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      alert(`Export failed (${res.status}): ${t.slice(0,160)}`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,10);
    a.href = URL.createObjectURL(blob);
    a.download = `${namePrefix}_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function commonParams(extra = {}) {
    const p = {
      from, to, location,
      repName: repName || undefined,
      ...extra
    };
    if (isAdmin && repId) p.repId = repId;
    return p;
  }

  return (
    <div className="page">
      <h2>Reports / CSV Export</h2>

      <div className="card" style={{ display:'grid', gap:12 }}>
        <div className="row responsive-3">
          <div>
            <label>From (date)</label>
            <input className="input" type="date" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div>
            <label>To (date)</label>
            <input className="input" type="date" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          <div>
            <label>Location</label>
            <select className="input" value={location} onChange={e=>setLocation(e.target.value)}>
              <option value="">All</option>
              {(locations||[]).map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div className="row responsive-3">
          <div>
            <label>Rep (by user)</label>
            {isAdmin ? (
              <select className="input" value={repId} onChange={e=>setRepId(e.target.value)}>
                <option value="">Any</option>
                {(reps||[]).map(u => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({(u.roles||[]).join(', ') || '—'})
                  </option>
                ))}
              </select>
            ) : (
              <div className="input" style={{ display:'flex', alignItems:'center', height:38 }}>All reps</div>
            )}
          </div>
          <div>
            <label>Rep name contains</label>
            <input className="input" placeholder="e.g. Maria" value={repName} onChange={e=>setRepName(e.target.value)} />
          </div>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <button className="btn" onClick={()=>{ setFrom(''); setTo(''); setLocation(''); setRepId(''); setRepName(''); }}>
              Clear
            </button>
          </div>
        </div>

        <div className="row">
          {/* Existing ones */}
          <button
            className="btn primary"
            onClick={() => download(qs('/api/exports/deliveries.csv', commonParams({ mode: 'lines' })), 'deliveries_lines')}
          >
            Download CSV — one row per line item
          </button>
          <button
            className="btn"
            onClick={() => download(qs('/api/exports/deliveries.csv', commonParams({ mode: 'deliveries' })), 'deliveries_summary')}
          >
            Download CSV — one row per delivery
          </button>
        </div>

        <div className="row">
          {/* New: Item summary */}
          <button
            className="btn"
            onClick={() => download(qs('/api/exports/items-summary.csv', commonParams()), 'items_summary')}
          >
            Download CSV — item summary (totals)
          </button>

          {/* New: Rep productivity */}
          <button
            className="btn"
            onClick={() => download(qs('/api/exports/reps.csv', commonParams()), 'rep_productivity')}
          >
            Download CSV — rep productivity
          </button>

          {/* New: Location history (requires a location) */}
          <button
            className="btn"
            onClick={() => {
              if (!location) { alert('Pick a Location to export its history.'); return; }
              download(qs('/api/exports/location-history.csv', commonParams()), 'location_history');
            }}
          >
            Download CSV — location history
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ opacity:.85, fontSize:14 }}>
          <strong>Tips</strong>
          <ul>
            <li><em>Item summary</em>: totals by item over the selected date range.</li>
            <li><em>Rep productivity</em>: per-rep visits, boxes, line-items, totals and outcomes.</li>
            <li><em>Location history</em>: pick one location to export an auditable line-by-line record.</li>
            <li>Use date filters (From/To) to export a window (e.g., Jan 1 → Feb 1, or last 3 months).</li>
            <li>Open CSVs in Google Sheets to chart & analyze.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

