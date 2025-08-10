import { useEffect, useState } from 'react';
import { api } from '../api';
import { visitApi } from '../api';
import { useNavigate } from 'react-router-dom';

export default function VisitStart(){
  const nav = useNavigate();
  const [reps, setReps] = useState([]);
  const [locations, setLocations] = useState([]);
  const [rep, setRep] = useState('');
  const [location, setLocation] = useState('');

  useEffect(()=>{
    fetch('/api/users').then(r=>r.json()).then(setReps);
    api.locations.list().then(setLocations);
  },[]);

  async function start(){
    if(!rep || !location) return alert('Pick rep and location');
    const v = await visitApi.start(rep, location);
    nav(`/visits/${v._id}`);
  }

  return (
    <div>
      <h2>Start Visit</h2>
      <div className="card">
        <label>Rep</label>
        <select className="input" value={rep} onChange={e=>setRep(e.target.value)}>
          <option value="">Select…</option>
          {reps.filter(r=>r.active && r.role==='rep').map(r=>(
            <option key={r._id} value={r._id}>{r.name}</option>
          ))}
        </select>

        <label>Location</label>
        <select className="input" value={location} onChange={e=>setLocation(e.target.value)}>
          <option value="">Select…</option>
          {locations.map(l=> <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>

        <button className="btn primary" onClick={start}>Start</button>
      </div>
    </div>
  );
}
