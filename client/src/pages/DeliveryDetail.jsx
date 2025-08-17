import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

const money = (n) => Number(n || 0).toFixed(2);
const fmtAddress = (addr) => {
  if (!addr || typeof addr !== 'object') return '';
  const { street, city, state, zip } = addr;
  return [street, city, state, zip].filter(Boolean).join(', ');
};

export default function DeliveryDetail(){
  const { id } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [err, setErr] = useState('');
    const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load(){
      try{
        const res = await fetch(`/api/deliveries/${id}`);
        if(!res.ok) throw new Error('Failed to load delivery');
        const d = await res.json();
        if (!cancelled) setDelivery(d);
      }catch(e){
        if (!cancelled) setErr(String(e?.message || e));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <div className="card" style={{color:'red'}}>{err}</div>;
  if (!delivery) return <div className="card">Loading…</div>;

  const when = delivery.deliveredAt || delivery.createdAt;
  const total = delivery.total ?? (delivery.lines || []).reduce((s,l)=> s + Number(l.lineTotal || 0), 0);
  const locationName = delivery.location?.name || '—';
  const locationAddress = fmtAddress(delivery.location?.address);
  const boxLabel = delivery.box?.label || '—';
  const boxSize  = delivery.box?.size ? ` (size: ${delivery.box.size})` : '';
  const repName  = delivery.visit?.rep?.name || delivery.repName || '—';

  return (
    <div>
      <div  style={{ marginBottom: 12, border:"none" }}>
        <Link className="btn" to="/deliveries">← Back to Deliveries</Link>
        
      </div>
          {/* /edit/
          <div className="card">
             <div className="row" style={{ gap:8 }}>
              <Link className="btn" to={`/deliveries/${delivery._id}/edit`}>Edit delivery</Link>
              <button className="btn" onClick={()=>navigate(-1)}>Back</button>
            </div>
        </div> */}

      <div className="card" style={{ display:'grid', gap:6 }}>
        <h2 style={{ margin: 0 }}>Delivery Detail</h2>
        <div><strong>Date:</strong> {when ? new Date(when).toLocaleString() : '—'}</div>
        <div><strong>Location:</strong> {locationName}{locationAddress ? ` — ${locationAddress}` : ''}</div>
        <div><strong>Box:</strong> {boxLabel}{boxSize}</div>
        <div><strong>Rep:</strong> {repName}</div>
        {delivery.visit?.outcome && (
          <div><strong>Visit outcome:</strong> {delivery.visit.outcome.replace('_',' ')}</div>
        )}
        {delivery.visit?.note && (
          <div><strong>Visit note:</strong> {delivery.visit.note}</div>
        )}
        <div><strong>Total:</strong> ${money(total)}</div>
      </div>
  

      <div className="card" style={{ overflowX:'auto', marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Packaging</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(delivery.lines || []).map((l, i) => (
              <tr key={i}>
                <td>{l.item?.name || 'Item'}</td>
                <td>{l.packaging || '—'}</td>
                <td>{l.quantity}</td>
                <td>${money(l.unitPrice)}</td>
                <td>${money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {delivery.visit?._id && (
        <div className="card">
         <button
            className="btn"
            onClick={() => navigate(-1)} // Go back to previous page
          >
            Back
            </button>
        </div>
      )}
    </div>
  );
}

