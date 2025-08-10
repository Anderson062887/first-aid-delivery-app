import { useEffect, useState } from 'react';
import { visitApi } from '../api';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import Flash from '../components/Flash.jsx';

function useQuery(){ return new URLSearchParams(useLocation().search); }

export default function VisitPage(){
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery();
  const done = q.get('done'); // 'delivery' when coming back from NewDelivery
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load(){
    try { setData(await visitApi.get(id)); setError(''); }
    catch(e){ setError(String(e.message||e)); }
  }
  useEffect(()=>{ load(); },[id]);

  async function submit(){
    try {
      await visitApi.submit(id);
      // After a successful visit submit, go to Dashboard with a success banner
      nav('/?done=visit');
    } catch(e){
      setError(String(e.message||e));
    }
  }

  if(!data) return <div>Loading…</div>;
  const { visit, boxes } = data;
  const allCovered = boxes.every(b => b.covered);

  return (
    <div>
      <h2>Visit: {visit.location.name} — Rep: {visit.rep.name}</h2>

      {done === 'delivery' && <Flash>Delivery recorded for this visit ✅</Flash>}
      {error && <div style={{color:'red', marginBottom:10}}>{error}</div>}

      {boxes.map(b => (
        <div className="card" key={b.boxId}>
          <strong>{b.label}</strong> — Size: {b.size} — {b.covered ? '✅ Refilled' : '❌ Not filled'}
          {!b.covered && (
            <div style={{marginTop:8}}>
              <Link
                className="btn"
                to={`/deliveries/new?visit=${encodeURIComponent(visit._id)}&box=${encodeURIComponent(String(b.boxId || ''))}`}
              >
                Refill this box
              </Link>
            </div>
          )}
        </div>
      ))}

      <div className="card">
        <button className="btn primary" disabled={!allCovered || visit.status==='submitted'} onClick={submit}>
          Submit Visit
        </button>
      </div>
    </div>
  );
}


