import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar.jsx';
import Dashboard from './pages/Dashboard.jsx'
import Locations from './pages/Locations.jsx'
import Boxes from './pages/Boxes.jsx'
import Deliveries from './pages/Deliveries.jsx'
import NewDelivery from './pages/NewDelivery.jsx'
import Items from './pages/Items.jsx'
import ItemNew from './pages/ItemNew.jsx'
import Users from './pages/Users.jsx'
import UserNew from './pages/UserNew.jsx'
import LocationNew from './pages/LocationNew.jsx'
import VisitStart from './pages/VisitStart.jsx'
import Visit from './pages/Visit.jsx'
import DeliveryDetail from './pages/DeliveryDetail.jsx';
import DeliveryVisitDetail from './pages/DeliveryVisitDetail.jsx';


export default function App(){
  return (
    <>
      <NavBar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard/>} />
          <Route path="/locations" element={<Locations/>} />
          <Route path="/boxes" element={<Boxes/>} />
          <Route path="/deliveries" element={<Deliveries/>} />
          <Route path="/deliveries/new" element={<NewDelivery/>} />
          <Route path="/deliveries/:id" element={<DeliveryDetail />} />
          <Route path="/deliveries/visit/:visitId" element={<DeliveryVisitDetail/>} />
          <Route path="/items" element={<Items/>} />
          <Route path="/items/new" element={<ItemNew/>} />
          <Route path="/users" element={<Users/>} />
          <Route path="/users/new" element={<UserNew/>} />
          <Route path="/locations/new" element={<LocationNew/>} />
          <Route path="/visits/start" element={<VisitStart/>} />
          <Route path="/visits/:id" element={<Visit/>} />
        </Routes>
      </div>
    </>
  )
}

