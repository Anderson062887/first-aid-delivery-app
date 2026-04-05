import { useEffect, useState, useRef } from 'react';
import { usersApi } from '../api';

export default function RepBar({ onChange }) {
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState(localStorage.getItem('selectedRepId') || '');
  const [err, setErr] = useState('');
  const onChangeRef = useRef(onChange);
  const initialRepId = useRef(repId);

  // Keep ref updated
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    usersApi.list()
      .then(users => {
        // Backward-compatible filter:
        // - active
        // - roles includes 'rep' OR legacy role === 'rep' OR missing roles (treat as rep)
        const list = (users || []).filter(u => {
          const roles = Array.isArray(u.roles) ? u.roles : [];
          const hasRepRole = roles.includes('rep') || u.role === 'rep' || roles.length === 0;
          return (u.active !== false) && hasRepRole;
        });

        setReps(list);

        // If nothing selected yet but we have reps, pick the first one
        if (!initialRepId.current && list.length > 0) {
          const first = String(list[0]._id);
          setRepId(first);
          localStorage.setItem('selectedRepId', first);
          onChangeRef.current?.(first);
        }
      })
      .catch(e => setErr(String(e?.message || e)));
  }, []);

  function change(e){
    const id = e.target.value;
    setRepId(id);
    localStorage.setItem('selectedRepId', id);
    onChange?.(id);
  }

  return (
    <div className="card" style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
      <label style={{ minWidth: 80, fontWeight:600 }}>Rep:</label>

      <select className="input" value={repId} onChange={change} style={{ maxWidth: 260 }}>
        <option value="">Select rep…</option>
        {reps.map(r => (
          <option key={r._id} value={r._id}>{r.name}</option>
        ))}
      </select>

      {!!repId && <span style={{ opacity:.7 }}>Selected rep is saved</span>}
      {err && <span style={{ color:'red' }}>{err}</span>}
    </div>
  );
}
