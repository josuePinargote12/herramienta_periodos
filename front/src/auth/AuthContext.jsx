import { createContext, useContext, useMemo, useState } from 'react';

// Contexto global de autenticación: evita pasar el usuario manualmente
// entre todos los componentes del sistema.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // user contiene los datos devueltos por /api/auth/me.
  const [user, setUser] = useState(null);
  // loading permite indicar que se está comprobando o cambiando la sesión.
  const [loading, setLoading] = useState(false);
  // Actualiza el usuario después de un login correcto.
  const login = (authenticatedUser) => setUser(authenticatedUser);
  // Limpia la sesión del frontend después de cerrar sesión.
  const logout = () => setUser(null);

  // Estos valores quedan disponibles para cualquier componente que use useAuth().
  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    setUser,
    setLoading,
    isAuthenticated: Boolean(user)
  }), [user, loading]);

  // Provider comparte el estado de sesión con toda la aplicación.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  // Evita usar el hook fuera de AuthProvider, donde no existiría el contexto.
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return context;
}
