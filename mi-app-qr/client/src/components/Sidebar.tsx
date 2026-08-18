import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-border bg-background p-6">
      <div>
        <h1 className="mb-8 text-lg font-semibold text-foreground">Registro QR</h1>
        <nav className="space-y-1">
          <div className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
            Registros
          </div>
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
