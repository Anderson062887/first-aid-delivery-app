import { useEffect, useState } from 'react'
import { api } from '../api'

export default function Locations(){
  const [list, setList] = useState([])
  useEffect(() => { api.locations.list().then(setList) }, [])
  return (
    <div>
      <h2>Locations</h2>
      {list.map(loc => (
        <div className="card" key={loc._id}>
          <strong>{loc.name}</strong>
          <div>{loc?.address?.street} {loc?.address?.city} {loc?.address?.state} {loc?.address?.zip}</div>
        </div>
      ))}
      {list.length === 0 && <p className="card">No locations yet.</p>}
    </div>
  )
}
