import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { visitApi } from '../api';
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
    visitApi.get(id).then(data => {
      if (cancelled) return;
      const v = data?.visit || data;
      setVisit(v);
      setNote(v.note || '');
      setOutcome(v.outcome || '');
    }).catch(e => !cancelled && setErr(String(e?.message || e)));
    return () => { cancelled = true; };
  }, [id]);

  async function save(){
    try{
      setErr(''); setMsg('');
      const updated = await visitApi.update(id, { note, outcome });
      setMsg('Visit updated.');
      nav(`/deliveries/visit/${updated._id || id}`);
    }catch(e){ setErr(String(e?.message || e)); }
  }

  if (!visit) return <div className="card">Loading…</div>;

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Deliveries', to: '/deliveries' },
        { label: 'Visit Details', to: `/deliveries/visit/${id}` },
        { label: 'Edit Visit' }
      ]} />

      <div className="card stack-sm">
        <h2 className="m0">Edit Visit</h2>
        <div><strong>Location:</strong> {visit.location?.name || '—'}</div>
        <div><strong>Rep:</strong> {visit.rep?.name || visit.repName || '—'}</div>

        {err && <div className="error">{err}</div>}
        {msg && <div className="success">{msg}</div>}

        <label>Outcome</label>
        <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
          {kinds.map(k => (
            <label className="inline" key={k}>
              <input type="radio" name="outcome" checked={outcome===k} onChange={()=>setOutcome(k)} />
              <Badge kind={k}>{k.replace('_',' ')}</Badge>
            </label>
          ))}
        </div>

        <label className="mt">Note</label>
        <textarea className="input" rows={4} value={note} onChange={e=>setNote(e.target.value)} />

        <div className="row" style={{ gap:8 }}>
          <button className="btn primary" onClick={save}>Save</button>
          <Link className="btn" to={`/deliveries/visit/${id}`}>Cancel</Link>
        </div>
      </div>
    </div>
  );
}
