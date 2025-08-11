import { useEffect, useState } from 'react';
import { usersApi } from '../api';


export default function RepBar({ onChange }) {
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState(localStorage.getItem('selectedRepId') || '');

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(users => setReps((users || []).filter(u => u.active && u.role === 'rep')))
      .catch(console.error);
  }, []);

  function change(e){
    const id = e.target.value;
    setRepId(id);
    localStorage.setItem('selectedRepId', id);
    onChange?.(id);
  }

  return (
    <div className="card" style={{ display:'flex', gap:12, alignItems:'center' }}>
      <label style={{ minWidth: 80 }}>Rep:</label>
      <select className="input" value={repId} onChange={change} style={{ maxWidth: 260 }}>
        <option value="">Select rep…</option>
        {reps.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
      </select>
      {!!repId && <span style={{ opacity:.7 }}>Selected rep is saved</span>}
    </div>
  );
}
