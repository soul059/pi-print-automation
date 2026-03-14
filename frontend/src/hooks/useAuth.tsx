import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

interface AuthState {
  token: string | null;
  email: string | null;
  name: string | null;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, email: string, name: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const saved = localStorage.getItem('auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...parsed, isAuthenticated: !!parsed.token };
      } catch {
        return { token: null, email: null, name: null, isAuthenticated: false };
      }
    }
    return { token: null, email: null, name: null, isAuthenticated: false };
  });

  const login = useCallback((token: string, email: string, name: string) => {
    const newState = { token, email, name, isAuthenticated: true };
    setState(newState);
    localStorage.setItem('auth', JSON.stringify(newState));
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, email: null, name: null, isAuthenticated: false });
    localStorage.removeItem('auth');
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
