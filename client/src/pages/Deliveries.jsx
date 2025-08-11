import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';

function useQueryState() {
  const [sp, setSp] = useSearchParams();
  const get = (k, d='') => sp.get(k) ?? d;
  const setMany = (obj) => {
    const next = new URLSearchParams(sp);
    Object.entries(obj).forEach(([k,v]) => {
      if (v === undefined || v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    });
    setSp(next, { replace: true });
  };
  return { sp, get, setMany };
}

export default function Deliveries(){
  const { get, setMany } = useQueryState();

  // Filters from URL
  const [location, setLocation] = useState(get('location'));
  const [from, setFrom]         = useState(get('from'));
  const [to, setTo]             = useState(get('to'));
  const [repId, setRepId]       = useState(get('repId'));
  const [repName, setRepName]   = useState(get('repName'));
  const [page, setPage]         = useState(Number(get('page','1')) || 1);
  const [limit, setLimit]       = useState(Number(get('limit','25')) || 25);

  // Dropdown data
  const [locations, setLocations] = useState([]);
  const [reps, setReps] = useState([]);

  // Data + state
  const [rows, setRows] = useState([]); 
  const [pageInfo, setPageInfo] = useState({ page:1, limit:25, total:0, hasMore:false });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Load dropdowns
  useEffect(() => {
    api.locations.list().then(setLocations).catch(console.error);
    fetch('/api/users').then(r=>r.json()).then(users => {
      setReps((users||[]).filter(u => u.active));
    }).catch(console.error);
  }, []);

  // Sync URL with filters/pagination
  useEffect(() => {
    setMany({ location, from, to, repId, repName, page, limit });
  }, [location, from, to, repId, repName, page, limit]);

  // Build filters for API
  const filters = useMemo(() => {
    const f = { page, limit };
    if (location) f.location = location;
    if (from)     f.from = from;
    if (to)       f.to = to;
    if (repId)    f.repId = repId;
    else if (repName) f.repName = repName.trim();
    return f;
  }, [location, from, to, repId, repName, page, limit]);

  // Fetch deliveries
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr('');
    api.deliveries.list(filters)
      .then((resp) => {
        if (cancelled) return;
        const data = resp?.data ?? (Array.isArray(resp) ? resp : []);
        const info = resp?.pageInfo ?? { page, limit, total: data.length, hasMore: false };
        setRows(Array.isArray(data) ? data : []);
        setPageInfo(info);
      })
      .catch(e => !cancelled && setErr(String(e?.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [filters, page, limit]);

  // Clear repName if repId chosen
  useEffect(() => {
    if (repId && repName) setRepName('');
  }, [repId]);

  function clearFilters(){
    setLocation(''); setFrom(''); setTo('');
    setRepId(''); setRepName('');
    setPage(1);
  }

  function prevPage(){ setPage(p => Math.max(1, p - 1)); }
  function nextPage(){ if (pageInfo.hasMore) setPage(p => p + 1); }

  const totalAmount = Array.isArray(rows) ? rows.reduce((s,r) => s + Number(r.total || 0), 0) : 0;

  function outcomeKind(o){
    if (o === 'completed') return 'completed';
    if (o === 'partial') return 'partial';
    if (o === 'no_access') return 'no_access';
    if (o === 'skipped') return 'skipped';
    return 'default';
  }

  return (
    <div>
      <h2>Deliveries</h2>

      <div className="card" style={{ display:'grid', gap:12 }}>
        <div className="row">
          <div>
            <label>Location</label>
            <select className="input" value={location} onChange={e=>{ setLocation(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label>From (date)</label>
            <input className="input" type="date" value={from} onChange={e=>{ setFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label>To (date)</label>
            <input className="input" type="date" value={to} onChange={e=>{ setTo(e.target.value); setPage(1); }} />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Rep (by user)</label>
            <select className="input" value={repId} onChange={e=>{ setRepId(e.target.value); setPage(1); }}>
              <option value="">Any</option>
              {reps.map(u => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label>Rep name contains</label>
            <input
              className="input"
              placeholder="e.g. Maria"
              value={repName}
              onChange={e=>{ setRepName(e.target.value); setPage(1); }}
              disabled={!!repId}
            />
          </div>
          <div>
            <label>Page size</label>
            <select className="input" value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setPage(1); }}>
              {[10,25,50,100].map(n => <option key={n} value={n}>{n}</option>)}
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

      {err && <div style={{ color:'red', margin:'12px 0' }}>{err}</div>}
      {loading && <div className="card">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="card">No deliveries found for the selected filters.</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="card" style={{ overflowX:'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rep</th>
                <th>Location</th>
                <th>Box</th>
                <th>Lines</th>
                <th>Visit Outcome</th> 
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r._id}>
                  <td>{new Date(r.deliveredAt || r.createdAt).toLocaleString()}</td>
                  <td>{r.visit?.rep?.name || r.repName || '—'}</td>
                  <td>{r.location?.name || '—'}</td>
                  <td>{r.box?.label || '—'}</td>
                  <td>
                    {(r.lines||[]).map((l, i) => (
                      <div key={i}>
                        {l.item?.name || 'Item'} × {l.quantity} {l.packaging} @ ${Number(l.unitPrice).toFixed(2)} = ${Number(l.lineTotal).toFixed(2)}
                      </div>
                    ))}
                  </td>
                  <td>
                    {r.visit?.outcome ? (
                      <div>
                        <Badge kind={outcomeKind(r.visit.outcome)}>
                          {r.visit.outcome.replace('_',' ')}
                        </Badge>
                        {r.visit?.note && (
                          <div style={{ marginTop:4, fontSize:12, opacity:.8 }}>
                            <em>Note:</em> {r.visit.note}
                          </div>
                        )}
                      </div>
                    ) : <span style={{ opacity:.6 }}>—</span>}
                  </td>
                  <td>${Number(r.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12, alignItems:'center' }}>
            <div>Showing {rows.length} of {pageInfo.total} results</div>
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


