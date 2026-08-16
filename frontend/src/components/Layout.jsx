import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #ccc' }}>
        <strong>Barber Shop Admin</strong>
        {user?.role === 'owner' && (
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/settings">Shop Settings</Link>
            <Link to="/barbers">Barbers</Link>
            <Link to="/services">Services</Link>
          </nav>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {user ? (
            <>
              {user.name} ({user.role}){' '}
              <button onClick={logout}>Log out</button>
            </>
          ) : null}
        </span>
      </header>
      <main style={{ padding: '1rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
