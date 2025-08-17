import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import Badge from '../components/Badge.jsx';

const kinds = ['completed','partial','no_access','skipped'];

export default function VisitEdit(){
  const { id } = useParams();
  const nav = useNavigate();
  const [visit, setVisit] = useState(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.visits.one(id).then(v => {
      if (cancelled) return;
      setVisit(v);
      setNote(v.note || '');
      setOutcome(v.outcome || '');
    }).catch(e => !cancelled && setErr(String(e?.message || e)));
    return () => { cancelled = true; };
  }, [id]);

  async function save(){
    try{
      setErr(''); setMsg('');
      const updated = await api.visits.update(id, { note, outcome });
      setMsg('Visit updated.');
      nav(`/deliveries/visit/${updated._id}`); // back to visit details
    }catch(e){ setErr(String(e?.message || e)); }
  }

  if (!visit) return <div className="card">Loading…</div>;

  return (
    <div>
      <div className="row" style={{ marginBottom:12 }}>
        <button className="btn" onClick={()=>nav(-1)}>← Back</button>
      </div>

      <div className="card" style={{ display:'grid', gap:8 }}>
        <h2 style={{ margin:0 }}>Edit Visit</h2>
        <div><strong>Location:</strong> {visit.location?.name || '—'}</div>
        <div><strong>Rep:</strong> {visit.rep?.name || visit.repName || '—'}</div>

        {err && <div style={{ color:'red' }}>{err}</div>}
        {msg && <div style={{ color:'green' }}>{msg}</div>}

        <label>Outcome</label>
        <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
          {kinds.map(k => (
            <label key={k} style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input type="radio" name="outcome" checked={outcome===k} onChange={()=>setOutcome(k)} />
              <Badge kind={k}>{k.replace('_',' ')}</Badge>
            </label>
          ))}
        </div>

        <label style={{ marginTop:8 }}>Note</label>
        <textarea className="input" rows={4} value={note} onChange={e=>setNote(e.target.value)} />

        <div className="row" style={{ gap:8 }}>
          <button className="btn primary" onClick={save}>Save</button>
          <Link className="btn" to={`/deliveries/visit/${id}`}>Cancel</Link>
        </div>
      </div>
    </div>
  );
}
