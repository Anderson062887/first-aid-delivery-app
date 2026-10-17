import { useMemo } from 'react';

/**
 * Props:
 *  - lines: [{ item: itemId, quantity: number, packaging: 'each'|'case', unitPrice?, lineTotal? }, ...]
 *  - items: full item list (array) OR itemsById map; we'll accept either
 *  - onRemove?: (index) => void
 *  - onQtyChange?: (index, quantity) => void   (shows − / + buttons)
 */
export default function Cart({ lines = [], items = [], onRemove, onQtyChange }) {
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
    // Round per line to cents, the same way the server does
    const lineTotal = safeNum(l.lineTotal, Math.round(unitPrice * qty * 100) / 100);

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
    <div className="card stack-sm">
      <div className="strong">Items for this box</div>

      {rows.length === 0 ? (
        <div className="dim">No items added yet.</div>
      ) : (
        <ul className="cart-list">
          {rows.map((l) => (
            <li key={l.idx} className="cart-row">
              <div className="cart-name">
                <div className="strong">{l.name}</div>
                <div className="hint">
                  {l.packaging === 'case' ? 'Cases' : 'Single units'} · ${l.unitPrice.toFixed(2)} per {l.packaging === 'case' ? 'case' : 'unit'}
                </div>
              </div>
              <div className="cart-controls">
                {onQtyChange ? (
                  <span className="stepper">
                    <button type="button" className="btn" aria-label={`Fewer ${l.name}`}
                      onClick={() => onQtyChange(l.idx, Math.max(1, l.qty - 1))} disabled={l.qty <= 1}>−</button>
                    <span className="stepper-value" aria-live="polite">{l.qty}</span>
                    <button type="button" className="btn" aria-label={`More ${l.name}`}
                      onClick={() => onQtyChange(l.idx, l.qty + 1)}>+</button>
                  </span>
                ) : <span className="stepper-value">{l.qty}</span>}
                <span className="cart-total">${l.lineTotal.toFixed(2)}</span>
                {onRemove && (
                  <button type="button" className="btn danger cart-remove" onClick={() => onRemove(l.idx)} aria-label={`Remove ${l.name}`}>✕</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div style={{ textAlign:'right', fontWeight:600 }}>
          Subtotal: ${subtotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}
