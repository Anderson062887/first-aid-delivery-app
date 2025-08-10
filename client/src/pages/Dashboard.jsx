import { useEffect, useState } from 'react'
import { api } from '../api'
import { useLocation } from 'react-router-dom'
import Flash from '../components/Flash.jsx'

function useQuery(){ return new URLSearchParams(useLocation().search); }

export default function Dashboard(){
  const [ok, setOk] = useState(false)
  const q = useQuery()
  const done = q.get('done') // 'delivery' | 'visit' | null

  useEffect(() => { api.health().then(() => setOk(true)).catch(() => setOk(false)) }, [])

  return (
    <div className="card">
      <h2>Dashboard</h2>

      {done === 'delivery' && <Flash>Delivery recorded ✅</Flash>}
      {done === 'visit' && <Flash>Visit submitted ✅</Flash>}

      <p>API status: {ok ? '✅ Connected' : '❌ Offline'}</p>
      <p>Use the navigation to manage items, locations, boxes, visits, and deliveries.</p>
    </div>
  )
}

