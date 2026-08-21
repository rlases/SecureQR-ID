import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-border bg-background p-6">
      <div>
        <h1 className="mb-8 text-lg font-semibold text-foreground">Registro QR</h1>
        <nav className="space-y-1">
          <Link
            to="/"
            className={`block rounded-md px-3 py-2 text-sm font-medium ${
              location.pathname === '/' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
            }`}
          >
            Registros
          </Link>
          {user?.role === 'admin' && (
            <Link
              to="/usuarios"
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                location.pathname === '/usuarios' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
              }`}
            >
              Usuarios
            </Link>
          )}
        </nav>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{user?.username}</p>
        <Button variant="outline" className="w-full" onClick={() => logout()}>
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
