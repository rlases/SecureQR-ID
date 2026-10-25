import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { Sidebar } from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InformesPage from './pages/InformesPage';
import RegistrosPage from './pages/RegistrosPage';
import UsuariosPage from './pages/UsuariosPage';
import EstamentosPage from './pages/EstamentosPage';
import ConsultaCidPage from './pages/ConsultaCidPage';
import TitularesPage from './pages/TitularesPage';
import PortalPage from './pages/portal/PortalPage';
import AltaPage from './pages/portal/AltaPage';
import RecuperarPage from './pages/portal/RecuperarPage';

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40 lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Portal del titular (ADR-0016): sin sesión del personal, con la cookie del
                dispositivo. */}
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/portal/alta" element={<AltaPage />} />
            <Route path="/portal/recuperar" element={<RecuperarPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppLayout>
                    <DashboardPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/registros"
              element={
                <RequireAuth>
                  <AppLayout>
                    <RegistrosPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/informes"
              element={
                <RequireAuth>
                  <AppLayout>
                    <InformesPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequireAuth>
                  <AppLayout>
                    <UsuariosPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/estamentos"
              element={
                <RequireAuth>
                  <AppLayout>
                    <EstamentosPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/consultas"
              element={
                <RequireAuth>
                  <AppLayout>
                    <ConsultaCidPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/titulares"
              element={
                <RequireAuth>
                  <AppLayout>
                    <TitularesPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
