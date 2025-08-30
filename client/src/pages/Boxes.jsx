import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLocation, Link } from 'react-router-dom';

function useQuery(){ return new URLSearchParams(useLocation().search); }

export default function Boxes(){
  const q = useQuery();
  const locationId = q.get('location') || '';
  const [boxes, setBoxes] = useState([]);
  const [locationName, setLocationName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(){
      try{
        setLoading(true);
        const list = await api.boxes.list(locationId || undefined);
        if (cancelled) return;
        setBoxes(list || []);
        if (list?.length && list[0]?.location?.name){
          setLocationName(list[0].location.name);
        } else if (!locationId) {
          setLocationName('All Locations');
        } else {
          // fetch the location name only if needed
          const locs = await fetch(`/api/locations?${new URLSearchParams({ q: locationId })}`).then(r=>r.json()).catch(()=>[]);
          // fallback name
          setLocationName(locationId);
        }
        setErr('');
      } catch(e){
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [locationId]);

  return (
    <div>
      <h2>Boxes {locationName ? `— ${locationName}` : ''}</h2>
      <div  style={{ marginBottom: 12 }}>
        <Link className="btn" to="/locations">← Back to Locations</Link>
      </div>

      {err && <div style={{ color:'red', margin:'12px 0' }}>{err}</div>}
      {loading && <div className="card">Loading…</div>}

      {!loading && boxes.length === 0 && (
        <div className="card">No boxes found for this location.</div>
      )}

      {!loading && boxes.length > 0 && (
        <div className="card" style={{ overflowX:'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Size</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map(b => (
                <tr key={b._id}>
                  <td>{b.label}</td>
                  <td>{b.size}</td>
                  <td>{b.location?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

