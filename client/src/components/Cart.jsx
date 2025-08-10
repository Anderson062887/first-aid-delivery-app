export default function Cart({ lines, onRemove }){
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  return (
    <div className="card">
      <h3>Cart</h3>
      {lines.length === 0 ? <p>No items yet.</p> : (
        <table className="table">
          <thead>
            <tr>
              <th>Item</th><th>Pkg</th><th>Qty</th><th>Unit $</th><th>Total $</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td>{l.name}</td>
                <td>{l.packaging}</td>
                <td>{l.quantity}</td>
                <td>{l.unitPrice.toFixed(2)}</td>
                <td>{l.lineTotal.toFixed(2)}</td>
                <td><button className="btn" onClick={()=>onRemove(idx)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex" style={{justifyContent:'flex-end'}}>
        <strong>Subtotal: ${subtotal.toFixed(2)}</strong>
      </div>
    </div>
  )
}
