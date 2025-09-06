// client/src/pages/Visit.jsx
import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, visitApi } from '../api';
import Badge from '../components/Badge.jsx';
import { cacheVisit, cacheBoxes, cacheItems, getBoxes } from '../cache.js';
import Flash from '../components/Flash.jsx';




const outcomeKind = (o) =>
  o === 'completed' ? 'completed' :
  o === 'partial'   ? 'partial'   :
  o === 'no_access' ? 'no_access' :
  o === 'skipped'   ? 'skipped'   : 'default';

const OUTCOMES = ['completed', 'partial', 'no_access', 'skipped'];

// Normalize any box object into a stable id
function getBoxId(b) {
  return b?._id || b?.boxId || b?.id || null;
}

export default function Visit(){
  const { id } = useParams();               // /visits/:id
  const navigate = useNavigate();

  const [visit, setVisit] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [deliveredIds, setDeliveredIds] = useState(new Set());
  const [outcome, setOutcome] = useState('');   // <— bring back user-selectable outcome
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  

  const readonly = !!visit?.submittedAt;

  // Load visit + prefetch (items/boxes) for offline
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr('');

        const data = await visitApi.get(id);
        const v = data?.visit || data;
        if (!v?._id) throw new Error('Visit not found');

        if (cancelled) return;
        setVisit(v);
        setOutcome(v.outcome || '');    // preset previous outcome if any
        setNote(v.note || '');

        cacheVisit(v._id, v).catch(()=>{});

        // Boxes for the location
        if (v.location?._id) {
          try {
            const list = await api.boxes.list(v.location._id);
            if (!cancelled) setBoxes(Array.isArray(list) ? list : []);
            cacheBoxes(v.location._id, Array.isArray(list) ? list : []).catch(()=>{});
          } catch {
            // fallback to cache if offline
            const cached = await getBoxes(v.location._id);
            if (!cancelled) setBoxes(Array.isArray(cached) ? cached : []);
          }
        } else {
          setBoxes([]);
        }

        // Items for picker (offline)
        api.items.list()
          .then(list => cacheItems(Array.isArray(list) ? list : []))
          .catch(()=>{});
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Load deliveries and only count those from THIS visit
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/deliveries?visit=${encodeURIComponent(id)}&limit=1000&page=1`, {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!r.ok) throw new Error('Failed to load visit deliveries');
        const j = await r.json();
        const list = Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []);

        // Only this visit (populated or plain id)
        const onlyThisVisit = list.filter(d => String(d?.visit?._id || d?.visit) === String(id));

        const ids = new Set(
          onlyThisVisit
            .map(d => d?.box?._id || d?.box)
            .filter(Boolean)
            .map(String)
        );
        if (!cancelled) setDeliveredIds(ids);
      } catch {
        if (!cancelled) setDeliveredIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // All boxes covered only if each location box appears in deliveredIds
  const allCovered = boxes.length > 0 && boxes.every(b => deliveredIds.has(String(getBoxId(b))));

  async function submitVisit(){
    // Guard: completed requires all boxes refilled
    if (outcome === 'completed' && !allCovered) {
      // alert('To submit as completed, you must refill all boxes.');
      setErr('To submit as completed, you must refill all boxes.')
      return;
    }
    try{
      setSaving(true);
      const payload = { outcome: outcome || undefined, note };
      await visitApi.submit(id, payload);

      // Reflect locally (so the page shows submitted state)
      setVisit(v => v ? { ...v, outcome: payload.outcome || v.outcome, note, submittedAt: new Date().toISOString() } : v);

      navigate(`/?done=visit`);
    }catch(e){
      // alert(e?.message || 'Failed to submit visit');
        
                console.error('Submit visit failed:', e);
          let msg = e?.message || 'Failed to submit visit. Please try again.';
          if (msg.includes('outcome')) {
            msg = '⚠️ Please select an outcome before submitting.';
          } else if (msg.includes('lines') || msg.includes('boxes')) {
            msg = '⚠️ Please refill at least one box before submitting.';
          }
  setErr(msg);
  const timeoutId = setTimeout(() => setErr(''), 1500);
    return () => clearTimeout(timeoutId);
            
    }finally{
      setSaving(false);
    }
  }

  if (err) return <div className="card" style={{ color:'red' }}>{err}</div>;
  if (loading || !visit) return <div className="card">Loading…</div>;

  const repName   = visit.rep?.name || visit.repName || '—';
  const locName   = visit.location?.name || '—';
  const started   = visit.startedAt ? new Date(visit.startedAt).toLocaleString() : '—';
  const submitted = visit.submittedAt ? new Date(visit.submittedAt).toLocaleString() : null;



  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={()=>navigate(-1)}>← Back</button>
      </div>

      <div className="card" style={{ display:'grid', gap:6 }}>
        <h2 style={{ margin:0 }}>Visit</h2>
        <div><strong>Location:</strong> {locName}</div>
        <div><strong>Rep:</strong> {repName}</div>
        <div><strong>Started:</strong> {started}</div>
        {submitted && <div><strong>Submitted:</strong> {submitted}</div>}
        <div>
          <strong>Outcome:</strong>{' '}
          {visit.outcome
            ? <Badge kind={outcomeKind(visit.outcome)}>{visit.outcome.replace('_',' ')}</Badge>
            : '—'}
        </div>
        {visit.note && <div><strong>Note:</strong> {visit.note}</div>}
      </div>

      <div className="card" style={{ display:'grid', gap:10 }}>
        <h3 style={{ margin:0 }}>Boxes at this location</h3>

        {boxes.length === 0 && (
          <div style={{ opacity:.8 }}>No boxes found for this location.</div>
        )}

        {boxes.length > 0 && (
          <div style={{ display:'grid', gap:8 }}>
            {boxes.map(b => {
              const bid = String(getBoxId(b));
              const covered = deliveredIds.has(bid);
              return (
                <div
                  key={bid}
                  style={{
                    display:'flex',
                    alignItems:'center',
                    gap:10,
                    justifyContent:'space-between',
                    border:'1px solid #eee',
                    borderRadius:8,
                    padding:10
                  }}
                >
                  <div>
                    <div style={{ fontWeight:600 }}>{b.label}</div>
                    {b.size && <div style={{ opacity:.8 }}>Size: {b.size}</div>}
                    <div style={{ marginTop:4 }}>
                      {covered ? '✅ Refilled' : '❌ Not filled'}
                    </div>
                  </div>

                  {!covered && !readonly && (
                    <Link
                      className="btn"
                      to={`/deliveries/new?visit=${encodeURIComponent(visit._id)}&box=${encodeURIComponent(bid)}`}
                      state={{ visit, box: b }}
                    >
                      Refill this box
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {err && (
              <div style={{
              background: 'tomato',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: 4,
              marginBottom: 10
            }}>
              {err}
            </div>
          )}
  


      <div className="card" style={{ display:'grid', gap:10 }}>
        <h3 style={{ margin:0 }}>Submit Visit</h3>

        <label>Outcome</label>
        <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
          {OUTCOMES.map(k => {
            const disabled = readonly || (k === 'completed' && !allCovered);
            return (
              <label key={k} style={{ display:'flex', gap:6, alignItems:'center', opacity: disabled ? .6 : 1 }}>
                <input
                  type="radio"
                  name="outcome"
                  checked={outcome === k}
                  disabled={disabled}
                  onChange={() => setOutcome(k)}
                />
                <Badge kind={outcomeKind(k)}>{k.replace('_',' ')}</Badge>
              </label>
            );
          })}
        </div>
        {!readonly && outcome === 'completed' && !allCovered && (
          <div style={{ color:'#a00' }}>
            You must refill all boxes before submitting as <strong>completed</strong>.
          </div>
        )}

        <label style={{ marginTop:8 }}>Note</label>
        <textarea
          className="input"
          rows={4}
          value={note}
          onChange={e=>setNote(e.target.value)}
          placeholder="Optional note about this visit…"
          readOnly={readonly}
        />
 <div  style={{ justifyContent:'flex-end' }}>
          <button
            className="btn primary"
            onClick={submitVisit}
            disabled={readonly || saving || (outcome === 'completed' && !allCovered)}
            title={
              readonly
                ? 'This visit has already been submitted'
                : (outcome === 'completed' && !allCovered ? 'Refill all boxes to submit as completed' : '')
            }
          >
            {saving ? 'Submitting…' : (readonly ? 'Visit Submitted' : 'Submit Visit')}
          </button>
        </div>
       
      </div>
    </div>
  );
}








// import { useEffect, useState } from 'react';
// import { visitApi } from '../api';
// import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
// import Flash from '../components/Flash.jsx';

// function useQuery(){ return new URLSearchParams(useLocation().search); }

// export default function VisitPage(){
//   const { id } = useParams();
//   const nav = useNavigate();
//   const q = useQuery();
//   const done = q.get('done');
//   const [data, setData] = useState(null);
//   const [error, setError] = useState('');

//   const [note, setNote] = useState('');
//   const [outcome, setOutcome] = useState('completed');
//   const [savingNote, setSavingNote] = useState(false);

//   async function load(){
//     try {
//       const res = await visitApi.get(id);
//       setData(res);
//       setError('');
//       if (res?.visit?.note !== undefined) setNote(res.visit.note || '');
//     } catch(e){
//       setError(String(e.message||e));
//     }
//   }
//   useEffect(()=>{ load(); },[id]);

//   async function saveNote(){
//     try {
//       setSavingNote(true);
//       await visitApi.setNote(id, note);
//     } catch(e){
//       setError(String(e.message||e));
//     } finally {
//       setSavingNote(false);
//     }
//   }

//   async function submit(){
//     try {
//       await visitApi.submit(id, { outcome, note });
//       nav('/?done=visit');
//     } catch(e){
//       setError(String(e.message||e));
//     }
//   }

//   if(!data) return <div>Loading…</div>;
//   const { visit, boxes } = data;
//   const allCovered = boxes.every(b => b.covered);

//   // If outcome is 'completed', require all boxes covered; else allow submit
//   const canSubmit = (outcome === 'completed' ? allCovered : true) && visit.status !== 'submitted';

//   return (
//     <div>
//       <h2>Visit: {visit.location.name} — Rep: {visit.rep.name}</h2>

//       {done === 'delivery' && <Flash>Delivery recorded for this visit ✅</Flash>}
//       {error && <div style={{color:'red', marginBottom:10}}>{error}</div>}

//       <div className="card" style={{ display:'grid', gap:10 }}>
//         <div>
//           <label style={{ fontWeight:600 }}>Outcome</label>
//           <div className="row" style={{ gap:12 }}>
//             {['completed','partial','no_access','skipped'].map(o => (
//               <label key={o} style={{ display:'flex', gap:6, alignItems:'center' }}>
//                 <input
//                   type="radio"
//                   name="outcome"
//                   value={o}
//                   checked={outcome === o}
//                   onChange={e => setOutcome(e.target.value)}
//                 />
//                 {o.replace('_',' ')}
//               </label>
//             ))}
//           </div>
//           {outcome === 'completed' && !allCovered && (
//             <div style={{ color:'#a00', marginTop:6 }}>
//               To submit as <b>completed</b>, all boxes must be refilled.
//             </div>
//           )}
//         </div>

//         <div>
//           <label style={{ fontWeight:600 }}>Note (optional)</label>
//           <textarea
//             className="input"
//             rows={3}
//             placeholder="e.g., Gate locked; left voicemail; only Box A accessible"
//             value={note}
//             onChange={e=>setNote(e.target.value)}
//             onBlur={saveNote}
//           />
//           <div style={{ opacity:.7, fontSize:12 }}>
//             {savingNote ? 'Saving…' : 'Note saves automatically when you leave the field.'}
//           </div>
//         </div>
//       </div>

//       {boxes.map(b => (
//         <div className="card" key={b.boxId}>
//           <strong>{b.label}</strong> — Size: {b.size} — {b.covered ? '✅ Refilled' : '❌ Not filled'}
//           {!b.covered && (
//             <div style={{marginTop:8}}>
//               <Link className="btn" to={`/deliveries/new?visit=${encodeURIComponent(visit._id)}&box=${encodeURIComponent(String(b.boxId || ''))}`}>
//                 Refill this box
//               </Link>
//             </div>
//           )}
//         </div>
//       ))}

//       <div className="card">
//         <button className="btn primary" disabled={!canSubmit} onClick={submit}>
//           Submit Visit
//         </button>
//       </div>
//     </div>
//   );
// }



