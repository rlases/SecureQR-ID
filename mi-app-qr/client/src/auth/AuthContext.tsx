import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginRequest, User } from '@mi-app-qr/shared';
import * as apiClient from '../lib/apiClient';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(credentials: LoginRequest) {
    const res = await apiClient.login(credentials);
    setUser(res.user);
  }

  async function logout() {
    await apiClient.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
