import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

const money = (n) => Number(n || 0).toFixed(2);

// Decide unit price from the selected item + packaging
function calcUnitPrice(itemDoc, packaging) {
  if (!itemDoc) return 0;
  const p = String(packaging || '').toLowerCase();
  // If packaging mentions case/box/pack -> use pricePerPack; otherwise use price (each)
  if (p.includes('case') || p.includes('box') || p.includes('pack')) {
    return Number(itemDoc.pricePerPack ?? itemDoc.price ?? 0);
  }
  return Number(itemDoc.price ?? itemDoc.pricePerPack ?? 0);
}

export default function DeliveryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [delivery, setDelivery] = useState(null);
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load delivery + items
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr('');
      setMsg('');
      try {
        // Load delivery (detail endpoint)
        const dRes = await fetch(`/api/deliveries/${id}`, { headers: { 'Cache-Control': 'no-cache' } });
        if (!dRes.ok) throw new Error(`Failed to load delivery (${dRes.status})`);
        const d = await dRes.json();
        if (cancelled) return;

        // Seed lines from delivery (unitPrice will be normalized later)
        const seeded = (d.lines || []).map((l) => ({
          item: l.item?._id || l.item || '',
          name: l.item?.name || '',
          quantity: Number(l.quantity || 0),
          packaging: l.packaging || '',
          unitPrice: Number(l.unitPrice || 0),
        }));
        setDelivery(d);
        setLines(seeded);

        // Load items for selects
        const iRes = await fetch('/api/items', { headers: { 'Cache-Control': 'no-cache' } });
        if (!iRes.ok) throw new Error(`Failed to load items (${iRes.status})`);
        const list = await iRes.json();
        if (cancelled) return;
        setItems(Array.isArray(list) ? list : []);

        // Normalize unitPrice based on catalog and packaging
        setLines((prev) =>
          prev.map((row) => {
            const it = list.find((x) => x._id === row.item);
            const up = calcUnitPrice(it, row.packaging);
            return { ...row, unitPrice: up };
          })
        );
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Helpers to edit lines
  const updateLine = (idx, patch) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const addLine = () =>
    setLines((ls) => [
      ...ls,
      { item: '', name: '', quantity: 1, packaging: 'each', unitPrice: 0 },
    ]);

  // Page total (recompute from current unitPrice)
  const pageTotal = lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0),
    0
  );

  // Save (PATCH) — server recomputes prices too
  async function save() {
    try {
      setSaving(true);
      setErr('');
      setMsg('');

      const payload = {
        lines: lines.map((l) => ({
          item: l.item,
          quantity: Number(l.quantity || 0),
          packaging: l.packaging || '',
          // omit unitPrice; let server compute authoritative values
        })),
      };

      const r = await fetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        // Try to read JSON error; if HTML came back, show a friendly message
        let eText = 'Failed to update delivery';
        try {
          const j = await r.json();
          eText = j?.error || eText;
        } catch {
          // keep default
        }
        throw new Error(eText);
      }

      const updated = await r.json();
      setMsg('Delivery updated.');
      // Go back to single delivery detail
      navigate(`/deliveries/${updated._id}?from=edit`);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card">Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Edit Delivery</h2>
        {delivery && (
          <>
            <div><strong>Location:</strong> {delivery.location?.name || '—'}</div>
            <div>
              <strong>Box:</strong> {delivery.box?.label || '—'}
              {delivery.box?.size ? ` (size: ${delivery.box.size})` : ''}
            </div>
          </>
        )}
        {err && <div style={{ color: 'red' }}>{err}</div>}
        {msg && <div style={{ color: 'green' }}>{msg}</div>}
      </div>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Lines</h3>
          <button className="btn" onClick={addLine}>+ Add line</button>
        </div>

        {lines.map((l, idx) => {
          const it = items.find((x) => x._id === l.item);
          // keep unitPrice in state, but make sure it follows item/packaging
          const unitPrice = calcUnitPrice(it, l.packaging);
          const lineTotal = Number(l.quantity || 0) * Number(unitPrice || 0);

          // If the computed unit price differs from stored, sync it
          if (Number(l.unitPrice) !== Number(unitPrice)) {
            // harmless async state sync on render; avoids stale price on screen
            setTimeout(() => {
              updateLine(idx, { unitPrice });
            }, 0);
          }

          return (
            <div key={idx} className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Item select */}
              <select
                className="input"
                value={l.item}
                onChange={(e) => {
                  const newItemId = e.target.value;
                  const nextItem = items.find((x) => x._id === newItemId);
                  const np = calcUnitPrice(nextItem, l.packaging);
                  updateLine(idx, {
                    item: newItemId,
                    name: nextItem?.name || '',
                    unitPrice: np,
                  });
                }}
              >
                <option value="">Select item…</option>
                {items.map((it) => (
                  <option key={it._id} value={it._id}>
                    {it.name}
                  </option>
                ))}
              </select>

              {/* Quantity */}
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={l.quantity}
                onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                placeholder="Qty"
                style={{ width: 110 }}
              />

              {/* Packaging */}
              <input
                className="input"
                value={l.packaging}
                onChange={(e) => {
                  const pkg = e.target.value;
                  const np = calcUnitPrice(it, pkg);
                  updateLine(idx, { packaging: pkg, unitPrice: np });
                }}
                placeholder="Packaging (e.g. each, case)"
                style={{ width: 200 }}
              />

              {/* Unit price (read-only display) */}
              <div  className="input" style={{ minWidth: 130 }}>@ ${money(unitPrice)}</div>

              {/* Line total */}
              <div>= ${money(lineTotal)}</div>

              <button className="btn" onClick={() => removeLine(idx)}>Remove</button>
            </div>
          );
        })}

        <div style={{ marginTop: 8, fontWeight: 600 }}>Total: ${money(pageTotal)}</div>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" disabled={saving} onClick={save}>
            Save changes
          </button>
          {delivery && <Link className="btn" to={`/deliveries/${delivery._id}?from=edit`}>Cancel</Link>}
        </div>
      </div>
    </div>
  );
}

