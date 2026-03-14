import React, { createContext, useContext, useState, useCallback } from 'react';

interface AdminState {
  token: string | null;
  username: string | null;
  displayName: string | null;
  isAdmin: boolean;
}

interface AdminContextType extends AdminState {
  login: (token: string, username: string, displayName: string) => void;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AdminState>(() => {
    const saved = sessionStorage.getItem('admin_auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...parsed, isAdmin: !!parsed.token };
      } catch {
        return { token: null, username: null, displayName: null, isAdmin: false };
      }
    }
    return { token: null, username: null, displayName: null, isAdmin: false };
  });

  const login = useCallback((token: string, username: string, displayName: string) => {
    const newState = { token, username, displayName, isAdmin: true };
    setState(newState);
    sessionStorage.setItem('admin_auth', JSON.stringify(newState));
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, username: null, displayName: null, isAdmin: false });
    sessionStorage.removeItem('admin_auth');
  }, []);

  return (
    <AdminContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
