
import { useMemo } from 'react';

/**
 * Props:
 *  - lines: [{ item: itemId, quantity: number, packaging: 'each'|'case', unitPrice?, lineTotal? }, ...]
 *  - items: full item list (array) OR itemsById map; we’ll accept either
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
    // Prefer provided unitPrice/lineTotal; fall back to catalog price
    const unitPrice = safeNum(l.unitPrice, safeNum(it.pricePerPack, 0));
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
      ):

       <table className="table">
           <thead>
             <tr>
               <th>Item</th><th>Pkg</th><th>Qty</th><th>Unit $</th><th>Total $</th><th></th>
             </tr>
           </thead>
          <tbody>
            {rows.map((l, idx) => (
              <tr key={idx}>
                 <td>{l.name}</td>
                 <td>{l.packaging}</td>
                <td>{l.qty}</td>
                <td>{l.unitPrice.toFixed(2)}</td>
                <td>{l.lineTotal.toFixed(2)}</td>
                 <td><button className="btn" onClick={()=>onRemove(idx)}>Remove</button></td>
               </tr>
            ))}
          </tbody>
        </table>

          }

      {rows.length > 0 && (
        <div style={{ textAlign:'right', fontWeight:600 }}>
          Subtotal: ${subtotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}














// export default function Cart({ lines, onRemove }){
//   const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
//   return (
//     <div className="card">
//       <h3>Cart</h3>
//       {lines.length === 0 ? <p>No items yet.</p> : (
//         <table className="table">
//           <thead>
//             <tr>
//               <th>Item</th><th>Pkg</th><th>Qty</th><th>Unit $</th><th>Total $</th><th></th>
//             </tr>
//           </thead>
//           <tbody>
//             {lines.map((l, idx) => (
//               <tr key={idx}>
//                 <td>{l.name}</td>
//                 <td>{l.packaging}</td>
//                 <td>{l.quantity}</td>
//                 <td>{l.unitPrice.toFixed(2)}</td>
//                 <td>{l.lineTotal.toFixed(2)}</td>
//                 <td><button className="btn" onClick={()=>onRemove(idx)}>Remove</button></td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       )}
//       <div className="flex" style={{justifyContent:'flex-end'}}>
//         <strong>Subtotal: ${subtotal.toFixed(2)}</strong>
//       </div>
//     </div>
//   )
// }



// // client/src/components/Cart.jsx
// import { useMemo } from 'react';

// /**
//  * Props:
//  *  - lines: [{ item: itemId, quantity: number, packaging: 'each'|'case', unitPrice?, lineTotal? }, ...]
//  *  - items: full item list (array) OR itemsById map; we’ll accept either
//  *  - onRemove?: (index) => void
//  */
// export default function Cart({ lines = [], items = [], onRemove }) {
//   // Normalize items param to a Map for lookups
//   const itemsById = useMemo(() => {
//     if (items instanceof Map) return items;
//     const m = new Map();
//     (items || []).forEach(i => m.set(i._id, i));
//     return m;
//   }, [items]);

//   // Safe helpers
//   const safeNum = (v, def = 0) => {
//     const n = Number(v);
//     return Number.isFinite(n) ? n : def;
//   };

//   const rows = (lines || []).map((l, idx) => {
//     const it = itemsById.get(l.item) || {};
//     const packaging = l.packaging || it.packaging || 'each';
//     // Prefer provided unitPrice/lineTotal; fall back to catalog price
//     const unitPrice = safeNum(l.unitPrice, safeNum(it.pricePerPack, 0));
//     const qty       = safeNum(l.quantity, 0);
//     const lineTotal = safeNum(l.lineTotal, unitPrice * qty);

//     return {
//       idx,
//       name: it.name || 'Item',
//       packaging,
//       qty,
//       unitPrice,
//       lineTotal,
//     };
//   });

//   const subtotal = rows.reduce((acc, r) => acc + r.lineTotal, 0);

//   return (
//     <div className="card" style={{ display:'grid', gap:8 }}>
//       <div style={{ fontWeight:600 }}>Lines</div>

//       {rows.length === 0 && (
//         <div style={{ opacity:.7 }}>No items added yet.</div>
//       )}

//       {rows.map(r => (
//         <div key={r.idx} className="row" style={{ alignItems:'center', flexWrap:'wrap' }}>
//           <div><strong>{r.name}</strong></div>
//           <div>{r.packaging}</div>
//           <div>Qty: {r.qty}</div>
//           <div>
//             @ ${r.unitPrice.toFixed(2)} = <strong>${r.lineTotal.toFixed(2)}</strong>
//           </div>
//           <div style={{ marginLeft:'auto' }}>
//             {onRemove && (
//               <button className="btn" onClick={() => onRemove(r.idx)}>Remove</button>
//             )}
//           </div>
//         </div>
//       ))}

//       {rows.length > 0 && (
//         <div style={{ textAlign:'right', fontWeight:600 }}>
//           Subtotal: ${subtotal.toFixed(2)}
//         </div>
//       )}
//     </div>
//   );
// }