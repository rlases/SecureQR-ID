import { Link, useLocation } from 'react-router-dom';
import { ClipboardList, FileText, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';

const primaryItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/registros', label: 'Registros', icon: ClipboardList },
  { to: '/informes', label: 'Informes', icon: FileText },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex w-full flex-col justify-between border-b border-border bg-background p-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-6">
      <div>
        <div className="mb-4 flex items-center gap-3 lg:mb-8">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold text-foreground">Registro QR</h1>
        </div>
        <nav aria-label="Navegación principal" className="grid grid-cols-3 gap-1 lg:block lg:space-y-1">
          {primaryItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-0 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
          {user?.role === 'admin' && (
            <Link
              to="/usuarios"
              aria-current={location.pathname === '/usuarios' ? 'page' : undefined}
              className={`col-span-3 mt-1 flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:mt-0 lg:justify-start lg:gap-3 ${
                location.pathname === '/usuarios'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Users className="size-4" aria-hidden="true" />
              Usuarios
            </Link>
          )}
        </nav>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 lg:block lg:space-y-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{user?.username}</p>
        <Button variant="outline" className="shrink-0 lg:w-full" onClick={() => logout()}>
          <LogOut aria-hidden="true" />
          <span className="hidden sm:inline">Cerrar sesión</span>
          <span className="sr-only sm:hidden">Cerrar sesión</span>
        </Button>
      </div>
    </aside>
  );
}
