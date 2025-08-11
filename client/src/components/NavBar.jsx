import { Link, NavLink } from 'react-router-dom'

export default function NavBar(){
  return (
    <header>
      <Link to="/"><strong>FirstAid Refill</strong></Link>
      <nav>
        <NavLink to="/items">Items</NavLink>
        <NavLink to="/items/new">New Item</NavLink>
        <NavLink to="/locations">Locations</NavLink>
        <NavLink to="/boxes">Boxes</NavLink>
        <NavLink to="/deliveries">Deliveries</NavLink>
        <NavLink to="/deliveries/new" className="btn">New Delivery</NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/users/new">New User</NavLink>
          <NavLink to="/locations/new">New Location</NavLink>
          {/* <NavLink to="/visits/start">Start Visit</NavLink> */}

      </nav>
    </header>
  )
}
