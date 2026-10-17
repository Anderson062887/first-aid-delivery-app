import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfirm } from './ConfirmContext.jsx';
import { useToast } from './ToastContext.jsx';
import { getQueueCount, getFailedCount, QUEUE_CHANGED } from '../offline';

function RoleNav() {
  const { user } = useAuth();
  if (!user) return null;

  const isAdmin = (user.roles || []).includes('admin');

  return (
    <>
      {isAdmin ? (
        <>
          <NavLink to="/" end className="btn">Dashboard</NavLink>
          <NavLink to="/locations" className="btn">Locations</NavLink>
          <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
          <NavLink to="/reports" className="btn">Reports</NavLink>
          <NavLink to="/settings" className="btn">Settings</NavLink>
          <QueueLink />
        </>
      ) : (
        <>
          <NavLink to="/" end className="btn">Home</NavLink>
          <NavLink to="/locations" className="btn">Locations</NavLink>
          <NavLink to="/deliveries" className="btn">Deliveries</NavLink>
          <QueueLink />
        </>
      )}
    </>
  );
}

// Offline Queue link with the number of changes not yet saved on the server
function QueueLink() {
  const [counts, setCounts] = useState(() => ({ waiting: getQueueCount(), failed: getFailedCount() }));
  useEffect(() => {
    const update = () => setCounts({ waiting: getQueueCount(), failed: getFailedCount() });
    window.addEventListener(QUEUE_CHANGED, update);
    window.addEventListener('storage', update); // other tabs
    return () => {
      window.removeEventListener(QUEUE_CHANGED, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const total = counts.waiting + counts.failed;
  return (
    <NavLink to="/offline-queue" className="btn" style={counts.failed ? { color: 'var(--danger)' } : undefined}>
      Offline Queue{total > 0 ? ` (${total})` : ''}
    </NavLink>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  async function onLogout() {
    const pending = getQueueCount() + getFailedCount();
    if (pending > 0 && !await confirm({
      title: 'Log out and lose unsynced changes?',
      message: `${pending} change${pending === 1 ? '' : 's'} on this device haven't synced yet. ` +
        `Logging out deletes them. Press Cancel to stay and sync first.`,
      confirmLabel: 'Log out anyway', danger: true
    })) return;
    try {
      await logout();
      // Plain /login: the next person should start at home, not on this user's page
      navigate('/login', { replace: true });
    } catch {
      toast.error("Couldn't reach the server to log out. Try again when you're online.");
    }
  }

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
            <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary">
              <RoleNav />
            </nav>

            <span className="user-greet">Hi, {user.name}</span>
            <button className="btn logout" onClick={onLogout}>Logout</button>
          </>
        ) : (
          loc.pathname !== '/login' && <NavLink to="/login" className="btn">Login</NavLink>
        )}

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
