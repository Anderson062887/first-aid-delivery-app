import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const money = (n) => Number(n || 0).toFixed(2);
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const fmtAddress = (addr) => {
  if (!addr || typeof addr !== 'object') return '';
  const { street, city, state, zip } = addr;
  return [street, city, state, zip].filter(Boolean).join(', ');
};

// ---- Customize your company info here ----
const COMPANY = {
  name: 'Initiate Care.',
  phone: '646-755-3832',
  email: 'info@initiatecare.com',
  website: 'www.initiatecare.com',
  address: '131 Varick St suite 916 New York, NY 10013'
};

export default function VisitPrint() {
  const { visitId } = useParams();
  const nav = useNavigate();
  const [visit, setVisit] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [err, setErr] = useState('');

  // Load visit
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/visits/${visitId}`, { headers: { 'Cache-Control': 'no-cache' } });
        if (!r.ok) throw new Error('Failed to load visit');
        const data = await r.json();
        const v = data?.visit ? data.visit : data;
        if (!cancelled) setVisit(v);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  // Load deliveries for this visit
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/deliveries?visit=${encodeURIComponent(visitId)}&limit=1000&page=1`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!r.ok) throw new Error('Failed to load deliveries');
        const json = await r.json();
        const arr = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
        const onlyThis = arr.filter(d => (d.visit?._id || d.visit) === visitId);
        if (!cancelled) setDeliveries(onlyThis);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  const totals = useMemo(() => ({
    total: deliveries.reduce((s, d) => s + Number(d.total || 0), 0),
    boxes: deliveries.length
  }), [deliveries]);

  function doPrint() {
    window.print();
  }

  if (err) return <div className="card" style={{ color:'red' }}>{err}</div>;
  if (!visit) return <div className="card">Loading…</div>;

  const locName = visit.location?.name || '—';
  const locAddr = fmtAddress(visit.location?.address);
  const repName = visit.rep?.name || visit.repName || '—';

  return (
    <div className="print-page">
      {/* Actions (hidden on print) */}
      <div className="print-actions no-print" style={{ margin: '8px 0' }}>
        <button className="btn" onClick={() => nav(-1)}>← Back</button>
        <button className="btn primary" onClick={doPrint}>Print / Save PDF</button>
      </div>

      {/* Brand / company header */}
      <div className="card" style={{ display:'grid', gap:10 }}>
        <div className="print-header">
          <div className="print-brand">
            <div className="print-logo">
              {/* Put your logo at client/public/logo.png */}
              <img src="/logo.png" alt="Company logo" />
            </div>
            <div className="print-company">
              <div className="name">{COMPANY.name}</div>
              <div className="meta">{COMPANY.address}</div>
              <div className="meta">{COMPANY.phone} · {COMPANY.email} · {COMPANY.website}</div>
            </div>
          </div>

          <div className="print-meta" style={{ textAlign:'right' }}>
            <div><strong>Visit ID:</strong> {visit._id}</div>
            <div><strong>Date started:</strong> {fmt(visit.startedAt)}</div>
            {visit.submittedAt && <div><strong>Date submitted:</strong> {fmt(visit.submittedAt)}</div>}
            <div><strong>Rep:</strong> {repName}</div>
          </div>
        </div>

        <div><strong>Location:</strong> {locName}{locAddr ? ` — ${locAddr}` : ''}</div>
        <div><strong>Outcome:</strong> {visit.outcome ? visit.outcome.replace('_',' ') : '—'}</div>
        {visit.note && <div><strong>Note:</strong> {visit.note}</div>}

        <div style={{ marginTop:8 }}>
          <strong># Boxes:</strong> {totals.boxes} &nbsp; | &nbsp; <strong>Total:</strong> ${money(totals.total)}
        </div>
      </div>

      {/* Deliveries table */}
      <div className="card" style={{ marginTop:12 }}>
        <h3 style={{ marginTop:0 }}>Deliveries & Line Items</h3>
        {deliveries.length === 0 && <div>No deliveries yet.</div>}
        {deliveries.length > 0 && (
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width:160 }}>Date</th>
                <th style={{ width:160 }}>Box</th>
                <th>Line Items</th>
                <th style={{ width:120, textAlign:'right' }}>Delivery Total</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map(d => {
                const when = d.deliveredAt || d.createdAt;
                return (
                  <tr key={d._id}>
                    <td>{fmt(when)}</td>
                    <td>{d.box?.label || '—'}{d.box?.size ? ` (size: ${d.box.size})` : ''}</td>
                    <td>
                      {(d.lines || []).map((l,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                          <span>{l.item?.name || 'Item'} × {l.quantity} {l.packaging}</span>
                          <span>${money(l.unitPrice)} &nbsp;→&nbsp; ${money(l.lineTotal)}</span>
                        </div>
                      ))}
                    </td>
                    <td style={{ textAlign:'right' }}>${money(d.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="print-total">Grand Total: ${money(totals.total)}</div>
      </div>

      {/* Footer (prints on each page) */}
      <div className="print-footer">
        <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
          <div>
            <strong>{COMPANY.name}</strong> · {COMPANY.phone} · {COMPANY.email}
          </div>
          <div>
            {COMPANY.website} · {COMPANY.address}
          </div>
        </div>
      </div>
    </div>
  );
}

