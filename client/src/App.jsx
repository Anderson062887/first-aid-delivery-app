import { Routes, Route } from 'react-router-dom'
import MovedTo from './components/MovedTo.jsx'
import NavBar from './components/NavBar.jsx';
import Dashboard from './pages/Dashboard.jsx'
import RepHome from './pages/RepHome.jsx'
import LocationDetail from './pages/LocationDetail.jsx'
import Settings from './pages/settings/Settings.jsx'
import SettingsLocations from './pages/settings/SettingsLocations.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import Locations from './pages/Locations.jsx'
import Boxes from './pages/Boxes.jsx'
import Deliveries from './pages/Deliveries.jsx'
import NewDelivery from './pages/NewDelivery.jsx'
import Items from './pages/Items.jsx'
import ItemNew from './pages/ItemNew.jsx'
import ItemEdit from './pages/ItemEdit.jsx'
import Users from './pages/Users.jsx'
import UserNew from './pages/UserNew.jsx'
import LocationNew from './pages/LocationNew.jsx'
import LocationEdit from './pages/LocationEdit.jsx'
import VisitStart from './pages/VisitStart.jsx'
import Visit from './pages/Visit.jsx'
import DeliveryDetail from './pages/DeliveryDetail.jsx';
import DeliveryVisitDetail from './pages/DeliveryVisitDetail.jsx';
import DeliveryEdit from './pages/DeliveryEdit.jsx';
import VisitEdit from './pages/VisitEdit.jsx';
import VisitPrint from './pages/VisitPrint.jsx';
import OfflineQueue from './pages/OfflineQueue.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Reports from './pages/Reports.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SyncToast from './components/SyncToast.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import { useEffect } from 'react';
import { api } from '../src/api.js'
import { cacheItems, cacheLocations } from '../src/cache.js';
import OnlineSyncGate from './components/OnlineSyncGate.jsx';




// Admins start on the dashboard; reps start on their work for the day
function Home() {
  const { user } = useAuth();
  return (user?.roles || []).includes('admin') ? <Dashboard /> : <RepHome />;
}

export default function App(){

  useEffect(() => {
  let cancelled = false
  ;(async () => {
    try {
      const [items, locations] = await Promise.all([
        api.items.list().catch(()=>[]),
        api.locations.list().catch(()=>[])
      ])
      if (!cancelled) {
        cacheItems(Array.isArray(items) ? items : [])
        cacheLocations(Array.isArray(locations) ? locations : [])
      }
    } catch {}
  })()
  return () => { cancelled = true }
}, [])

  return (
    <ToastProvider>
    <ConfirmProvider>
      <NavBar />
      <OnlineSyncGate />
      <SyncToast />
      <div className="container">
        <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login/>} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<Home/>} />
                  <Route path="/dashboard" element={<Dashboard/>} />
                  <Route path="/locations" element={<Locations/>} />
                  <Route path="/locations/:id" element={<LocationDetail/>} />
                  <Route path="/boxes" element={<Boxes/>} />
                  <Route path="/deliveries" element={<Deliveries/>} />
                  <Route path="/deliveries/new" element={<NewDelivery/>} />
                  <Route path="/deliveries/:id" element={<DeliveryDetail />} />
                  <Route path="/deliveries/:id/edit" element={<DeliveryEdit/>} />
                  <Route path="/deliveries/visit/:visitId" element={<DeliveryVisitDetail/>} />
                  <Route path="/reports" element={<Reports/>} />

                  <Route element={<ProtectedRoute roles={['admin']} />}>
                      {/* Setup lives under Settings */}
                      <Route path="/settings" element={<Settings/>} />
                      <Route path="/settings/users" element={<Users/>} />
                      <Route path="/settings/users/new" element={<UserNew/>} />
                      <Route path="/settings/items" element={<Items/>} />
                      <Route path="/settings/items/new" element={<ItemNew/>} />
                      <Route path="/settings/items/:id/edit" element={<ItemEdit/>} />
                      <Route path="/settings/locations" element={<SettingsLocations/>} />
                      <Route path="/settings/locations/new" element={<LocationNew/>} />
                      <Route path="/settings/locations/:id/edit" element={<LocationEdit/>} />

                      {/* Old addresses (bookmarks) */}
                      <Route path="/users" element={<MovedTo to="/settings/users" />} />
                      <Route path="/users/new" element={<MovedTo to="/settings/users/new" />} />
                      <Route path="/items" element={<MovedTo to="/settings/items" />} />
                      <Route path="/items/new" element={<MovedTo to="/settings/items/new" />} />
                      <Route path="/items/:id/edit" element={<MovedTo to="/settings/items/:id/edit" />} />
                      <Route path="/locations/new" element={<MovedTo to="/settings/locations/new" />} />
                      <Route path="/locations/:id/edit" element={<MovedTo to="/settings/locations/:id/edit" />} />
                  </Route>
  
                  <Route path="/visits/start" element={<VisitStart/>} />
                  <Route path="/visits/:id" element={<Visit/>} />
                  <Route path="/visits/:id/edit" element={<VisitEdit/>} />
                  <Route path="/visits/:visitId/print" element={<VisitPrint/>} />
                  <Route path="/offline-queue" element={<OfflineQueue/>} />
                </Route>
        </Routes>
        </ErrorBoundary>
      </div>
    </ConfirmProvider>
    </ToastProvider>
  )
}



