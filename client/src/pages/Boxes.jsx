import { useCallback, useEffect, useState } from 'react';
import { api, locationsApi } from '../api';
import { useLocation, Link } from 'react-router-dom';
import Skeleton from '../components/Skeleton.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const SIZES = ['S', 'M', 'L', 'XL'];

function useQuery(){ return new URLSearchParams(useLocation().search); }

export default function Boxes(){
  const q = useQuery();
  const locationId = q.get('location') || '';
  const { user } = useAuth();
  // Boxes are managed per location, by admins
  const canManage = !!user?.roles?.includes('admin') && !!locationId;

  const [boxes, setBoxes] = useState([]);
  const [locationName, setLocationName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  // The page opens view-only; an admin has to choose to edit, so a stray tap changes nothing
  const [editing, setEditing] = useState(false);

  const load = useCallback(async (isCancelled = () => false) => {
    try{
      setLoading(true);
      // Admins also see retired boxes so they can restore them
      const list = await api.boxes.list(locationId || undefined, { all: canManage });
      if (isCancelled()) return;
      setBoxes(list);
      if (!locationId) {
        setLocationName('All Locations');
      } else if (list[0]?.location?.name) {
        setLocationName(list[0].location.name);
      } else {
        const loc = await locationsApi.get(locationId).catch(() => null);
        if (!isCancelled()) setLocationName(loc?.name || '');
      }
      setErr('');
    } catch(e){
      if (!isCancelled()) setErr(String(e?.message || e));
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [locationId, canManage]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  return (
    <div>
      <h2>Boxes {locationName ? `— ${locationName}` : ''}</h2>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn" to="/locations">← Back to Locations</Link>
        {canManage && (
          editing
            ? <button className="btn primary" onClick={() => setEditing(false)}>Done</button>
            : <button className="btn" onClick={() => setEditing(true)}>Manage boxes</button>
        )}
      </div>

      {err && <div style={{ color:'red', margin:'12px 0' }}>{err}</div>}

      {editing && <AddBox locationId={locationId} onAdded={() => load()} />}

      {loading && <Skeleton.Table rows={4} cols={3} />}

      {!loading && boxes.length === 0 && (
        <div className="card">No boxes found for this location.</div>
      )}

      {!loading && boxes.length > 0 && (
        <div className="card" style={{ overflowX:'auto' }}>
          <table className="table items-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Size</th>
                <th>{canManage ? 'Status' : 'Location'}</th>
                {editing && <th></th>}
              </tr>
            </thead>
            <tbody>
              {boxes.map(b => editing
                ? <BoxRow key={b._id} box={b} locationId={locationId} onChanged={() => load()} />
                : (
                  <tr key={b._id} style={b.active === false ? { opacity: 0.55 } : undefined}>
                    <td data-label="Label">{b.label}</td>
                    <td data-label="Size">{b.size}</td>
                    {canManage
                      ? <td data-label="Status">{b.active === false ? 'Retired' : 'Active'}</td>
                      : <td data-label="Location">{b.location?.name || '—'}</td>}
                  </tr>
                ))}
            </tbody>
          </table>
          {editing && (
            <p style={{ fontSize: 13, opacity: 0.75, marginTop: 12 }}>
              Retired boxes keep their delivery history but no longer need refilling, so they
              don't block a visit from being completed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddBox({ locationId, onAdded }){
  const [label, setLabel] = useState('');
  const [size, setSize] = useState('M');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function add(e){
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.boxes.create({ location: locationId, label: label.trim() || undefined, size });
      setLabel('');
      onAdded();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={add} style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div>
          <label>New box label</label>
          <input className="input" placeholder="Automatic (Box N)" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div>
          <label>Size</label>
          <select className="input" value={size} onChange={e => setSize(e.target.value)}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add box'}</button>
        </div>
      </div>
      {err && <div style={{ color:'red', marginTop: 8 }}>{err}</div>}
    </form>
  );
}

function BoxRow({ box, locationId, onChanged }){
  const [label, setLabel] = useState(box.label);
  const [size, setSize] = useState(box.size);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState('');
  const active = box.active !== false;
  const dirty = label.trim() !== box.label || size !== box.size;

  async function run(fn){
    setBusy(true); setErr('');
    try { await fn(); onChanged(); }
    catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  const save = () => run(() => api.boxes.update(box._id, { label: label.trim(), size }));
  const toggleActive = () => run(() => api.boxes.update(box._id, { active: !active }));
  const remove = () => run(async () => {
    try { await api.boxes.remove(box._id, locationId); }
    finally { setConfirmDelete(false); }
  });

  return (
    <tr style={active ? undefined : { opacity: 0.55 }}>
      <td data-label="Label">
        <input className="input" value={label} onChange={e => setLabel(e.target.value)} disabled={busy} />
      </td>
      <td data-label="Size">
        <select className="input" value={size} onChange={e => setSize(e.target.value)} disabled={busy}>
          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td data-label="Status">{active ? 'Active' : 'Retired'}</td>
      <td data-label="">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {dirty && (
            <button className="btn primary" onClick={save} disabled={busy || !label.trim()}>Save</button>
          )}
          <button className="btn" onClick={toggleActive} disabled={busy}>{active ? 'Retire' : 'Restore'}</button>
          {confirmDelete ? (
            <>
              <button className="btn" onClick={remove} disabled={busy} style={{ color: '#b00020' }}>Confirm delete</button>
              <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</button>
            </>
          ) : (
            <button className="btn" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</button>
          )}
        </div>
        {err && <div style={{ color:'red', marginTop: 6, fontSize: 13 }}>{err}</div>}
      </td>
    </tr>
  );
}
