import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, usersApi } from '../../api';

// Admin setup, in one place: users, items, locations (and their boxes).
export default function Settings() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let cancelled = false;
    const set = (k, v) => { if (!cancelled) setCounts(c => ({ ...c, [k]: v })); };
    usersApi.list().then(u => set('users', Array.isArray(u) ? u : [])).catch(() => {});
    api.items.list().then(i => set('items', Array.isArray(i) ? i : [])).catch(() => {});
    api.locations.list('').then(l => set('locations', Array.isArray(l) ? l : [])).catch(() => {});
    api.boxes.list().then(b => set('boxes', Array.isArray(b) ? b : [])).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const n = (list) => (list ? list.length : '…');
  const inactiveUsers = counts.users?.filter(u => u.active === false).length || 0;
  const inactiveItems = counts.items?.filter(i => i.active === false).length || 0;

  return (
    <div className="page">
      <h2>Settings</h2>
      <div className="settings-grid">
        <Section
          title="Users"
          summary={`${n(counts.users)} users${inactiveUsers ? `, ${inactiveUsers} inactive` : ''}`}
          text="Who can sign in, and whether they're a rep or an admin."
          to="/settings/users" newTo="/settings/users/new" newLabel="+ New user"
        />
        <Section
          title="Items"
          summary={`${n(counts.items)} items${inactiveItems ? `, ${inactiveItems} inactive` : ''}`}
          text="What can go in a box: prices, case sizes and SKUs."
          to="/settings/items" newTo="/settings/items/new" newLabel="+ New item"
        />
        <Section
          title="Locations"
          summary={`${n(counts.locations)} locations, ${n(counts.boxes)} boxes`}
          text="Sites you visit, their addresses and their boxes."
          to="/settings/locations" newTo="/settings/locations/new" newLabel="+ New location"
        />
      </div>
    </div>
  );
}

function Section({ title, summary, text, to, newTo, newLabel }) {
  return (
    <div className="card stack-sm settings-card">
      <div className="between">
        <h3 className="m0"><Link to={to}>{title}</Link></h3>
        <span className="hint">{summary}</span>
      </div>
      <p className="dim m0">{text}</p>
      <div className="actions mt">
        <Link className="btn" to={to}>Manage {title.toLowerCase()}</Link>
        <Link className="btn primary" to={newTo}>{newLabel}</Link>
      </div>
    </div>
  );
}
