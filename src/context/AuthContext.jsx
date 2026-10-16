import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(setUser).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credenciais) => {
    const u = await api.login(credenciais);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const marcarBoasVindasVisto = useCallback(async () => {
    setUser(await api.marcarBoasVindasVisto());
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, marcarBoasVindasVisto }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
