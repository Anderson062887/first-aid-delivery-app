import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Badge from '../components/Badge.jsx';

const money = (n) => Number(n || 0).toFixed(2);
const fmtAddress = (addr) => {
  if (!addr || typeof addr !== 'object') return '';
  const { street, city, state, zip } = addr;
  return [street, city, state, zip].filter(Boolean).join(', ');
};
const outcomeKind = (o) =>
  o === 'completed' ? 'completed' :
  o === 'partial'   ? 'partial'   :
  o === 'no_access' ? 'no_access' :
  o === 'skipped'   ? 'skipped'   : 'default';

export default function DeliveryVisitDetail() {
  const { visitId } = useParams();
  const [visitDoc, setVisitDoc] = useState(null); // normalized Visit doc
  const [rows, setRows] = useState([]);           // deliveries from API
  const [err, setErr] = useState('');

  // 1) Load the visit; handle both shapes: {visit, boxes} OR visit doc
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/visits/${visitId}`);
        if (!r.ok) throw new Error('Failed to load visit');
        const data = await r.json();

        // normalize: some APIs return { visit, boxes }, others return the doc directly
        const v = data?.visit ? data.visit : data;
        if (!v?._id) throw new Error('Visit not found');

        if (!cancelled) setVisitDoc(v);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  // 2) Load deliveries for THIS visit; also client-filter as a safeguard
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/deliveries?visit=${encodeURIComponent(visitId)}&limit=1000&page=1`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!r.ok) throw new Error('Failed to load deliveries for visit');
        const json = await r.json();

        // support both shapes: { data } or raw array
        const raw = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
        // client-side safety filter (in case the backend ignores ?visit=)
        const onlyThisVisit = raw.filter(d => (d.visit?._id || d.visit) === visitId);

        if (!cancelled) setRows(onlyThisVisit);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  const totals = useMemo(() => ({
    total: rows.reduce((s, d) => s + Number(d.total || 0), 0),
    itemsTotal:rows.reduce((a,n)=> [...a,...n.lines],[]).length,
    boxCount: rows.length
  }), [rows]);

  if (err) return <div className="card" style={{ color:'red' }}>{err}</div>;
  if (!visitDoc) return <div className="card">Loading…</div>;

  const locName = visitDoc.location?.name || '—';
  const locAddr = fmtAddress(visitDoc.location?.address);
  const repName = visitDoc.rep?.name || '—';
  const started = visitDoc.startedAt ? new Date(visitDoc.startedAt).toLocaleString() : '—';
  const submitted = visitDoc.submittedAt ? new Date(visitDoc.submittedAt).toLocaleString() : null;

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn" to="/deliveries">← Back to Deliveries</Link>
      </div>

      <div className="card" style={{ display:'grid', gap:6 }}>
        <h2 style={{ margin:0 }}>Visit Details</h2>
        <div><strong>Location:</strong> {locName}{locAddr ? ` — ${locAddr}` : ''}</div>
        <div><strong>Rep:</strong> {repName}</div>
        <div><strong>Started:</strong> {started}</div>
        {submitted && <div><strong>Submitted:</strong> {submitted}</div>}
        <div>
          <strong>Outcome:</strong>{' '}
          {visitDoc.outcome
            ? <Badge kind={outcomeKind(visitDoc.outcome)}>{visitDoc.outcome.replace('_',' ')}</Badge>
            : '—'}
        </div>
        {visitDoc.note && <div><strong>Note:</strong> {visitDoc.note}</div>}
         <div><strong># Items:</strong> {totals.itemsTotal}</div>
        <div><strong># Boxes:</strong> {totals.boxCount}</div>
        <div><strong>Total:</strong> ${money(totals.total)}</div>
      </div>

      <div className="card" style={{ overflowX:'auto', marginTop:12 }}>
        <h3 style={{ marginTop:0 }}>Deliveries for this visit</h3>
        {rows.length === 0 && <div>No deliveries yet for this visit.</div>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Box</th>
                <th>Lines</th>
                <th>Total</th>
                <th>Open single delivery</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const when = d.deliveredAt || d.createdAt;
                return (
                  <tr key={d._id}>
                    <td>{when ? new Date(when).toLocaleString() : '—'}</td>
                    <td>{d.box?.label || '—'}{d.box?.size ? ` (size: ${d.box.size})` : ''}</td>
                    <td>
                      {(d.lines || []).map((l,i) => (
                        <div key={i}>
                          {(l.item?.name || 'Item')} × {l.quantity} {l.packaging} @ ${money(l.unitPrice)} = ${money(l.lineTotal)}
                        </div>
                      ))}
                    </td>
                    <td>${money(d.total)}</td>
                    <td><Link to={`/deliveries/${d._id}`}>Single delivery view</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


