import { useEffect, useState } from 'react';
import { api } from '../api';
import { visitApi } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import RepBar from '../components/RepBar.jsx';
import Badge from '../components/Badge.jsx';

export default function Locations(){
  const [repId, setRepId] = useState(localStorage.getItem('selectedRepId') || '');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [locations, setLocations] = useState([]);
  const [visitsByLoc, setVisitsByLoc] = useState({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  // Debounce input -> search (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  // Load locations whenever search changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setErr('');
        const locs = await api.locations.list(search);
        if (cancelled) return;
        setLocations(locs);

        // fetch last 5 visits per location
        const entries = await Promise.all(
          (locs || []).map(async (loc) => {
            try {
              const res = await fetch(`/api/visits?location=${encodeURIComponent(loc._id)}&limit=2`, {
                headers: { 'Cache-Control': 'no-cache' }
              });
              const data = await res.json();
              return [loc._id, Array.isArray(data) ? data : []];
            } catch {
              return [loc._id, []];
            }
          })
        );
        if (cancelled) return;
        setVisitsByLoc(Object.fromEntries(entries));
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [search]);

  async function startVisit(locationId){
    if(!repId){ alert('Select a rep first'); return; }
    try{
      const v = await visitApi.start(repId, locationId);
      nav(`/visits/${v._id}`);
    } catch(e){
      setErr(String(e?.message || e));
    }
  }

  function outcomeKind(o){
    if (o === 'completed') return 'completed';
    if (o === 'partial') return 'partial';
    if (o === 'no_access') return 'no_access';
    if (o === 'skipped') return 'skipped';
    return 'default';
  }

  return (
    <div>
      <h2>Locations</h2>

      <RepBar onChange={setRepId} />

      <div className="card" style={{ display:'grid', gap:12 }}>
        <label>Search by name or address</label>
        <input
          className="input"
          placeholder="e.g. Ruby, 123 Main, WV"
          value={input}
          onChange={e=>setInput(e.target.value)}
        />
        <small style={{opacity:.7}}>Searching for: <code>{search || '— (all)'}</code></small>
      </div>

      {err && <div style={{ color:'red', margin:'12px 0' }}>{err}</div>}
      {loading && <div className="card">Loading…</div>}

      {!loading && locations.length === 0 && (
        <div className="card">No locations found.</div>
      )}

      <div style={{ display:'grid', gap:12 }}>
        {locations.map(loc => {
          const visits = visitsByLoc[loc._id] || [];
          return (
            <div className="card" key={loc._id} style={{ display:'grid', gap:10 }}>
              <div style={{ fontWeight:600 }}>{loc.name}</div>
              {loc.address && (
                <div style={{ opacity:.8 }}>
                  {loc.address.street || ''}{loc.address.city ? `, ${loc.address.city}` : ''}
                  {loc.address.state ? `, ${loc.address.state}` : ''} {loc.address.zip || ''}
                </div>
              )}
              {/* <div style={{ opacity:.8 }}>
                Boxes: {loc.boxCount ?? '—'}
              </div> */}

              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                <button className="btn" onClick={() => startVisit(loc._id)} disabled={!repId}>
                  Start / Continue Visit
                </button>
                <Link className="btn" to={`/boxes?location=${loc._id}`}>
                  View Boxes
                </Link>
              </div>

              {/* Recent visits list with outcome + note */}
              <div style={{ marginTop:8 }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>Recent visits</div>
                {visits.length === 0 && <div style={{ opacity:.8 }}>No visits yet.</div>}
                {visits.length > 0 && (
                  <ul style={{ margin:0, paddingLeft:18, display:'grid', gap:6 }}>
                    {visits.map(v => (
                      <li key={v._id} style={{ marginBottom:2, listStyle:'disc' }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <span title={new Date(v.startedAt).toLocaleString()}>
                            {new Date(v.startedAt).toLocaleDateString()}
                          </span>
                          <span>— {v.rep?.name || 'Unknown rep'}</span>
                          {v.outcome && <Badge kind={outcomeKind(v.outcome)}>{v.outcome.replace('_',' ')}</Badge>}
                          {/* <span style={{ opacity:.7 }}>{v.status}</span> */}
                          {/* {v.submittedAt && (
                            <span style={{ opacity:.7 }}>
                              (submitted {new Date(v.submittedAt).toLocaleDateString()})
                            </span>
                          )} */}
                        </div>
                        {v.note && (
                          <div style={{ marginTop:2, fontSize:12, opacity:.85 }}>
                            <em>Note:</em> {v.note}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}






