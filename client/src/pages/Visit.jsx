import { useEffect, useState } from 'react';
import { visitApi } from '../api';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import Flash from '../components/Flash.jsx';

function useQuery(){ return new URLSearchParams(useLocation().search); }

export default function VisitPage(){
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery();
  const done = q.get('done');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('completed');
  const [savingNote, setSavingNote] = useState(false);

  async function load(){
    try {
      const res = await visitApi.get(id);
      setData(res);
      setError('');
      if (res?.visit?.note !== undefined) setNote(res.visit.note || '');
    } catch(e){
      setError(String(e.message||e));
    }
  }
  useEffect(()=>{ load(); },[id]);

  async function saveNote(){
    try {
      setSavingNote(true);
      await visitApi.setNote(id, note);
    } catch(e){
      setError(String(e.message||e));
    } finally {
      setSavingNote(false);
    }
  }

  async function submit(){
    try {
      await visitApi.submit(id, { outcome, note });
      nav('/?done=visit');
    } catch(e){
      setError(String(e.message||e));
    }
  }

  if(!data) return <div>Loading…</div>;
  const { visit, boxes } = data;
  const allCovered = boxes.every(b => b.covered);

  // If outcome is 'completed', require all boxes covered; else allow submit
  const canSubmit = (outcome === 'completed' ? allCovered : true) && visit.status !== 'submitted';

  return (
    <div>
      <h2>Visit: {visit.location.name} — Rep: {visit.rep.name}</h2>

      {done === 'delivery' && <Flash>Delivery recorded for this visit ✅</Flash>}
      {error && <div style={{color:'red', marginBottom:10}}>{error}</div>}

      <div className="card" style={{ display:'grid', gap:10 }}>
        <div>
          <label style={{ fontWeight:600 }}>Outcome</label>
          <div className="row" style={{ gap:12 }}>
            {['completed','partial','no_access','skipped'].map(o => (
              <label key={o} style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input
                  type="radio"
                  name="outcome"
                  value={o}
                  checked={outcome === o}
                  onChange={e => setOutcome(e.target.value)}
                />
                {o.replace('_',' ')}
              </label>
            ))}
          </div>
          {outcome === 'completed' && !allCovered && (
            <div style={{ color:'#a00', marginTop:6 }}>
              To submit as <b>completed</b>, all boxes must be refilled.
            </div>
          )}
        </div>

        <div>
          <label style={{ fontWeight:600 }}>Note (optional)</label>
          <textarea
            className="input"
            rows={3}
            placeholder="e.g., Gate locked; left voicemail; only Box A accessible"
            value={note}
            onChange={e=>setNote(e.target.value)}
            onBlur={saveNote}
          />
          <div style={{ opacity:.7, fontSize:12 }}>
            {savingNote ? 'Saving…' : 'Note saves automatically when you leave the field.'}
          </div>
        </div>
      </div>

      {boxes.map(b => (
        <div className="card" key={b.boxId}>
          <strong>{b.label}</strong> — Size: {b.size} — {b.covered ? '✅ Refilled' : '❌ Not filled'}
          {!b.covered && (
            <div style={{marginTop:8}}>
              <Link className="btn" to={`/deliveries/new?visit=${encodeURIComponent(visit._id)}&box=${encodeURIComponent(String(b.boxId || ''))}`}>
                Refill this box
              </Link>
            </div>
          )}
        </div>
      ))}

      <div className="card">
        <button className="btn primary" disabled={!canSubmit} onClick={submit}>
          Submit Visit
        </button>
      </div>
    </div>
  );
}



