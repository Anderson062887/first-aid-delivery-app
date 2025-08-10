import { useEffect, useState } from 'react'
import { api } from '../api'

export default function ItemPicker({ onAdd }){
  const [items, setItems] = useState([])
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState(1)

  const selected = items.find(i => i._id === itemId)
  const packaging = selected?.packaging || 'each'  // 'each' | 'case'
  const unitsPerPack = selected?.unitsPerPack || 1
  const pricePerPack = Number(selected?.pricePerPack || 0)

  useEffect(() => { api.items.list().then(setItems) }, [])

  function onQtyChange(e){
    const raw = e.target.value
    if (packaging === 'case') {
      // allow decimals, minimum 0.01 (you can change to step 0.25 if you prefer quarters)
      let v = Number(raw)
      if (!Number.isFinite(v) || v <= 0) v = 0.5
      setQty(v)
    } else {
      // 'each' -> integers only
      let v = parseInt(raw, 10)
      if (isNaN(v) || v < 1) v = 1
      setQty(v)
    }
  }

  function add(){
    if(!selected) return
    const quantity = packaging === 'case' ? Number(qty) : parseInt(qty, 10) || 1

    onAdd({
      itemId: selected._id,
      name: selected.name,
      packaging,                           // 'each' | 'case'
      unitPrice: pricePerPack,             // per each or per case based on item
      quantity,
      lineTotal: quantity * pricePerPack,  // backend will re-check & compute too
    })

    // reset for next add
    setQty(packaging === 'case' ? 0.5 : 1)
    setItemId('')
  }

  return (
    <div className="card">
      <div className="row">
        <div>
          <label>Item</label>
          <select className="input" value={itemId} onChange={e=>{ setItemId(e.target.value); setQty(1); }}>
            <option value="">Select an item…</option>
            {items.map(i => (
              <option key={i._id} value={i._id}>
                {i.name} — {i.packaging}{i.unitsPerPack>1?`(${i.unitsPerPack})`:''} — ${Number(i.pricePerPack).toFixed(2)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>
            Qty {packaging === 'case' ? '(cases, allows partial)' : '(each)'}
          </label>
          <input
            className="input"
            type="number"
            min={packaging === 'case' ? '0.01' : '1'}
            step={packaging === 'case' ? '0.25' : '1'}
            value={qty}
            onChange={onQtyChange}
            placeholder={packaging === 'case' ? 'e.g. 0.5' : 'e.g. 1'}
          />
          {packaging === 'case' && selected && (
            <small>
              {qty} case(s) ≈ {(Number(qty) * unitsPerPack).toFixed(2)} units • ${ (Number(qty) * pricePerPack).toFixed(2) }
            </small>
          )}
        </div>

        <div style={{alignSelf:'end'}}>
          <button className="btn primary" onClick={add} disabled={!itemId}>Add</button>
        </div>
      </div>
    </div>
  )
}
