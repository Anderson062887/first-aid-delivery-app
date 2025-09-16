import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

function RoleNav() {
  const { user } = useAuth();
  if (!user) return null;

  const isAdmin = (user.roles || []).includes('admin');

  return (
    <>
      {isAdmin ? (
        <>
          <NavLink to="/items" className="btn">Items</NavLink>
          <NavLink to="/reports" className="btn">Reports</NavLink>
          <NavLink to="/locations" className="btn">Locations</NavLink>
          <NavLink to="/boxes" className="btn">Boxes</NavLink>
          <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
          <NavLink to="/users" className="btn">Users</NavLink>
          <NavLink to="/locations/new" className="btn">New Location</NavLink>
        </>
      ) : (
        <>
          <NavLink to="/locations" className="btn">Locations</NavLink>
          <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
        </>
      )}
    </>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  // Close mobile menu on route change
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  // Close mobile menu when resizing back to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 1024 && open) setOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  return (
    <header className="site-header">
      <div className="brand">
        <Link to="/" className="brand-link" aria-label="Home">
          <img src="/logo.png" alt="Company logo" />
  
        </Link>
      </div>

      <div className="header-right">
        {user ? (
          <>
            {/* Collapsible nav (sits on the right with user controls) */}
            <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary">
              <RoleNav />
            </nav>

            <span className="user-greet">Hi, {user.name}</span>
            <button className="btn logout" onClick={logout}>Logout</button>
          </>
        ) : (
          <NavLink to="/login" className="btn">Login</NavLink>
        )}

        {/* Hamburger */}
        {user && (
          <button
            className="nav-toggle"
            aria-label="Toggle navigation"
            aria-expanded={open ? 'true' : 'false'}
            onClick={() => setOpen(o => !o)}
          >
            <span className="bar" />
            <span className="bar" />
            <span className="bar" />
          </button>
        )}
      </div>
    </header>
  );
}





// import { Link, NavLink } from 'react-router-dom'
// import { useAuth } from '../auth/AuthContext.jsx';

// const Nav =()=>{
//   const { user, logout } = useAuth();
  
//    if(user.roles.includes("admin")){
//     return(
//       <nav style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
//         <NavLink to="/items" className="btn">Items</NavLink>
//         <NavLink to="/reports" className="btn">Reports</NavLink>
//         {/* <NavLink to="/items/new" className="btn">New Item</NavLink> */}
//         <NavLink to="/locations" className="btn">Locations</NavLink>
//         <NavLink to="/boxes" className="btn">Boxes</NavLink>
//         <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
//         {/* <NavLink to="/deliveries/new" className="btn">New Delivery</NavLink> */}
//         <NavLink to="/users" className="btn">Users</NavLink>
//         {/* <NavLink to="/users/new" className="btn">New User</NavLink> */}
//         <NavLink to="/locations/new" className="btn">New Location</NavLink>
        
//       </nav>
//       )
  
//    }else{
//            return(
//       <nav style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
//         <NavLink to="/locations" className="btn">Locations</NavLink>
//         <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
//       </nav>
//       )
//    }

// }

// export default function NavBar() {
//   const { user, logout } = useAuth();

//   return (
//     <header style={{ display:'flex', alignItems:'center', gap:12, padding:'var(--pad)', borderBottom:'1px solid #eee' }}>
//       <Link to="/"><strong>FirstAid Refill</strong></Link>


//       {/* push user info/logout to the right */}
//       <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
//         {user ? (
//           <>
//           <Nav />
//             <span style={{ opacity:.8 }}>Hi, {user.name}</span>
//             <button className="btn" onClick={logout}>Logout</button>
//           </>
//         ) : (
//           <NavLink to="/login" className="btn">Login</NavLink>
//         )}
//       </div>
//     </header>
//   );
// }





