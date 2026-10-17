import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Breadcrumbs from '../../components/Breadcrumbs.jsx';
import Skeleton from '../../components/Skeleton.jsx';

const fmtAddress = (a) => [a?.street, a?.city, a?.state, a?.zip].filter(Boolean).join(', ');

// Admin list of locations: add, edit details, manage boxes.
export default function SettingsLocations() {
  const [locations, setLocations] = useState(null);
  const [boxCount, setBoxCount] = useState({});
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.locations.list('')
      .then(l => { if (!cancelled) setLocations(Array.isArray(l) ? l : []); })
      .catch(e => { if (!cancelled) setErr(String(e?.message || e)); });
    api.boxes.list()
      .then(bs => {
        if (cancelled || !Array.isArray(bs)) return;
        const m = {};
        for (const b of bs) { const id = String(b.location?._id || b.location); m[id] = (m[id] || 0) + 1; }
        setBoxCount(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (locations || []).filter(l =>
    !needle || l.name.toLowerCase().includes(needle) || fmtAddress(l.address).toLowerCase().includes(needle));

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Settings', to: '/settings' }, { label: 'Locations' }]} />
      <div className="between">
        <h2>Locations</h2>
        <Link className="btn primary" to="/settings/locations/new">+ New location</Link>
      </div>

      <div className="card">
        <input className="input mb" placeholder="Search by name or address" value={q} onChange={e => setQ(e.target.value)} aria-label="Search locations" />
        {err && <div className="error">{err}</div>}
        {locations === null && !err && <Skeleton.Table rows={4} cols={3} />}
        {locations?.length === 0 && <div className="dim">No locations yet.</div>}
        <div className="stack-sm">
          {shown.map(l => (
            <div key={l._id} className="list-row">
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="strong">{l.name}</div>
                <div className="hint">
                  {fmtAddress(l.address) || 'No address'} · {boxCount[String(l._id)] ?? 0} box{boxCount[String(l._id)] === 1 ? '' : 'es'}
                </div>
              </div>
              <div className="actions">
                <Link className="btn" to={`/locations/${l._id}`}>Boxes</Link>
                <Link className="btn" to={`/settings/locations/${l._id}/edit`}>Edit</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
