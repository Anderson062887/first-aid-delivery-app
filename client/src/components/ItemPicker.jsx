import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { isOnline } from '../offline';

export default function ItemPicker({ onAdd }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [itemId, setItemId] = useState('');
  const [packaging, setPackaging] = useState('each');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true); setErr('');
        const data = await api.items.list(); // offline-aware; returns cache when offline
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => items.find(i => i._id === itemId), [items, itemId]);

  function add() {
    if (!itemId) { alert('Pick an item'); return; }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) { alert('Enter a valid quantity'); return; }

    // Validate per-packaging
    const p = packaging || selected?.packaging || 'each';
    if (p === 'each' && !Number.isInteger(q)) {
      alert('Quantity for EACH must be a whole number.');
      return;
    }

    onAdd({
      item: itemId,
      packaging: p,
      quantity: q,
      // price is computed server-side; we don’t need it here
    });

    // reset
    setItemId('');
    setQty(1);
    setPackaging('each');
  }

  return (
    <div className="card" style={{ display:'grid', gap:8 }}>
      <div style={{ fontWeight:600 }}>Add item</div>

      {loading && <div>Loading items…</div>}
      {(!loading && items.length === 0) && (
        <div className="card" style={{ background:'#fffbe6', borderColor:'#ffe58f' }}>
          {isOnline()
            ? 'No items found.'
            : 'No cached items available offline. Open Items once while online to cache them.'}
        </div>
      )}
      {err && <div style={{ color:'red' }}>{err}</div>}

      <div className="row responsive-3">
        <div>
          <label>Item</label>
          <select className="input" value={itemId} onChange={e=>setItemId(e.target.value)} disabled={items.length===0}>
            <option value="">— Pick item —</option>
            {items.map(i => (
              <option key={i._id} value={i._id}>
                {i.name} {Number.isFinite(i.pricePerPack) ? `($${Number(i.pricePerPack).toFixed(2)}/${i.packaging || 'each'})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Packaging</label>
          <select className="input" value={packaging} onChange={e=>setPackaging(e.target.value)}>
            <option value="each">Each</option>
            <option value="case">Case (allows decimals)</option>
          </select>
        </div>

        <div>
          <label>Qty</label>
          <input
            className="input"
            type="number"
            step={packaging === 'case' ? '0.01' : '1'}
            min="0"
            value={qty}
            onChange={e=>setQty(e.target.value)}
          />
        </div>
      </div>

      <div>
        <button className="btn" onClick={add} disabled={items.length===0}>Add</button>
      </div>
    </div>
  );
}

