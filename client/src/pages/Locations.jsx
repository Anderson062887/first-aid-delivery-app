import { useEffect, useState } from 'react';
import { api, visitApi } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { byDue, lastVisitDate, lastVisitText } from '../visitDue.js';

export default function Locations(){
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes('admin');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [locations, setLocations] = useState([]);
  const [visitsByLoc, setVisitsByLoc] = useState({});
  const [openByLoc, setOpenByLoc] = useState({}); // my visits in progress, by location
  const [sort, setSort] = useState('name');       // 'name' | 'due'
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
    visitApi.myOpen()
      .then(list => {
        if (cancelled || !Array.isArray(list)) return;
        setOpenByLoc(Object.fromEntries(list.map(v => [String(v.location?._id), v])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const shown = sort === 'due' ? [...locations].sort(byDue(visitsByLoc)) : locations;

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
      <div className="between">
        <h2>Locations</h2>
        {isAdmin && <Link className="btn primary" to="/locations/new">+ New Location</Link>}
      </div>

      {/* <RepBar onChange={setRepId} /> */}

      <div className="card stack">
        <label>Search by name or address</label>
        <input
          className="input"
          placeholder="e.g. Ruby, 123 Main, WV"
          value={input}
          onChange={e=>setInput(e.target.value)}
        />
        <div className="inline">
          <label htmlFor="loc-sort" className="m0">Sort</label>
          <select id="loc-sort" className="input" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)}>
            <option value="name">By name</option>
            <option value="due">Due first (longest since last visit)</option>
          </select>
        </div>
      </div>

      {err && <div className="error my">{err}</div>}
      {loading && <Skeleton.List items={4} />}

      {!loading && locations.length === 0 && (
        <div className="card">No locations found.</div>
      )}

      <div className="stack">
        {shown.map(loc => {
          const visits = visitsByLoc[loc._id] || [];
          const open = openByLoc[String(loc._id)];
          return (
            <div className="card stack" key={loc._id}>
              <div className="between">
                <Link className="strong location-name" to={`/locations/${loc._id}`}>{loc.name}</Link>
                <span className="hint">{lastVisitText(lastVisitDate(visits))}</span>
              </div>
              {loc.address && (
                <div className="dim">
                  {[loc.address.street, loc.address.city, loc.address.state, loc.address.zip].filter(Boolean).join(', ')}
                </div>
              )}
              {visits[0]?.outcome && (
                <div className="inline hint">
                  Last outcome: <Badge kind={outcomeKind(visits[0].outcome)}>{visits[0].outcome.replace('_', ' ')}</Badge>
                </div>
              )}

              <div className="action-row" style={{ marginTop: 6 }}>
                <button className="btn primary" onClick={() => startVisit(loc._id)}>
                  {open
                    ? `Continue visit (${open.boxesDone} of ${open.boxesTotal} boxes)`
                    : 'Start visit'}
                </button>
                <Link className="btn" to={`/locations/${loc._id}`}>Details</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}







