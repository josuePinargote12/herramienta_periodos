import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function RequireAuth({ children }) {
  // Obtiene el usuario validado por App mediante /me.
  const { user } = useAuth();

  // Si no hay sesión, no se muestran módulos privados y se va al login.
  // replace evita volver a la pantalla privada con el botón Atrás.
  if (!user) return <Navigate to="/login" replace />;

  // Si hay usuario, permite renderizar el sistema protegido.
  return children;
}
