import { useEffect, useState } from 'react';
import { api, visitApi } from '../api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function VisitStart(){
  const nav = useNavigate();
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.locations.list()
      .then(setLocations)
      .catch(() => setErr('Failed to load locations'));
  }, []);

  async function start(){
    setErr('');
    if (!location) {
      setErr('Please select a location');
      return;
    }

    setLoading(true);
    try {
      const v = await visitApi.start(location);
      nav(`/visits/${v._id}`);
    } catch (e) {
      setErr(e.message || 'Failed to start visit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Start Visit</h2>
      <div className="card">
        <label>Rep</label>
        <input
          className="input"
          value={user?.name || ''}
          readOnly
          style={{ backgroundColor: '#f5f5f5' }}
        />
        <small style={{ opacity: 0.7, marginBottom: 12 }}>
          Visit will be assigned to you
        </small>

        <label>Location</label>
        <select className="input" value={location} onChange={e => setLocation(e.target.value)}>
          <option value="">Select location…</option>
          {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>

        {err && <div style={{ color: 'red', marginTop: 8 }}>{err}</div>}

        <button className="btn primary" onClick={start} disabled={loading} style={{ marginTop: 12 }}>
          {loading ? 'Starting…' : 'Start Visit'}
        </button>
      </div>
    </div>
  );
}
