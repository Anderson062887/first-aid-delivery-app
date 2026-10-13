import { useEffect, useState } from 'react';
import { api, visitApi } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Locations(){
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes('admin');
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

  // Recent visits for every location, loaded once (not per location, not per search)
  useEffect(() => {
    let cancelled = false;
    visitApi.recentByLocation(2)
      .then(map => { if (!cancelled) setVisitsByLoc(map && typeof map === 'object' ? map : {}); })
      .catch(() => {}); // the list still works without recent visits (e.g. offline)
    return () => { cancelled = true; };
  }, []);

  // Load locations whenever search changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setErr('');
        const locs = await api.locations.list(search);
        if (!cancelled) setLocations(locs);
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
    // if(!repId){ alert('Select a rep first'); return; }
    try{
      const v = await visitApi.start(locationId);
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

      {/* <RepBar onChange={setRepId} /> */}

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
      {loading && <Skeleton.List items={4} />}

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

              <div className="action-row" style={{ marginTop: 6 }}>
                <button className="btn" onClick={() => startVisit(loc._id)}>
                  Start / Continue Visit
                </button>
                <Link className="btn" to={`/boxes?location=${loc._id}`}>
                  View Boxes
                </Link>
                <Link className="btn" to={`/locations/${loc._id}/edit`}>
                  Edit
                </Link>
              </div>

              <div style={{ marginTop:8 }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>{isAdmin ? 'Recent visits' : 'Your recent visits'}</div>
                {visits.length === 0 && <div style={{ opacity:.8 }}>{isAdmin ? 'No visits yet.' : "You haven't visited yet."}</div>}
                {visits.length > 0 && (
                  <ul style={{ margin:0, paddingLeft:18, display:'grid', gap:6 }}>
                    {visits.map(v => (
                      <li key={v._id} style={{ marginBottom:2, listStyle:'disc' }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <span title={new Date(v.startedAt).toLocaleString()}>
                            {new Date(v.startedAt || v.submittedAt || v.createdAt).toLocaleDateString()}
                          </span>
                          <span>— {v.rep?.name || 'Unknown rep'}</span>
                          {v.outcome && <Badge kind={outcomeKind(v.outcome)}>{v.outcome.replace('_',' ')}</Badge>}
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







