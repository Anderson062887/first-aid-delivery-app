import { useMemo } from 'react';

/**
 * Props:
 *  - lines: [{ item: itemId, quantity: number, packaging: 'each'|'case', unitPrice?, lineTotal? }, ...]
 *  - items: full item list (array) OR itemsById map; we'll accept either
 *  - onRemove?: (index) => void
 */
export default function Cart({ lines = [], items = [], onRemove }) {
  // Normalize items param to a Map for lookups
  const itemsById = useMemo(() => {
    if (items instanceof Map) return items;
    const m = new Map();
    (items || []).forEach(i => m.set(i._id, i));
    return m;
  }, [items]);

  // Safe helpers
  const safeNum = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  const rows = (lines || []).map((l, idx) => {
    const it = itemsById.get(l.item) || {};
    const packaging = l.packaging || it.packaging || 'each';

    // Calculate unit price based on packaging type
    let unitPrice;
    if (l.unitPrice !== undefined) {
      unitPrice = safeNum(l.unitPrice, 0);
    } else {
      const packPrice = safeNum(it.pricePerPack, 0);
      const unitsPerPack = safeNum(it.unitsPerPack, 1) || 1;
      // "each" = price per individual unit, "case" = full pack price
      unitPrice = packaging === 'each' ? packPrice / unitsPerPack : packPrice;
    }

    const qty       = safeNum(l.quantity, 0);
    const lineTotal = safeNum(l.lineTotal, unitPrice * qty);

    return {
      idx,
      name: it.name || 'Item',
      packaging,
      qty,
      unitPrice,
      lineTotal,
    };
  });

  const subtotal = rows.reduce((acc, r) => acc + r.lineTotal, 0);

  return (
    <div className="card" style={{ display:'grid', gap:8 }}>
      <div style={{ fontWeight:600 }}>Lines</div>

      {rows.length === 0 ? (
        <div style={{ opacity:.7 }}>No items added yet.</div>
      ) : (
        <table className="table items-table">
          <thead>
            <tr>
              <th>Item</th><th>Pkg</th><th>Qty</th><th>Unit $</th><th>Total $</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, idx) => (
              <tr key={idx}>
                <td data-label="Item">{l.name}</td>
                <td data-label="Pkg">{l.packaging}</td>
                <td data-label="Qty">{l.qty}</td>
                <td data-label="Unit $">{l.unitPrice.toFixed(2)}</td>
                <td data-label="Total $">{l.lineTotal.toFixed(2)}</td>
                <td><button className="btn" onClick={()=>onRemove(idx)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <div style={{ textAlign:'right', fontWeight:600 }}>
          Subtotal: ${subtotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}
