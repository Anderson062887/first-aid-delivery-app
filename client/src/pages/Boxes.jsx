import { useEffect, useState } from 'react'
import { api } from '../api'

export default function Boxes(){
  const [location, setLocation] = useState('')
  const [locations, setLocations] = useState([])
  const [boxes, setBoxes] = useState([])

  useEffect(() => { api.locations.list().then(setLocations) }, [])
  useEffect(() => { api.boxes.list(location || undefined).then(setBoxes) }, [location])

  return (
    <div>
      <h2>Boxes</h2>
      <div className="card flex">
        <label>Filter by location</label>
        <select value={location} onChange={e=>setLocation(e.target.value)}>
          <option value="">All</option>
          {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
      </div>

      {boxes.map(b => (
        <div className="card" key={b._id}>
          <div className="flex" style={{justifyContent:'space-between'}}>
            <div>
              <strong>{b.label}</strong> — <em>{b.location?.name}</em> — <span>Size: {b.size}</span>
            </div>
            <small>{b.items?.length || 0} items</small>
          </div>
          <ul>
            {(b.items||[]).map((bi, i) => (
              <li key={i}>{bi.item?.name} {bi.par?`(par ${bi.par})`:''}</li>
            ))}
          </ul>
        </div>
      ))}

      {boxes.length === 0 && <p className="card">No boxes found.</p>}
    </div>
  )
}
