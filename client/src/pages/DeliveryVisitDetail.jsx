import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Badge from '../components/Badge.jsx';

import { api } from '../api';
import { isOnline } from '../offline';

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

/* ---------- CSV helpers ---------- */
function encodeCsv(rows) {
  return rows.map(cols =>
    cols.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build a CSV for this visit: one row per line item across all deliveries */
function buildVisitLinesCsv(visitDoc, deliveries) {
  const header = [
    'Date',
    'Location',
    'Address',
    'Rep',
    'VisitId',
    'DeliveryId',
    'BoxLabel',
    'BoxSize',
    'ItemName',
    'Packaging',
    'Qty',
    'UnitPrice',
    'LineTotal',
    'DeliveryTotal',
    'Outcome',
    'Note'
  ];

  const rows = [header];
  (deliveries || []).forEach(d => {
    const when = d.deliveredAt || d.createdAt;
    const dateIso = when ? new Date(when).toISOString() : '';
    const repName = visitDoc?.rep?.name || visitDoc?.repName || d.visit?.rep?.name || d.repName || '';
    const locName = visitDoc?.location?.name || d.location?.name || '';
    const addrObj = visitDoc?.location?.address || d.location?.address || null;
    const addr = addrObj ? [addrObj.street, addrObj.city, addrObj.state, addrObj.zip].filter(Boolean).join(', ') : '';
    const visitId = visitDoc?._id || d.visit?._id || d.visit || '';
    const deliveryId = d._id || '';
    const boxLabel = d.box?.label || '';
    const boxSize = d.box?.size || '';
    const outcome = visitDoc?.outcome || d.visit?.outcome || '';
    const note = (visitDoc?.note || d.visit?.note || '').replace(/\r?\n/g, ' ').trim();
    const deliveryTotal = Number(d.total || 0);

    if (Array.isArray(d.lines) && d.lines.length > 0) {
      d.lines.forEach(l => {
        const itemName = l.item?.name || '';
        const packaging = l.packaging || '';
        const qty = Number(l.quantity ?? 0);
        const unit = Number(l.unitPrice ?? 0);
        const lineTotal = Number(l.lineTotal ?? (qty * unit));
        rows.push([
          dateIso,
          locName,
          addr,
          repName,
          visitId,
          deliveryId,
          boxLabel,
          boxSize,
          itemName,
          packaging,
          String(qty),
          Number(unit).toFixed(2),
          Number(lineTotal).toFixed(2),
          Number(deliveryTotal).toFixed(2),
          outcome,
          note
        ]);
      });
    } else {
      // No lines — still emit a row so the delivery is represented
      rows.push([
        dateIso, locName, addr, repName, visitId, deliveryId, boxLabel, boxSize,
        '', '', '', '', '',
        Number(deliveryTotal).toFixed(2),
        outcome, note
      ]);
    }
  });

  return encodeCsv(rows);
}

export default function DeliveryVisitDetail() {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const [visitDoc, setVisitDoc] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  // Load the visit
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/visits/${visitId}`);
        if (!r.ok) throw new Error('Failed to load visit');
        const data = await r.json();
        const v = data?.visit ? data.visit : data;
        if (!v?._id) throw new Error('Visit not found');
        if (!cancelled) setVisitDoc(v);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  // Load deliveries for this visit (and client-filter as safeguard)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/deliveries?visit=${encodeURIComponent(visitId)}&limit=1000&page=1`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!r.ok) throw new Error('Failed to load deliveries for visit');
        const json = await r.json();
        const raw = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
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
    boxCount: rows.length
  }), [rows]);

 

  // Export button handler
  function exportVisitCsv() {
    if (!visitDoc) { alert('Visit not loaded'); return; }
    if (!rows || rows.length === 0) { alert('No deliveries for this visit'); return; }
    const csv = buildVisitLinesCsv(visitDoc, rows);
    const loc = visitDoc.location?.name ? visitDoc.location.name.replace(/\s+/g, '-') : 'location';
    const when = visitDoc.submittedAt || visitDoc.startedAt || visitDoc.createdAt;
    const datePart = when ? new Date(when).toISOString().slice(0,10) : 'date';
    const filename = `visit_${visitDoc._id}_${loc}_${datePart}.csv`;
    downloadTextFile(filename, csv);
  }

  if (err) return <div className="card" style={{ color:'red' }}>{err}</div>;
  if (!visitDoc) return <div className="card">Loading…</div>;

  const locName = visitDoc.location?.name || '—';
  const locAddr = fmtAddress(visitDoc.location?.address);
  const repName = visitDoc.rep?.name || visitDoc.repName || '—';
  const started = visitDoc.startedAt ? new Date(visitDoc.startedAt).toLocaleString() : '—';
  const submitted = visitDoc.submittedAt ? new Date(visitDoc.submittedAt).toLocaleString() : null;

  return (
    <div>
      {/* <div className="row" style={{ marginBottom: 12 }}>
        <div> <button className="btn" onClick={() => navigate(-1)}>← Back</button></div>
       
        <div style={{ marginLeft: 'auto', display:'flex', gap:8 }}>
          <button className="btn" onClick={exportVisitCsv}>Export Lines (CSV)</button>
        </div>

      </div> */}
       <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={()=>navigate(-1)}>← Back</button>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button className="btn" onClick={exportVisitCsv}>Export Lines (CSV)</button>
            <Link className="btn" to={`/visits/${visitId}/print`}>Print Summary</Link>
            {/* <Link className="btn" to={`/visits/${visitId}/edit`}>Edit visit</Link> */}
           
          </div>
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
                 <th>📦</th>
                 <th>🖊️</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const when = d.deliveredAt || d.createdAt;
                return (
                  <tr key={d._id} className='items-table'>
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
                    <td><Link to={`/deliveries/${d._id}`}>view box</Link></td>
                    <td><Link to={`/deliveries/${d._id}/edit`}>Edit</Link></td>
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



