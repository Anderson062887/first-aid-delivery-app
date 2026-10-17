import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, visitApi } from '../api';
import { useAuth } from '../auth/AuthContext.jsx';
import Flash from '../components/Flash.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { byDue, lastVisitDate, lastVisitText } from '../visitDue.js';

// A rep's start page: what's in progress, and which locations are due next.
export default function RepHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const done = new URLSearchParams(useLocation().search).get('done');
  const [open, setOpen] = useState(null);       // visits in progress
  const [due, setDue] = useState(null);         // locations, most overdue first
  const [visitsByLoc, setVisitsByLoc] = useState({});
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    visitApi.myOpen().then(v => { if (!cancelled) setOpen(Array.isArray(v) ? v : []); })
      .catch(() => { if (!cancelled) setOpen([]); });
    Promise.all([api.locations.list(''), visitApi.recentByLocation(1).catch(() => ({}))])
      .then(([locs, recent]) => {
        if (cancelled) return;
        const map = recent && typeof recent === 'object' ? recent : {};
        setVisitsByLoc(map);
        setDue([...(Array.isArray(locs) ? locs : [])].sort(byDue(map)).slice(0, 5));
      })
      .catch(() => { if (!cancelled) setDue([]); });
    return () => { cancelled = true; };
  }, []);

  async function startVisit(locationId) {
    try {
      const v = await visitApi.start(locationId);
      nav(`/visits/${v._id}`);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  const openLocations = new Set((open || []).map(v => String(v.location?._id)));

  return (
    <div className="page">
      <h2>Hi, {user?.name?.split(' ')[0] || 'there'}</h2>
      <OfflineBanner />
      {done === 'visit' && <Flash>Visit submitted ✅</Flash>}
      {done === 'delivery' && <Flash>Delivery recorded ✅</Flash>}
      {err && <div className="error-box mb">{err}</div>}

      <div className="card stack">
        <h3 className="m0">In progress</h3>
        {open === null && <Skeleton.Table rows={1} cols={2} />}
        {open?.length === 0 && <div className="dim">No visit in progress. Start one below or from Locations.</div>}
        {open?.map(v => {
          const pct = v.boxesTotal ? Math.round((v.boxesDone / v.boxesTotal) * 100) : 0;
          return (
            <div key={v._id} className="list-row">
              <div style={{ flex: '1 1 220px' }}>
                <div className="strong">{v.location?.name}</div>
                <div className="hint">{v.boxesDone} of {v.boxesTotal} box{v.boxesTotal === 1 ? '' : 'es'} refilled</div>
                <div className="progress mt" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
              </div>
              <Link className="btn primary" to={`/visits/${v._id}`}>Continue visit</Link>
            </div>
          );
        })}
      </div>

      <div className="card stack">
        <div className="between">
          <h3 className="m0">Due for a visit</h3>
          <Link to="/locations">All locations</Link>
        </div>
        {due === null && <Skeleton.Table rows={3} cols={2} />}
        {due?.length === 0 && <div className="dim">No locations yet.</div>}
        {due?.filter(l => !openLocations.has(String(l._id))).map(l => (
          <div key={l._id} className="list-row">
            <div style={{ flex: '1 1 220px' }}>
              <div className="strong">{l.name}</div>
              <div className="hint">{lastVisitText(lastVisitDate(visitsByLoc[l._id]))}</div>
            </div>
            <button className="btn" onClick={() => startVisit(l._id)}>Start visit</button>
          </div>
        ))}
      </div>

      <p className="hint"><Link to="/dashboard">See my numbers →</Link></p>
    </div>
  );
}
