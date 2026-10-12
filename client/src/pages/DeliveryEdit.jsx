import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

const money = (n) => Number(n || 0).toFixed(2);

// Get CSRF token from cookie
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// Decide unit price from the selected item + packaging (same rule as the server):
// a case costs pricePerPack, a single unit costs pricePerPack / unitsPerPack.
function calcUnitPrice(itemDoc, packaging) {
  if (!itemDoc) return 0;
  const packPrice = Number(itemDoc.pricePerPack) || 0;
  const unitsPerPack = Number(itemDoc.unitsPerPack) || 1;
  const p = String(packaging || itemDoc.packaging || 'each').toLowerCase().trim();
  return p === 'case' ? packPrice : packPrice / unitsPerPack;
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
        const dRes = await fetch(`/api/deliveries/${id}`, { credentials: 'include', headers: { 'Cache-Control': 'no-cache' } });
        if (!dRes.ok) throw new Error(`Failed to load delivery (${dRes.status})`);
        const d = await dRes.json();
        if (cancelled) return;

        // Seed lines from delivery (unitPrice will be normalized later)
        const seeded = (d.lines || []).map((l) => ({
          item: l.item?._id || l.item || '',
          name: l.item?.name || '',
          quantity: Number(l.quantity || 0),
          packaging: l.packaging === 'case' ? 'case' : 'each',
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

  // Page total (prices always follow the catalog item + packaging)
  const pageTotal = lines.reduce((s, l) => {
    const it = items.find((x) => x._id === l.item);
    return s + Number(l.quantity || 0) * calcUnitPrice(it, l.packaging);
  }, 0);

  // Catch obvious mistakes before calling the server
  function validate() {
    for (const [i, l] of lines.entries()) {
      const n = i + 1;
      if (!l.item) return `Line ${n}: select an item`;
      const q = Number(l.quantity);
      if (!Number.isFinite(q) || q <= 0) return `Line ${n}: quantity must be greater than 0`;
      if (l.packaging !== 'case' && !Number.isInteger(q)) return `Line ${n}: quantity must be a whole number for "each"`;
    }
    if (lines.length === 0) return 'A delivery needs at least one line';
    return '';
  }

  // Save (PATCH) — server recomputes prices too
  async function save() {
    const problem = validate();
    if (problem) { setErr(problem); setMsg(''); return; }
    try {
      setSaving(true);
      setErr('');
      setMsg('');

      const payload = {
        lines: lines.map((l) => ({
          item: l.item,
          quantity: Number(l.quantity || 0),
          packaging: l.packaging === 'case' ? 'case' : 'each',
          // omit unitPrice; let server compute authoritative values
        })),
      };

      const r = await fetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
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

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display:'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Lines</h3>
          <button className="btn" onClick={addLine}>+ Add line</button>
        </div>

        {lines.map((l, idx) => {
          const it = items.find((x) => x._id === l.item);
          // keep unitPrice in state, but make sure it follows item/packaging
          const unitPrice = calcUnitPrice(it, l.packaging);
          const lineTotal = Number(l.quantity || 0) * Number(unitPrice || 0);

          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 8,
                alignItems: 'center',
                padding: 10,
                border: '1px solid #eee',
                borderRadius: 8,
              }}
            >
              <select
                className="input"
                aria-label="Item"
                style={{ gridColumn: '1 / -1' }}
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
                {/* hide retired items, unless this line already uses one */}
                {items.filter((it) => it.active !== false || it._id === l.item).map((it) => (
                  <option key={it._id} value={it._id}>
                    {it.name}{it.active === false ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>

              <input
                className="input"
                aria-label="Quantity"
                type="number"
                step="0.01"
                min="0"
                value={l.quantity}
                onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                placeholder="Qty"
              />

              <select
                className="input"
                aria-label="Packaging"
                value={l.packaging === 'case' ? 'case' : 'each'}
                onChange={(e) => {
                  const pkg = e.target.value;
                  const np = calcUnitPrice(it, pkg);
                  updateLine(idx, { packaging: pkg, unitPrice: np });
                }}
              >
                <option value="each">Each</option>
                {/* same rule as ItemPicker: cases only for multi-unit packs (keep an existing 'case' line selectable) */}
                {((Number(it?.unitsPerPack) || 1) > 1 || l.packaging === 'case') && (
                  <option value="case">Case{it?.unitsPerPack > 1 ? ` (${it.unitsPerPack} units)` : ''}</option>
                )}
              </select>

              <div style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>@ ${money(unitPrice)}</div>
              <div style={{ padding: '8px 0', whiteSpace: 'nowrap', fontWeight: 600 }}>= ${money(lineTotal)}</div>

              <button className="btn" onClick={() => removeLine(idx)} style={{ gridColumn: '1 / -1' }}>
                Remove
              </button>
            </div>
          );
        })}

        <div style={{ marginTop: 8, fontWeight: 600 }}>Total: ${money(pageTotal)}</div>

        <div  style={{ gap: 8 }}>
          <button className="btn primary" disabled={saving} onClick={save} style={{marginRight:"20px"}}>
            Save changes
          </button>
          {delivery && <Link className="btn" to={`/deliveries/${delivery._id}?from=edit`}>Cancel</Link>}
        </div>
      </div>
    </div>
  );
}

