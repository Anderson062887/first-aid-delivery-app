import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx';

const Nav =()=>{
  const { user, logout } = useAuth();
  
   if(user.roles.includes("admin")){
    return(
      <nav style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <NavLink to="/items" className="btn">Items</NavLink>
        <NavLink to="/reports" className="btn">Reports</NavLink>
        {/* <NavLink to="/items/new" className="btn">New Item</NavLink> */}
        <NavLink to="/locations" className="btn">Locations</NavLink>
        <NavLink to="/boxes" className="btn">Boxes</NavLink>
        <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
        {/* <NavLink to="/deliveries/new" className="btn">New Delivery</NavLink> */}
        <NavLink to="/users" className="btn">Users</NavLink>
        <NavLink to="/users/new" className="btn">New User</NavLink>
        <NavLink to="/locations/new" className="btn">New Location</NavLink>
        
      </nav>
      )
  
   }else{
           return(
      <nav style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <NavLink to="/locations" className="btn">Locations</NavLink>
        <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
      </nav>
      )
   }

}

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header style={{ display:'flex', alignItems:'center', gap:12, padding:'var(--pad)', borderBottom:'1px solid #eee' }}>
      <Link to="/"><strong>FirstAid Refill</strong></Link>


      {/* push user info/logout to the right */}
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
        {user ? (
          <>
          <Nav />
            <span style={{ opacity:.8 }}>Hi, {user.name}</span>
            <button className="btn" onClick={logout}>Logout</button>
          </>
        ) : (
          <NavLink to="/login" className="btn">Login</NavLink>
        )}
      </div>
    </header>
  );
}





// export default function NavBar(){
//   return (
//     <header>
//       <Link to="/"><strong>FirstAid Refill</strong></Link>
//       <nav>
//         <NavLink to="/items" className="btn">Items</NavLink>
//         <NavLink to="/items/new" className="btn">New Item</NavLink>
//         <NavLink to="/locations" className="btn">Locations</NavLink>
//         <NavLink to="/boxes" className="btn">Boxes</NavLink>
//         <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
//         <NavLink to="/deliveries/new" className="btn">New Delivery</NavLink>
//           <NavLink to="/users" className="btn">Users</NavLink>
//           <NavLink to="/users/new" className="btn">New User</NavLink>
//           <NavLink to="/locations/new" className="btn">New Location</NavLink>
//           {/* <NavLink to="/visits/start">Start Visit</NavLink> */}

//       </nav>
//     </header>
//   )
// }
