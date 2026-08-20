// Punto de entrada del frontend: contiene la interfaz, el formulario de login,
// las llamadas al backend y las vistas principales de ContaMatic.
import { Fragment, useMemo, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import api, { getCsrfToken } from './api/client.js';

const ensureCsrfToken = async () => {
  return getCsrfToken();
};

const setBrowserPath = (path) => {
  if (window.location.pathname !== path) {
    window.history.replaceState({}, document.title, path);
  }
};

const clearLegacyAuthStorage = () => {
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  } catch {
    // Si el navegador bloquea el acceso, seguimos sin interrumpir la carga.
  }
};

const Icon = ({ name, size = 20 }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 14h.01"/></>,
    receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z"/><path d="M8 9h8M8 13h6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-3v-.09A1.7 1.7 0 0 0 10.7 18.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.06 14.7 1.7 1.7 0 0 0 5.5 13.67H5v-3h.5a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.73 4.45V4h3v.45A1.7 1.7 0 0 0 15.76 6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.05v3h-.05A1.7 1.7 0 0 0 19.4 15z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    history: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

const MONTHS = [
  { name: 'Enero', short: 'ENE' },
  { name: 'Febrero', short: 'FEB' },
  { name: 'Marzo', short: 'MAR' },
  { name: 'Abril', short: 'ABR' },
  { name: 'Mayo', short: 'MAY' },
  { name: 'Junio', short: 'JUN' },
  { name: 'Julio', short: 'JUL' },
  { name: 'Agosto', short: 'AGO' },
  { name: 'Septiembre', short: 'SEP' },
  { name: 'Octubre', short: 'OCT' },
  { name: 'Noviembre', short: 'NOV' },
  { name: 'Diciembre', short: 'DIC' }
];

// El impuesto a la renta es opcional y no participa en el cierre mensual.
const getPeriodStatus = (documents = {}) => {
  const required = ['financial', 'accounts', 'declarations'];
  const completed = required.filter(key => Boolean(documents[key])).length;
  if (completed === required.length) return 'Completado';
  if (completed > 0) return 'En proceso';
  return 'Pendiente';
};

const nav = [
  ['Clientes', 'users'],
  ['Dashboard', 'grid'],
  ['Periodos contables', 'calendar'],
  ['Estados financieros', 'file'],
  ['CxC y CxP', 'wallet'],
  ['Declaraciones', 'receipt']
];

const modulePermissions = {
  Dashboard: 'dashboard.read', Clientes: 'client.read', 'Periodos contables': 'period.read',
  'Estados financieros': 'document.read', 'CxC y CxP': 'document.read', Declaraciones: 'declaration.manage',
  Configuración: 'client.read'
};

function PermissionGate({ allowed, children }) {
  // Evita mostrar una vista al navegar directamente a una URL no autorizada.
  return allowed ? children : <section className="content"><div className="empty">No tienes permisos para consultar esta sección.</div></section>;
}


const modulePaths = {
  Dashboard: '/dashboard',
  Clientes: '/clientes',
  'Periodos contables': '/periodos-contables',
  'Estados financieros': '/estados-financieros',
  'CxC y CxP': '/cxc-cxp',
  Declaraciones: '/declaraciones',
  'Configuración': '/configuracion'
};

const pathToModule = Object.fromEntries(Object.entries(modulePaths).map(([name, path]) => [path, name]));

const FINANCIAL_DOCUMENTS = [
  ['balance', 'Estado de situación financiera (Balance general)', 'Activos, pasivos y patrimonio en una fecha determinada.'],
  ['results', 'Estado de resultados (Pérdidas y ganancias)', 'Ingresos, gastos y resultado del periodo.'],
  ['cashflow', 'Estado de flujos de efectivo', 'Origen y uso del efectivo durante el periodo.'],
  ['equity', 'Estado de cambios en el patrimonio', 'Movimientos del patrimonio de los socios o accionistas.'],
  ['notes', 'Notas a los estados financieros', 'Explicaciones y detalles de los cuatro estados anteriores.']
];

const PORTFOLIO_DOCUMENTS = [
  ['receivable', 'Cuentas por cobrar', 'Detalle de clientes y valores pendientes de cobro.'],
  ['payable', 'Cuentas por pagar', 'Detalle de proveedores y obligaciones pendientes de pago.']
];


function Login({ onLogin }) {
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [ssoName, setSsoName] = useState('');
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoExpired, setSsoExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLoginSession, setCheckingLoginSession] = useState(true);
  useEffect(() => {
    if (location.state?.sessionExpired) {
      setError('Sesión caducada. Inicia sesión nuevamente.');
      window.history.replaceState({}, document.title, '/login');
    }
  }, [location.state]);
  useEffect(() => {
    ensureCsrfToken().catch(() => {});
    api.get('/auth/me', { skipRefresh: true })
      .then(response => response.data)
      .then(data => {
        if (data?.ok && data.user) {
          onLogin(data.user);
        } else {
          setCheckingLoginSession(false);
        }
      })
      .catch(() => setCheckingLoginSession(false));

    const ssoStatus = new URLSearchParams(window.location.search).get('sso');
    if (ssoStatus === 'invalid') {
      setError('El enlace ya fue utilizado o caducó. Ingresa nuevamente tus credenciales.');
      setUsername('');
      setPassword('');
      setSsoMode(false);
      setSsoExpired(true);
      setBrowserPath('/login');
    } else {
      setBrowserPath('/login');
    }
    // El backend decide si existe una preautenticación válida.
    api.get('/auth/context')
      .then(response => response.data)
      .then(data => {
        if (data?.mode === 'password_only') {
          setSsoName(data.nombre || '');
          setSsoMode(true);
          setSsoExpired(false);
          return;
        }
        // Sin preautenticación se muestra el formulario completo.
        setSsoMode(false);
        setSsoExpired(false);
        setUsername('');
      })
      .catch(() => {
        // Si el backend no responde, se mantiene el formulario completo.
        setSsoMode(false);
        setUsername('');
      });
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    if ((!ssoMode && !username) || !password) {
      return setError(ssoMode ? 'La contraseña es obligatoria.' : 'Usuario y contrasena son obligatorios.');
    }
    setLoading(true);
    try {
      const loginData = ssoMode ? { password, ssoAttempt: true } : { username, password, ssoAttempt: false };
      const response = await api.post('/auth/login', loginData, { skipRefresh: true });
      const data = response.data;
      if (data.requiresCredentials) {
        setSsoMode(false);
        setSsoExpired(true);
        setUsername('');
        setPassword('');
      }
      // En los dos primeros errores se conserva el SSO y solo se limpia la contraseña.
      if (!data.ok && !data.requiresCredentials && ssoMode) setPassword('');
      if (!data.ok) throw new Error(data.error || 'No se pudo iniciar sesion.');
      onLogin(data.user);
    } catch (requestError) {
      const responseData = requestError?.response?.data;
      if (responseData?.requiresCredentials) {
        setSsoMode(false);
        setSsoExpired(true);
        setUsername('');
        setPassword('');
      }
      const apiError = requestError?.response?.data?.error;
      setError(apiError || (requestError instanceof Error ? requestError.message : 'Error de conexion con el servidor.'));
    } finally {
      setLoading(false);
    }
    /* legacy login removed
    else setError('Ingresa tu contraseña para continuar.');
    */
  };
  if (checkingLoginSession) return <main className="login-page"></main>;

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="logo-mark">C</div>
        <h1>Conta<span>Matic</span></h1>
        <p>Control contable claro, puntual y en un solo lugar.</p>
        <div className="brand-card">
          <Icon name="shield" size={30}/>
          <div>
            <strong>Información siempre segura</strong>
            <small>Roles, trazabilidad y documentos protegidos.</small>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="mobile-logo">
            <div className="logo-mark">C</div> Conta<span>Matic</span>
          </div>
          <h2>Confirma tu acceso</h2>
          {!ssoMode && <label>Usuario<input type="text" autoFocus placeholder="usuario" value={username} onChange={e => setUsername(e.target.value)} /></label>}
          {ssoMode && !ssoExpired && <p>Bienvenido, {ssoName || 'usuario'}.</p>}
          <label>
            Contraseña
            <div className="password">
              <input type="password" autoFocus placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
              <Icon name="lock" size={17}/>
            </div>
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary login-btn">Continuar <Icon name="arrow" size={18}/></button>
          <div className="demo">El usuario se valida desde el enlace de acceso seguro.</div>
        </form>
      </section>
    </main>
  );
}

function App() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('2026');
  const [availableYears, setAvailableYears] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientToDisable, setClientToDisable] = useState(null);
  const [clientList, setClientList] = useState([]);
  const [disabledClients, setDisabledClients] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [allPeriods, setAllPeriods] = useState([]);
  const [periodRecords, setPeriodRecords] = useState([]);
  // Cliente seleccionado en el filtro global. Solo se utiliza para el rol CONTADOR.
  const [globalClientRuc, setGlobalClientRuc] = useState(() => {
    try { return sessionStorage.getItem('contamatic.globalClientRuc') || ''; } catch { return ''; }
  });
  const userName = user?.nombre || user?.name || 'Usuario';
  const userReference = user?.ID || '';
  // Indicador temporal para comprobar visualmente el rol recibido desde el backend.
  const userRole = String(user?.role || 'SIN ROL').toUpperCase();
  const isGlobalClientFilterEnabled = userRole === 'CONTADOR';
  const can = permission => Array.isArray(user?.permissions) && user.permissions.includes(permission);
  const visibleNav = nav.filter(([label]) => can(modulePermissions[label]));
  const userInitials = userName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const globalClient = isGlobalClientFilterEnabled
    ? clientList.find(client => String(client.ruc) === String(globalClientRuc))
    : null;
  useEffect(() => {
    if (!isGlobalClientFilterEnabled) {
      setGlobalClientRuc('');
      return;
    }
    try {
      if (globalClientRuc) sessionStorage.setItem('contamatic.globalClientRuc', globalClientRuc);
      else sessionStorage.removeItem('contamatic.globalClientRuc');
    } catch {
      // La selección sigue funcionando aunque el navegador bloquee sessionStorage.
    }
  }, [globalClientRuc, isGlobalClientFilterEnabled]);

  useEffect(() => {
    // Si el cliente dejó de estar disponible, se limpia el filtro para no dejar
    // a los módulos apuntando a un cliente inexistente.
    if (globalClientRuc && !clientList.some(client => String(client.ruc) === String(globalClientRuc))) {
      setGlobalClientRuc('');
    }
  }, [clientList, globalClientRuc]);

  useEffect(() => {
    if (userRole !== 'ADMIN') { setAssignableUsers([]); return; }
    api.get('/auth/assignable-users').then(({ data }) => setAssignableUsers(data.data || [])).catch(() => setAssignableUsers([]));
  }, [userRole]);

  // Carga los permisos reales del backend; no se mantienen permisos en el bundle.
  useEffect(() => {
    if (!user || Array.isArray(user.permissions)) return;
    api.get('/auth/permissions').then(({ data }) => {
      setUser(current => current ? { ...current, permissions: data.permissions || [] } : current);
    }).catch(() => setUser(current => current ? { ...current, permissions: [] } : current));
  }, [user, setUser]);

  // Cuando accessToken y refreshToken caducan, cerrar sesión completamente.
  useEffect(() => {
    const handleSessionExpired = async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        // El estado local se limpia aunque el backend no responda.
      }
      setUser(null);
      navigate('/login', { replace: true, state: { sessionExpired: true } });
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, [navigate, setUser]);

  // La URL es la única fuente de verdad de la sección activa.
  const active = pathToModule[location.pathname] || 'Dashboard';

  useEffect(() => {
    clearLegacyAuthStorage();
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get('/clients').then(({ data }) => setClientList(data.data || [])).catch(() => setClientList([]));
    api.get('/clients/disabled').then(({ data }) => setDisabledClients(data.data || [])).catch(() => setDisabledClients([]));
  }, [user]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        // La entrada inicial (/, normalmente desde el enlace SSO) muestra
        // primero el formulario. No se debe consultar /me hasta autenticarse.
        const initialLoginEntry = window.location.pathname === '/' || window.location.pathname === '/login';
        if (initialLoginEntry) {
          setCheckingSession(false);
          return;
        }

        const meResponse = await api.get('/auth/me');
        const data = meResponse.data;
        if (data?.ok && data.user) {
          setUser(data.user);
          navigate('/clientes', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setCheckingSession(false);
      }
    };

    loadSession();
  }, []);

  // Revalidar al volver con Atrás/Adelante o desde la caché del navegador.
  useEffect(() => {
    const revalidateSession = (event) => {
      // En una recarga normal ya se ejecuta loadSession; pageshow solo debe
      // revalidar cuando el navegador restaura la página desde BFCache.
      if (!event.persisted) return;
      if (window.location.pathname === '/login' || window.location.pathname === '/') return;
      api.get('/auth/me')
        .then(response => {
          const data = response.data;
          if (!data?.ok || !data.user) throw new Error('session-expired');
          setUser(data.user);
        })
        .catch(() => {
          setUser(null);
          navigate('/login', { replace: true });
        });
    };

    window.addEventListener('pageshow', revalidateSession);
    return () => window.removeEventListener('pageshow', revalidateSession);
  }, []);

  useEffect(() => {
    if (!user || !clientList.length) return;
    api.get('/periods', { params: { year } })
      .then(({ data }) => {
        const nextPeriods = data.data || [];
        setPeriods(nextPeriods);
        setAvailableYears(current => Array.from(new Set([...current, ...nextPeriods.map(period => String(period.year))])).sort((a, b) => Number(b) - Number(a)));
      })
      .catch(() => setPeriods([]));
  }, [year, clientList]);

  useEffect(() => {
    if (!user || !clientList.length) return;
    api.get('/periods')
      .then(({ data }) => {
        const nextPeriods = data.data || [];
        setAllPeriods(nextPeriods);
        setAvailableYears(current => Array.from(new Set([...current, ...nextPeriods.map(period => String(period.year))])).sort((a, b) => Number(b) - Number(a)));
      })
      .catch(() => setAllPeriods([]));
  }, [user, clientList]);

  const clientsWithDynamicProgress = useMemo(() => {
    return clientList.map(c => {
      const clientPeriods = periods.filter(p => p.clientRuc === c.ruc && p.year === String(year));
      const total = clientPeriods.length || 12;
      const completed = clientPeriods.filter(p => p.status === 'Completado').length;
      const pct = Math.round((completed / total) * 100);
      let status = 'En proceso';
      let tone = 'blue';
      if (pct === 100) { status = 'Completado'; tone = 'green'; }
      else if (pct >= 80) { status = 'Al día'; tone = 'green'; }
      else if (pct < 50) { status = 'Pendiente'; tone = 'orange'; }

      return {
        ...c,
        progress: pct,
        status,
        tone,
        tasks: `${completed} de ${total}`
      };
    });
  }, [clientList, periods, year]);

  // Cuando hay filtro, todos los módulos reciben únicamente el cliente elegido.
  const clientsForModules = globalClient
    ? clientsWithDynamicProgress.filter(client => String(client.ruc) === String(globalClient.ruc))
    : clientsWithDynamicProgress;

  const generalPeriodTotals = useMemo(() => {
    // El resumen respeta el año y, si existe, el cliente del filtro global.
    const scopedPeriods = allPeriods.filter(period =>
      String(period.year) === String(year) &&
      (!globalClient || String(period.clientRuc) === String(globalClient.ruc))
    );
    const completed = scopedPeriods.filter(period => period.status === 'Completado').length;
    const total = scopedPeriods.length;
    return { completed, total, pending: Math.max(total - completed, 0), compliance: total ? Math.round((completed / total) * 100) : 0 };
  }, [allPeriods, year, globalClient]);

  const filtered = useMemo(() => {
    return clientsWithDynamicProgress.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || c.ruc.includes(search)
    );
  }, [search, clientsWithDynamicProgress]);
  const filteredForModules = useMemo(() => clientsForModules.filter(client =>
    client.name.toLowerCase().includes(search.toLowerCase()) || client.ruc.includes(search)
  ), [search, clientsForModules]);

  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (client) => {
    setEditingClient(client);
    setShowModal(true);
  };

  const deleteClient = async (client) => {
    try {
      await api.delete(`/clients/${client.id}`);
      const disabledClient = {
        ...client,
        disabledAt: new Date().toISOString(),
        disabledBy: user?.ID || user?.codigo || null
      };
      setClientList(current => current.filter(item => item.id !== client.id));
      setDisabledClients(current => [disabledClient, ...current.filter(item => item.id !== client.id)]);
      setPeriods(current => current.filter(period => period.clientRuc !== client.ruc));
      setPeriodRecords(current => current.filter(record => record.clientRuc !== client.ruc));
      setClientToDisable(null);
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo deshabilitar el cliente.');
    }
  };

  const saveClient = async (clientData) => {
    if (!editingClient) {
      const { data } = await api.post('/clients', clientData);
      const newClient = { ...data.data, progress: 0, status: 'Pendiente', tone: 'orange', tasks: '0 de 12' };
      setClientList(current => [newClient, ...current]);
      setShowModal(false);
      setEditingClient(null);
      return;
    }
    if (editingClient) {
      const { data } = await api.put(`/clients/${editingClient.id}`, clientData);
      const updatedClient = data.data;
      setClientList(current => current.map(c => c.id === editingClient.id ? { ...c, ...updatedClient } : c));
      setPeriods(current => current.map(p => p.clientRuc === editingClient.ruc ? { ...p, clientName: clientData.name } : p));
    }
    setShowModal(false);
    setEditingClient(null);
  };

  const handleUpdatePeriodStatus = async (periodId, newStatus) => {
    try {
      const { data } = await api.patch(`/periods/${periodId}`, { status: newStatus });
      setPeriods(current => current.map(p => p.id === periodId ? data.data : p));
    } catch {
      // El estado visual se conserva si el servidor rechaza la actualización.
    }
  };

  const handleCreateFiscalYear = async (targetYear, clientId, frequency) => {
    try {
      if (!clientId) return alert('Selecciona un cliente válido.');
      const { data } = await api.post('/periods/years', { year: Number(targetYear), clientId, frequency: 'Mensual' });
      setPeriods(data.data || []);
      setAvailableYears(current => Array.from(new Set([String(targetYear), ...current])).sort((a, b) => b - a));
      setYear(String(targetYear));
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo aperturar el año fiscal.');
      throw error;
    }
  };

  const refreshPeriodsForYear = async targetYear => {
    const { data } = await api.get('/periods', { params: { year: String(targetYear) } });
    const nextPeriods = data.data || [];
    setPeriods(current => [
      ...current.filter(period => String(period.year) !== String(targetYear)),
      ...nextPeriods
    ]);
    const allResponse = await api.get('/periods');
    setAllPeriods(allResponse.data.data || []);
  };

  const restoreClient = async (client) => {
    try {
      await api.patch(`/clients/${client.id}/restore`);
      const { data } = await api.get('/clients');
      setClientList(data.data || []);
      setDisabledClients(current => current.filter(item => item.id !== client.id));
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo reactivar el cliente.');
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Aunque el backend no responda, se limpia la sesión local.
    }
    setSearch('');
    setShowModal(false);
    setEditingClient(null);
    setUser(null);
    // Reemplaza la entrada actual para no volver al dashboard con Atrás.
    navigate('/login', { replace: true });
  };

  const handleNavigation = (label) => {
    navigate(modulePaths[label] || '/dashboard');
  };

  if (checkingSession) return <main className="login-page"></main>;
  const handleLoginSuccess = async (authenticatedUser) => {
    // Confirmar la sesión usando la cookie accessToken recién creada.
    try {
      const meResponse = await api.get('/auth/me');
      setUser(meResponse.data?.user || authenticatedUser);
    } catch {
      setUser(authenticatedUser);
    }
    navigate('/clientes', { replace: true });
  };

  if (!user) return <Login onLogin={handleLoginSuccess} />;

  return (
    <RequireAuth>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-mark">C</div>
          <span>Conta<span>Matic</span></span>
        </div>
        <div className="workspace">OFICINA CONTABLE</div>
        <nav>
          {visibleNav.map(([label, icon]) => (
            <button key={label} className={active === label ? 'active' : ''} onClick={() => handleNavigation(label)}>
              <Icon name={icon}/>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button onClick={() => handleNavigation('Configuración')}>
            <Icon name="settings"/>
            <span>Configuración</span>
          </button>
          <div className="user-mini">
            <div className="avatar">{userInitials}</div>
            <div>
              <strong>{userName}</strong>
              <small>{userReference}</small>
            </div>
            <button className="logout" onClick={handleLogout} title="Cerrar sesión">↪</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header>
          <div className="crumb">
            <span>Vista general</span>
            <h1>{active} · {userRole}</h1>
          </div>
          <div className="header-actions">
            {isGlobalClientFilterEnabled && <label className="global-client-filter">
              <span>Cliente general</span>
              <select value={globalClientRuc} onChange={event => setGlobalClientRuc(event.target.value)}>
                <option value="">Todos los clientes</option>
                {clientList.map(client => <option key={client.ruc} value={client.ruc}>{client.name} · {client.ruc}</option>)}
              </select>
              {globalClient && <button type="button" className="clear-global-client" onClick={() => setGlobalClientRuc('')} title="Quitar filtro de cliente">×</button>}
            </label>}
            <div className="avatar">{userInitials}</div>
          </div>
        </header>

        {/* React Router decide qué módulo mostrar según la URL actual. */}
        <Routes>
          {/* Cada Route relaciona una dirección con un componente. */}
          <Route path="/dashboard" element={<PermissionGate allowed={can('dashboard.read')}><Dashboard search={search} setSearch={setSearch} clients={clientsForModules} generalTotals={generalPeriodTotals} setShowModal={handleOpenCreateModal} canCreateClient={can('client.create')} isAdmin={userRole === 'ADMIN'} year={year} availableYears={availableYears} globalClientRuc={globalClientRuc}/></PermissionGate>} />
          <Route path="/clientes" element={<PermissionGate allowed={can('client.read')}><ClientsModule clients={filteredForModules} search={search} setSearch={setSearch} onOpenCreate={handleOpenCreateModal} onEditClient={handleOpenEditModal} onDeleteClient={setClientToDisable} isAdmin={userRole === 'ADMIN'} year={year} /></PermissionGate>} />
          <Route path="/periodos-contables" element={<PermissionGate allowed={can('period.read')}><PeriodsModule clients={clientsForModules} periods={periods} year={year} setYear={setYear} availableYears={availableYears} onUpdateStatus={handleUpdatePeriodStatus} onCreateYear={handleCreateFiscalYear} onRefreshYear={refreshPeriodsForYear} periodRecords={periodRecords} onUpdateRecord={record => { setPeriodRecords(current => current.map(item => item.id === record.id ? record : item)); setPeriods(current => current.map(item => item.id === record.id ? record : item)); }} isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />
          <Route path="/configuracion" element={<PermissionGate allowed={can('client.read')}><ConfigurationModule clients={disabledClients} onRestore={restoreClient} canAudit={can('audit.read')} userRole={userRole} /></PermissionGate>} />
          <Route path="/estados-financieros" element={<PermissionGate allowed={can('document.read')}><FinancialStatementsModule clients={clientsForModules} year={year} isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />
          <Route path="/cxc-cxp" element={<PermissionGate allowed={can('document.read')}><FinancialStatementsModule clients={clientsForModules} year={year} documentGroup="Portfolio" moduleTitle="Cuentas por Cobrar y Pagar" clientActionLabel="Ver cartera" moduleRoute="/cxc-cxp" isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />
          <Route path="/declaraciones" element={<PermissionGate allowed={can('declaration.manage')}><DeclarationsPage clients={clientsForModules} year={year} isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />
          {/* Cualquier URL desconocida vuelve al dashboard. */}
          <Route path="*" element={<Navigate to="/clientes" replace />} />
        </Routes>
      </main>

      {showModal && (
        <ClientModal 
          onClose={() => { setShowModal(false); setEditingClient(null); }} 
          onSave={saveClient}
          clientToEdit={editingClient}
          isAdmin={userRole === 'ADMIN'}
          assignableUsers={assignableUsers}
        />
      )}
      {clientToDisable && (
        <DisableClientModal
          client={clientToDisable}
          onClose={() => setClientToDisable(null)}
          onConfirm={() => deleteClient(clientToDisable)}
        />
      )}
    </div>
    </RequireAuth>
  );
}

function Dashboard({ search, setSearch, clients, generalTotals = { completed: 0, total: 0, pending: 0, compliance: 0 }, setShowModal, canCreateClient = false, isAdmin = false, year, availableYears = [], globalClientRuc = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedAssignedUser, setSelectedAssignedUser] = useState('');
  const assignedUsers = useMemo(() => Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort(), [clients]);
  const selectedUserClients = useMemo(() => selectedAssignedUser ? clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedAssignedUser) : [], [clients, selectedAssignedUser]);
  const [selectedClientDashboard, setSelectedClientDashboard] = useState(null);
  const [clientDashboard, setClientDashboard] = useState(null);
  const [loadingClientDashboard, setLoadingClientDashboard] = useState(false);
  const [dashboardYear, setDashboardYear] = useState('');
  const [readAlerts, setReadAlerts] = useState(new Set());
  const [incomeTaxPeriodicity, setIncomeTaxPeriodicity] = useState('Anual');
  const clientDashboardRef = useRef(null);
  const totalCompleted = generalTotals.completed;
  const totalPeriodsCount = generalTotals.total;
  const compliancePct = generalTotals.compliance;
  const authenticatedName = user?.nombre || user?.name || user?.username || 'Usuario';

  // El detalle del dashboard debe iniciar con el año global seleccionado.
  useEffect(() => {
    if (!dashboardYear && year) setDashboardYear(String(year));
  }, [year, dashboardYear]);

  useEffect(() => {
    if (!selectedClientDashboard?.id || !dashboardYear) return;
    api.get(`/clients/${selectedClientDashboard.id}/income-tax/${dashboardYear}`)
      .then(({ data }) => setIncomeTaxPeriodicity(data.data?.configuration?.periodicity || 'Anual'))
      .catch(() => setIncomeTaxPeriodicity('Anual'));
  }, [selectedClientDashboard?.id, dashboardYear]);

  useEffect(() => {
    if (!selectedClientDashboard) return;
    const timer = window.setTimeout(() => clientDashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => window.clearTimeout(timer);
  }, [selectedClientDashboard]);

  const displayClientDashboard = useMemo(() => {
    if (!clientDashboard || incomeTaxPeriodicity !== 'Anual') return clientDashboard;
    const months = (clientDashboard.months || []).map(month => {
      const indicators = Object.fromEntries(Object.entries(month.indicators).filter(([key]) => key !== 'incomeTax'));
      const applicable = Object.values(indicators).filter(item => item.status !== 'no_aplica');
      const completed = applicable.filter(item => ['entregado', 'declarado', 'calculado'].includes(item.status)).length;
      return { ...month, compliancePercentage: applicable.length ? Math.round(completed / applicable.length * 100) : 100 };
    });
    const alerts = (clientDashboard.alerts || []).filter(alert => alert.indicator !== 'incomeTax');
    return { ...clientDashboard, months, alerts, summary: { ...clientDashboard.summary, compliancePercentage: months.length ? Math.round(months.reduce((sum, month) => sum + month.compliancePercentage, 0) / months.length) : 0, pendingAlerts: alerts.length } };
  }, [clientDashboard, incomeTaxPeriodicity]);

  const openClientDashboard = async client => {
    setSelectedClientDashboard(client);
    setClientDashboard(null);
    const selectedYear = dashboardYear || String(year);
    if (!selectedYear) return;
    setLoadingClientDashboard(true);
    try {
      const { data } = await api.get(`/dashboard/client/${client.id}`, { params: { year: selectedYear } });
       const dashboard = data.data;
        setClientDashboard(dashboard || null);
    } catch {
      setClientDashboard(null);
    } finally {
      setLoadingClientDashboard(false);
    }
  };

  /* Datos de demostración eliminados: el dashboard solo muestra información persistida. */
  /*
    const demoMonths = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio'].map((month, index) => {
      const financial = index !== 2;
      const portfolio = index === 0 || index === 1 || index === 4;
      const iva = index !== 3;
      const retentions = index === 0 || index === 2 || index === 5;
      const incomeTax = index === 0 ? 'calculado' : index === 1 ? 'pendiente' : 'no_aplica';
      const indicators = {
        financialStatements: { status: financial ? 'entregado' : 'pendiente', version: financial ? (index === 1 ? 2 : 1) : null },
        portfolio: { status: portfolio ? 'entregado' : 'pendiente', version: portfolio ? 1 : null },
        iva: { status: iva ? 'declarado' : 'pendiente', amount: iva ? 1250 + index * 100 : 0 },
        retentions: { status: retentions ? 'declarado' : 'pendiente', amount: retentions ? 320 + index * 25 : 0 },
        incomeTax: { status: incomeTax, amount: incomeTax === 'calculado' ? 180 : 0 }
      };
      const applicable = Object.values(indicators).filter(item => item.status !== 'no_aplica');
      const completed = applicable.filter(item => ['entregado', 'declarado', 'calculado'].includes(item.status)).length;
      return { periodId: `demo-${index + 1}`, month, monthNum: index + 1, indicators, compliancePercentage: Math.round(completed / applicable.length * 100) };
    });
    const alerts = demoMonths.flatMap(month => Object.entries(month.indicators).filter(([, item]) => item.status === 'pendiente').map(([indicator]) => ({ month: month.month, indicator, severity: month.monthNum < 3 ? 'alta' : 'media', message: `${indicator} pendiente en ${month.month}` })));
    return { demo: true, client, year: Number(selectedYear), months: demoMonths, summary: { compliancePercentage: Math.round(demoMonths.reduce((sum, month) => sum + month.compliancePercentage, 0) / demoMonths.length), totalMonths: demoMonths.length, pendingAlerts: alerts.length }, alerts };
  }; */

  useEffect(() => {
    if (selectedClientDashboard && dashboardYear) openClientDashboard(selectedClientDashboard);
  }, [dashboardYear]);

  // Abre automáticamente el cliente del filtro general cuando ya está
  // disponible en la lista recibida por el Dashboard.
  useEffect(() => {
    if (!globalClientRuc) {
      if (selectedClientDashboard) {
        setSelectedClientDashboard(null);
        setClientDashboard(null);
      }
      return;
    }
    const client = clients.find(item => String(item.ruc) === String(globalClientRuc));
    if (!client || selectedClientDashboard?.id === client.id) return;
    void openClientDashboard(client);
  }, [globalClientRuc, clients, year]);

  const indicatorLabels = { financialStatements: 'Estados Financieros', portfolio: 'CxC/CxP', iva: 'IVA', retentions: 'Retenciones', incomeTax: 'Impuesto a la Renta' };
  const alertKey = alert => `${alert.month}-${alert.indicator}`;
  const unreadAlerts = (displayClientDashboard?.alerts || []).filter(alert => !readAlerts.has(alertKey(alert)));
  const alertGroups = (displayClientDashboard?.alerts || []).reduce((groups, alert) => {
    (groups[alert.month] ||= []).push(alert);
    return groups;
  }, {});
  const clientsToDisplay = isAdmin && selectedAssignedUser ? selectedUserClients : clients;

  return (
    <div className="content">
      {false && <section className="welcome dashboard-welcome">
        <div>
          <h2>Bienvenido, {authenticatedName} <span>👋</span></h2>
          <p>Este es el estado de los reportes contables de tus clientes.</p>
        </div>
        <div className="dashboard-welcome-side">
          <div className="dashboard-year-pill"><span className="pulse-dot"/> Año fiscal <strong>{year}</strong></div>
        {canCreateClient && <button className="primary" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={18}/> Nuevo cliente
        </button>}
        </div>
      </section>}

      {false && <section className="metrics dashboard-metrics">
        <Metric icon="users" title="Clientes activos" value={clients.length} note="+4 este año" tone="violet"/>
        <Metric icon="calendar" title="Periodos al día" value={totalCompleted} note={`${compliancePct}% del total`} tone="blue"/>
        <Metric icon="file" title="Periodos pendientes" value={totalPeriodsCount - totalCompleted} note="Requieren atención" tone="orange"/>
      </section>}

      <section className="dashboard-status-strip">
        <div className="status-strip-icon"><Icon name="check" size={18}/></div>
        <div><strong>Tu operación está en movimiento</strong><p>{totalCompleted} de {totalPeriodsCount || 0} periodos registrados están al día este año.</p></div>
        <span className="status-strip-percent">{compliancePct}%</span>
      </section>

      {isAdmin && <section className="panel clients-panel admin-users-panel">
        <div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar los clientes que tiene asignados.</p></div></div>
        <div className="table-wrap">
          <table><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead>
            <tbody>{assignedUsers.map(userName => <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { setSelectedAssignedUser(userName); window.setTimeout(() => document.getElementById('dashboard-assigned-clients')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>)}</tbody>
          </table>
          {!assignedUsers.length && <div className="empty">No hay usuarios con clientes asignados.</div>}
        </div>
      </section>}

      {(!isAdmin || selectedAssignedUser) && <section id="dashboard-assigned-clients" className="dashboard-grid">
        <div className="panel clients-panel">
          <div className="panel-head">
            <div>
              <h3>{isAdmin && selectedAssignedUser ? `Clientes de ${selectedAssignedUser}` : 'Clientes'}</h3>
              <p>Selecciona un cliente para consultar su dashboard detallado.</p>
            </div>
          </div>
          <div className="search">
            <Icon name="search" size={18}/>
            <input placeholder="Buscar cliente o RUC..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {clientsToDisplay.map(c => (
                  <tr key={c.ruc}>
                    <td>
                      <strong>{c.name}</strong>
                      <small>RUC {c.ruc} · {c.owner}</small>
                    </td>
                    <td><button type="button" className="client-dashboard-btn" onClick={() => openClientDashboard(c)}><Icon name="grid" size={14}/> Ver dashboard <Icon name="arrow" size={14}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!clientsToDisplay.length && <div className="empty">No se encontraron clientes.</div>}
          </div>
        </div>
      </section>}

      {selectedClientDashboard && (
        <section ref={clientDashboardRef} className="panel client-dashboard-detail">
          <div className="panel-head">
            <div>
              <h3>Dashboard de {selectedClientDashboard.name}</h3>
              {clientDashboard?.demo && <small className="demo-dashboard-badge">Datos de demostración</small>}
            </div>
            <label className="dashboard-year-field dashboard-year-top">Año fiscal<select value={dashboardYear} onChange={event => { setDashboardYear(event.target.value); setClientDashboard(null); }}><option value="">Selecciona un año</option>{availableYears.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            {clientDashboard?.alerts?.length > 0 && <div className="dashboard-notifications"><button type="button" className="notification-bell" title="Ver alertas"><span>🔔</span>{unreadAlerts.length > 0 && <b>{unreadAlerts.length}</b>}</button><div className="notification-popover"><div className="notification-title"><strong>Alertas pendientes</strong><button type="button" onClick={() => setReadAlerts(new Set(clientDashboard.alerts.map(alertKey)))}>Marcar todas</button></div>{Object.entries(alertGroups).map(([month, alerts]) => <div className="notification-group" key={month}><em>{month}</em>{alerts.slice(0, 3).map((alert, index) => <div className={`notification-item ${readAlerts.has(alertKey(alert)) ? 'is-read' : ''}`} key={`${alert.indicator}-${index}`}><span>⚠️ {indicatorLabels[alert.indicator] || alert.indicator}</span><div className="notification-actions"><button type="button" onClick={() => navigate(`/periodos-contables?client=${selectedClientDashboard.ruc}&year=${dashboardYear}&month=${encodeURIComponent(alert.month)}`)}>Ver periodo</button><button type="button" onClick={() => setReadAlerts(current => new Set([...current, alertKey(alert)]))}>{readAlerts.has(alertKey(alert)) ? 'Leída' : 'Marcar leída'}</button></div></div>)}</div>)}</div></div>}
          </div>
          {!dashboardYear && <div className="empty">Selecciona un año para cargar el dashboard del cliente.</div>}
          {loadingClientDashboard && <div className="empty">Cargando indicadores...</div>}
          {!loadingClientDashboard && displayClientDashboard && <>
            <div className="metrics">
              <div className={`client-summary-metric ${displayClientDashboard.summary.compliancePercentage > 80 ? 'is-good' : displayClientDashboard.summary.compliancePercentage >= 40 ? 'is-warning' : 'is-danger'}`}><Metric icon="shield" title="Cumplimiento" value={`${displayClientDashboard.summary.compliancePercentage}%`} note="Promedio anual" tone="green"/></div>
              <Metric icon="calendar" title="Meses evaluados" value={displayClientDashboard.summary.totalMonths} note="Periodo fiscal" tone="blue"/>
              <Metric icon="alert" title="Pendientes" value={displayClientDashboard.summary.pendingAlerts} note="Requieren atención" tone="orange"/>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>MES</th><th>ESTADOS FINANCIEROS</th><th>CXC/CXP</th><th>IVA</th><th>RETENCIONES</th><th>RENTA</th><th>CUMPLIMIENTO</th></tr></thead>
                 <tbody>{displayClientDashboard.months.map(month => <tr key={month.periodId}>
                  <td><strong>{month.month}</strong></td>
                  <td><span className={`status-badge ${month.indicators.financialStatements.status === 'entregado' ? 'status-success' : 'status-warning'}`}>{month.indicators.financialStatements.status === 'entregado' ? <>Entregado <sup>v{month.indicators.financialStatements.version}</sup></> : 'Pendiente'}</span></td>
                  <td><span className={`status-badge ${month.indicators.portfolio.status === 'entregado' ? 'status-success' : 'status-warning'}`}>{month.indicators.portfolio.status === 'entregado' ? <>Entregado <sup>v{month.indicators.portfolio.version}</sup></> : 'Pendiente'}</span></td>
                  <td><span className={`status-badge ${month.indicators.iva.status === 'declarado' ? 'status-success' : 'status-warning'}`}>{month.indicators.iva.status === 'declarado' ? `Declarado · $${month.indicators.iva.amount.toFixed(2)}` : 'Pendiente'}</span></td>
                  <td><span className={`status-badge ${month.indicators.retentions.status === 'declarado' ? 'status-success' : 'status-warning'}`}>{month.indicators.retentions.status === 'declarado' ? `Declarado · $${month.indicators.retentions.amount.toFixed(2)}` : 'Pendiente'}</span></td>
                   <td><span className={`status-badge ${month.indicators.incomeTax.status === 'presentada' || month.indicators.incomeTax.status === 'calculado' ? 'status-success' : month.indicators.incomeTax.status === 'no_aplica' || month.indicators.incomeTax.status === 'acumulando' ? 'status-neutral' : 'status-warning'}`}>{month.indicators.incomeTax.status === 'presentada' ? 'Presentada' : month.indicators.incomeTax.status === 'calculado' ? 'Calculada' : month.indicators.incomeTax.status === 'no_aplica' ? 'No aplica' : month.indicators.incomeTax.status === 'acumulando' ? 'Acumulando' : 'Pendiente'}</span></td>
                  <td><div className={`compliance-cell ${month.compliancePercentage > 80 ? 'is-good' : month.compliancePercentage >= 40 ? 'is-warning' : 'is-danger'}`}><span className="compliance-track"><i style={{width: `${month.compliancePercentage}%`}}/></span><strong>{month.compliancePercentage}%</strong></div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
        </section>
      )}
    </div>
  );
}

function ClientsModule({ clients, search, setSearch, onOpenCreate, onEditClient, onDeleteClient, isAdmin = false, year }) {
  const { user } = useAuth();
  const authenticatedName = user?.nombre || user?.name || user?.username || 'Usuario';
  const [selectedUser, setSelectedUser] = useState('');
  useEffect(() => {
    if (selectedUser) window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [selectedUser]);
  const assignedUsers = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  const selectedUserClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  return (
    <div className="content clients-module">
      <section className="welcome dashboard-welcome">
        <div>
          <h2>Bienvenido, {authenticatedName} <span>👋</span></h2>
          <p>Administra la información y configuración tributaria de cada cliente.</p>
        </div>
        <div className="dashboard-welcome-side">
          <div className="dashboard-year-pill"><span className="pulse-dot"/> Año fiscal <strong>{year}</strong></div>
          <button className="primary" onClick={onOpenCreate}><Icon name="plus" size={18}/> Nuevo cliente</button>
        </div>
      </section>
      {false && <section className="welcome">
        <div>
          <p className="eyebrow">CLIENTES</p>
          <h2>Clientes</h2>
          <p>Administra la información y configuración tributaria de cada cliente.</p>
        </div>  
        <button className="primary" onClick={onOpenCreate}>
          <Icon name="plus" size={18}/> Nuevo cliente
        </button>
      </section>}

      {isAdmin && <section className="panel clients-registry">
        <div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar sus clientes asignados.</p></div></div>
        <div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{assignedUsers.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => setSelectedUser(userName)}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table>{!assignedUsers.length && <div className="empty">No hay usuarios con clientes asignados.</div>}</div>
      </section>}

      {(!isAdmin || selectedUser) && <section id="assigned-clients-section" className="panel clients-registry">
        <div className="panel-head">
          <div>
            <h3>Registro de clientes</h3>
            <p>Información general, contacto y tributación</p>
          </div>
        </div>
        <div className="search">
          <Icon name="search" size={18}/>
          <input placeholder="Buscar por razón social, responsable o RUC..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="table-wrap">
          <table className="client-table">
            <thead>
              <tr>
                <th>RAZÓN SOCIAL</th>
                <th>RUC</th>
                <th>RESPONSABLE / CONTACTO</th>
                <th>CONFIGURACIÓN TRIBUTARIA</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {(isAdmin ? selectedUserClients : clients).map(client => (
                <tr key={client.ruc}>
                  <td>
                    <strong>{client.name}</strong>
                    <small>{client.email || 'Sin correo registrado'}</small>
                  </td>
                  <td>{client.ruc}</td>
                  <td>
                    <strong>{client.owner}</strong>
                    <small>{client.phone || 'Sin teléfono registrado'}</small>
                  </td>
                  <td>
                    <strong>{client.taxRegime || 'Régimen general'}</strong>
                    <small>{client.accounting === 'No' ? 'No obligado a llevar contabilidad' : 'Obligado a llevar contabilidad'}</small>
                  </td>
                  <td>
                    <em className={`badge ${client.clientStatus === 'Inactivo' ? 'orange' : 'green'}`}>
                      {client.clientStatus || 'Activo'}
                    </em>
                  </td>
                  <td className="client-actions-cell">
                    <div className="client-actions">
                      <button className="edit-btn" onClick={() => onEditClient(client)} title="Editar datos del cliente">
                        <Icon name="edit" size={14}/> Editar
                      </button>
                        <button className="delete-btn" onClick={() => onDeleteClient(client)} title="Deshabilitar cliente">
                        <Icon name="trash" size={14}/> Deshabilitar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(isAdmin ? selectedUserClients : clients).length && <div className="empty">No se encontraron clientes.</div>}
        </div>
      </section>}
    </div>
  );
}

function PeriodsModule({ clients, periods, year, setYear, availableYears, onUpdateStatus, onCreateYear, onRefreshYear, periodRecords, onUpdateRecord, isAdmin = false, globalClientRuc = '' }) {
  const routerNavigate = useNavigate();
  // Marca las navegaciones originadas en el ojo del modal para que la sección
  // destino pueda ofrecer un retorno al mismo periodo.
  const navigate = (path, options) => {
    const fromPeriodModal = typeof path === 'string' && (
      path.startsWith('/estados-financieros?') ||
      path.startsWith('/cxc-cxp?') ||
      path.startsWith('/declaraciones?readonly=1')
    );
    return routerNavigate(fromPeriodModal ? `${path}&return=period-modal` : path, options);
  };
  const [selectedUser, setSelectedUser] = useState('');
  useEffect(() => { if (selectedUser) window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }, [selectedUser]);
  const assignedUsers = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  const selectedUserClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  const location = useLocation();
  const routeParams = new URLSearchParams(location.search);
  const requestedClient = routeParams.get('client') || '';
  const requestedYear = routeParams.get('year') || '';
  const requestedMonth = routeParams.get('month') || '';
  const [selectedClient, setSelectedClient] = useState(requestedClient || globalClientRuc);
  const [viewMode, setViewMode] = useState('matrix');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [showFinancialFilesModal, setShowFinancialFilesModal] = useState(false);
  const [financialFiles, setFinancialFiles] = useState({});
  const [existingFinancialDocs, setExistingFinancialDocs] = useState({});
  const [existingPortfolioDocs, setExistingPortfolioDocs] = useState({});
  const [existingDeclaration, setExistingDeclaration] = useState(null);

  // Sincroniza la selección local con el filtro global del contador.
  useEffect(() => {
    if (globalClientRuc) setSelectedClient(globalClientRuc);
    else if (!requestedClient) setSelectedClient('');
  }, [globalClientRuc]);

  useEffect(() => {
    if (!selectedClient && clients.length && (!isAdmin || selectedUser)) setSelectedClient((isAdmin ? selectedUserClients : clients)[0]?.ruc || '');
  }, [clients, selectedClient, selectedUser, selectedUserClients]);
  useEffect(() => {
    if (requestedYear && String(year) !== requestedYear) setYear(requestedYear);
    if (requestedClient && clients.some(client => String(client.ruc) === requestedClient)) {
      setSelectedClient(requestedClient);
      window.setTimeout(() => periodsHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  }, [requestedClient, requestedYear, clients]);
  const [showPortfolioFilesModal, setShowPortfolioFilesModal] = useState(false);
  const [portfolioFiles, setPortfolioFiles] = useState({});
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxSetupYear, setTaxSetupYear] = useState('');
  const [pendingApertureYear, setPendingApertureYear] = useState('');
  const [incomeTaxSummary, setIncomeTaxSummary] = useState({ periodicity: 'Anual', rate: 0, base: { iva: 0, retentions: 0 } });
  const [annualTaxStatus, setAnnualTaxStatus] = useState('acumulando');
  const [annualTaxDueDate, setAnnualTaxDueDate] = useState('');
  const [clientYears, setClientYears] = useState([]);
  const [apertureFrequency, setApertureFrequency] = useState('Mensual');
  const [apertureYear, setApertureYear] = useState(String(new Date().getFullYear()));
      const [showApertureModal, setShowApertureModal] = useState(false);
      const maxYear = clientYears.length ? Math.max(...clientYears.map(Number)) + 1 : 2100;
  const periodsHistoryRef = useRef(null);
  useEffect(() => {
    if (!requestedMonth || !selectedClient || !year) return;
    const match = [...periodRecords, ...periods].find(period => String(period.clientRuc) === String(selectedClient) && String(period.year) === String(year) && String(period.month).toLowerCase() === requestedMonth.toLowerCase());
    if (match) setSelectedPeriodId(match.id);
  }, [requestedMonth, selectedClient, year, periodRecords, periods]);
  const selectClientAndScroll = clientRuc => {
    setSelectedClient(clientRuc);
    setTimeout(() => periodsHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const selectedRecord = periodRecords.find(item => item.id === selectedPeriodId) || periods.find(item => item.id === selectedPeriodId);
  const shareSelectedPeriod = async period => {
    if (!period?.id) return;
    try {
      await api.post(`/periods/${period.id}/share`);
      alert('Documentación compartida y registrada en auditoría.');
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo compartir la documentación.');
    }
  };

  // Abre automáticamente el cliente del filtro general solo cuando ya está
  // disponible en la lista recibida por el Dashboard.
  const selectedClientData = clients.find(client => client.ruc === selectedClient);
  useEffect(() => {
    if (!selectedClientData?.id || !year) return;
    api.get(`/clients/${selectedClientData.id}/income-tax/${year}`)
      .then(({ data }) => setIncomeTaxSummary({
        periodicity: data.data?.configuration?.periodicity || 'Anual',
        rate: Number(data.data?.configuration?.rate || 0),
        base: data.data?.base || { iva: 0, retentions: 0 }
      }))
      .catch(() => setIncomeTaxSummary({ periodicity: 'Anual', base: { iva: 0, retentions: 0 } }));
  }, [selectedClientData?.id, year]);
  useEffect(() => {
    if (!selectedClientData?.id || !year) return;
    api.get(`/clients/${selectedClientData.id}/annual-tax/${year}`)
      .then(({ data }) => {
        setAnnualTaxStatus(data.data?.declaration?.status || 'acumulando');
        setAnnualTaxDueDate(data.data?.declaration?.dueDate || '');
      })
      .catch(() => { setAnnualTaxStatus('acumulando'); setAnnualTaxDueDate(''); });
  }, [selectedClientData?.id, year, showTaxModal]);
  const savePeriodFiles = async (files, group, documents) => {
    if (!selectedRecord) return;
    const selected = documents.map(([key]) => files[key]).filter(Boolean);
    if (!selected.length) return alert('Selecciona al menos un archivo.');
    const formData = new FormData();
    selected.forEach(file => formData.append('files', file));
    formData.append('group', group);
    formData.append('types', documents.filter(([key]) => files[key]).map(([key]) => key).join(','));
    try {
      await api.post(`/periods/${selectedRecord.id}/documents`, formData);
      const documentKey = group === 'Financial Statements' ? 'financial' : group === 'Portfolio' ? 'accounts' : null;
      if (documentKey) {
        const documents = { financial: false, accounts: false, declarations: false, tax: false, ...(selectedRecord.documents || {}), [documentKey]: true };
        const nextStatus = getPeriodStatus(documents);
        onUpdateRecord({ ...selectedRecord, documents, status: nextStatus });
        onUpdateStatus(selectedRecord.id, nextStatus);
      }
      setSelectedPeriodId(null);
      alert('Archivos guardados correctamente.');
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudieron guardar los archivos.');
    }
  };
  const saveDeclaration = async ({ iva, retentions, ivaFile, retentionFile }) => {
    if (!selectedRecord) return;
    const formData = new FormData();
    formData.append('iva', iva || '0');
    formData.append('retentions', retentions || '0');
    if (ivaFile) formData.append('ivaFile', ivaFile);
    if (retentionFile) formData.append('retentionFile', retentionFile);
    try {
      await api.post(`/periods/${selectedRecord.id}/declaration`, formData);
      // Actualiza los indicadores y el estado del periodo con la información recién guardada.
      await onRefreshYear?.(year);
      // Refresca la base acumulada del Impuesto a la Renta sin cambiar de pantalla.
      if (selectedClientData?.id && year) {
        const { data: taxData } = await api.get(`/clients/${selectedClientData.id}/income-tax/${year}`);
        setIncomeTaxSummary({
          periodicity: taxData.data?.configuration?.periodicity || 'Anual',
          rate: Number(taxData.data?.configuration?.rate || 0),
          base: taxData.data?.base || { iva: 0, retentions: 0 }
        });
      }
      const documents = { financial: false, accounts: false, declarations: true, tax: false, ...(selectedRecord.documents || {}) };
      const nextStatus = getPeriodStatus(documents);
      onUpdateRecord({ ...selectedRecord, documents, status: nextStatus });
      onUpdateStatus(selectedRecord.id, nextStatus);
      setShowDeclarationModal(false);
      setSelectedPeriodId(null);
      alert('Declaración guardada correctamente.');
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo guardar la declaración.');
    }
  };
  useEffect(() => {
    if ((!showFinancialFilesModal && !showPortfolioFilesModal) || !selectedRecord) return;
    api.get(`/periods/${selectedRecord.id}/documents`).then(({ data }) => {
      const existing = {};
      (data.data || []).filter(doc => doc.documentGroup === 'Financial Statements').forEach(doc => {
        const current = existing[doc.documentType];
        if (!current || Number(doc.version) > Number(current.version)) existing[doc.documentType] = doc;
      });
      setExistingFinancialDocs(existing);
      const portfolio = {};
      (data.data || []).filter(doc => doc.documentGroup === 'Portfolio').forEach(doc => {
        const current = portfolio[doc.documentType];
        if (!current || Number(doc.version) > Number(current.version)) portfolio[doc.documentType] = doc;
      });
      setExistingPortfolioDocs(portfolio);
    }).catch(() => { setExistingFinancialDocs({}); setExistingPortfolioDocs({}); });
  }, [showFinancialFilesModal, showPortfolioFilesModal, selectedRecord]);
  useEffect(() => {
    if (!showDeclarationModal || !selectedRecord) return;
    api.get(`/periods/${selectedRecord.id}/declaration`).then(({ data }) => setExistingDeclaration(data.data || null)).catch(() => setExistingDeclaration(null));
  }, [showDeclarationModal, selectedRecord]);
  const updateDocument = key => { if (!selectedRecord || selectedRecord.status === 'Completado') return; const documents = { financial: false, accounts: false, declarations: false, tax: false, ...(selectedRecord.documents || {}), [key]: !(selectedRecord.documents || {})[key] }; const nextStatus = getPeriodStatus(documents); onUpdateRecord({ ...selectedRecord, documents, status: nextStatus }); onUpdateStatus(selectedRecord.id, nextStatus); };

  const yearPeriods = useMemo(() => {
    return periods.filter(p => p.year === String(year));
  }, [periods, year]);

  const filteredPeriods = useMemo(() => {
    return yearPeriods.filter(p => {
      const matchClient = selectedClient === 'ALL' || p.clientRuc === selectedClient;
      const matchSearch = p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.month.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.clientRuc.includes(searchTerm);
      return matchClient && matchSearch;
    });
  }, [yearPeriods, selectedClient, searchTerm]);

  const cycleStatus = (period) => {
    const order = ['Pendiente', 'En proceso', 'Completado'];
    const nextIdx = (order.indexOf(period.status) + 1) % order.length;
    onUpdateStatus(period.id, order[nextIdx]);
  };

  const yearsAvailable = clientYears.length ? clientYears : [String(new Date().getFullYear())];
  const nextYear = String(parseInt(year, 10) + 1);
  const selectedClientHasPeriods = yearPeriods.some(period => period.clientRuc === selectedClient);
  const targetYearToOpen = selectedClientHasPeriods ? nextYear : String(year);
  const visibleClients = isAdmin ? selectedUserClients : clients;
  const clientOptions = visibleClients.filter(client => `${client.name} ${client.ruc} ${client.owner}`.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    if (!selectedClient) { setClientYears([]); return; }
    const client = clients.find(item => item.ruc === selectedClient);
    if (!client?.id) return;
    api.get('/periods/years', { params: { clientId: client.id } }).then(({ data }) => {
      const years = data.data || [];
      setClientYears(years);
      setYear(years.length ? String(years[0]) : String(new Date().getFullYear()));
    }).catch(() => {});
  }, [selectedClient]);

  // Sincroniza inmediatamente los periodos recién creados con el estado del módulo.
  useEffect(() => {
    const latestYear = clientYears[0];
    if (!latestYear || !onRefreshYear) return;
    onRefreshYear(latestYear).catch(() => {});
  }, [clientYears]);

  return (
    <div className="content periods-module">
      <section className="welcome">
        <div>
          <p className="eyebrow">PERIODOS CONTABLES</p>
          <h2>Control de Periodos Mensuales</h2>
        </div>
        {false && <div className="period-year-actions">
          <select 
            className="year-select-dropdown" 
            value={year} 
            onChange={(e) => setYear(e.target.value)}
          >
            {yearsAvailable.map(y => (
              <option key={y} value={y}>Año fiscal {y}</option>
            ))}
          </select>
          
          {!yearsAvailable.includes(nextYear) && <button 
            className="primary outline-btn" 
            title="Inicializar periodos para el siguiente año contable"
            onClick={async () => {
              const nextY = nextYear;
              await onCreateYear(nextY);
              alert(`Se ha activado e inicializado automáticamente el año fiscal ${nextY}.`);
            }}
          >
            <Icon name="refresh" size={16}/> Aperturar Año {nextYear}
          </button>}
        </div>}
      </section>

      <div className="search period-client-search">
        <Icon name="search" size={18}/>
        <input placeholder="Buscar por cliente, mes o RUC..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
      </div>

      {isAdmin && <section className="panel clients-registry"><div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar sus periodos.</p></div></div><div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{assignedUsers.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { setSelectedUser(userName); setSelectedClient(''); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table></div></section>}

      {(!isAdmin || selectedUser) && <section id="assigned-clients-section" className="panel period-client-selector">
        <div className="panel-head">
          <div><h3>Clientes</h3><p>Selecciona un cliente para acceder a sus periodos contables.</p></div>
        </div>
        <div className="period-client-list">
              {clientOptions.map(client => <div key={client.ruc} className={`period-client-row ${selectedClient === client.ruc ? 'selected' : ''}`}><div><strong>{client.name}</strong><small>RUC/Cédula {client.ruc} · {client.owner}</small></div><em className="badge green">{client.clientStatus || 'Activo'}</em><button type="button" className="edit-btn" onClick={() => selectClientAndScroll(client.ruc)}>Ver periodos</button></div>)}
          {!clientOptions.length && <div className="empty">No se encontraron clientes.</div>}
        </div>
      </section>}

      {selectedClient && <section ref={periodsHistoryRef} className="panel periods-main-panel">
        <div className="panel-head periods-head">
          <div>
            <h3>Historial del Año Fiscal{clientYears.length ? ` ${year}` : ''}</h3>
            <p>Consulta los periodos creados para este cliente y año.</p>
          </div>
          <div className="period-history-actions"><div className="period-year-actions">
            <select className="year-select-dropdown" value={clientYears.length ? year : ''} onChange={(e) => setYear(e.target.value)}>{clientYears.length ? yearsAvailable.map(y => <option key={y} value={y}>Año fiscal {y}</option>) : <option value="">Selecciona un año</option>}</select>
            <button className="primary outline-btn" onClick={() => { setApertureYear(selectedClientHasPeriods ? nextYear : String(year)); setShowApertureModal(true); }}><Icon name="plus" size={16}/> Crear periodos</button>
          </div><div className="view-toggle">
            <button 
              className={viewMode === 'matrix' ? 'active' : ''} 
              onClick={() => setViewMode('matrix')}
            >
              Matriz
            </button>
          </div></div>
        </div>

        {viewMode === 'matrix' ? (
          <div className="matrix-wrapper">
            {selectedClient ? clients
              .filter(c => c.ruc === selectedClient)
              .filter(c => yearPeriods.some(period => period.clientRuc === c.ruc))
              .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.ruc.includes(searchTerm))
              .map(client => {
                const clientPeriods = yearPeriods.filter(p => p.clientRuc === client.ruc);
                const periodLabels = MONTHS.map((month, index) => ({ ...month, monthNum: index + 1 }));
                const completed = clientPeriods.filter(p => p.status === 'Completado').length;
                const totalPeriods = periodLabels.length;
                const pct = Math.round((completed / totalPeriods) * 100);

                return (
                  <div key={client.ruc} className="client-matrix-card">
                    <div className="card-client-info">
                      <div>
                        <strong>{client.name}</strong>
                        <small>RUC: {client.ruc} · {client.owner}</small>
                      </div>
                      <div className="client-stat-badge">
                        <span className="client-stat-label">Cumplimiento</span>
                        <span className="pct-num">{pct}%</span>
                        <small>{completed}/{totalPeriods} meses completados</small>
                      </div>
                    </div>

                    <div className="panel income-tax-year-card">
                      <div className="panel-head">
                        <div><h3>Impuesto a la Renta · {year}</h3><p>Periodicidad: {incomeTaxSummary.periodicity}</p></div>
                         <span className={`status-badge ${annualTaxStatus === 'presentada' ? 'status-success' : annualTaxStatus === 'calculada' ? 'status-warning' : 'status-neutral'}`}>{annualTaxStatus === 'presentada' ? 'Presentada' : annualTaxStatus === 'calculada' ? 'Calculada' : 'Acumulando'}</span>
                       </div>
                       {annualTaxStatus === 'calculada' && <div className="annual-deadline-alert"><strong>⚠ Formulario 101 pendiente</strong><span>Fecha límite: {annualTaxDueDate || 'abril del año siguiente'}</span></div>}
                       {annualTaxStatus === 'presentada' && <div className="annual-presented-notice"><strong>✓ Formulario 101 presentado</strong><span>La obligación anual está registrada.</span></div>}
                       <div className="income-tax-year-summary">
                        <div><small>Base acumulada actual</small><strong>${(Number(incomeTaxSummary.base?.iva || 0) + Number(incomeTaxSummary.base?.retentions || 0)).toFixed(2)}</strong></div>
                         <button type="button" className="primary income-tax-view-btn" onClick={() => { setTaxSetupYear(String(year)); setSelectedPeriodId(null); setShowTaxModal(true); }}>Ver Impuestos</button>
                      </div>
                    </div>

                    <div className="months-grid">
                      {periodLabels.map((m) => {
                        const period = clientPeriods.find(p => p.monthNum === m.monthNum);
                        const status = period ? period.status : 'Pendiente';
                        const toneClass = status === 'Completado' ? 'green' : status === 'En proceso' ? 'blue' : 'orange';

                        return (
                          <div 
                            key={m.short} 
                            className={`month-pill ${toneClass}`} 
                            title={`${m.name} ${year}: ${status} (Haz clic para alternar estado)`}
                            onClick={() => { setSelectedPeriodId(period?.id); if (period) setSelectedPeriodId(period.id); }}
                          >
                            <span className="m-name">{m.short}</span>
                            <span className="m-status">{status}</span>
                            <span className="m-icon">{status === 'Completado' ? '✓' : status === 'En proceso' ? '◷' : '−'}</span>
                            {period && <button
                              type="button"
                              className="month-upload-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedPeriodId(period.id);
                              }}
                            >
                              <Icon name="upload" size={13} /> Subir archivos
                            </button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }) : <div className="empty">Selecciona un cliente para consultar sus periodos contables.</div>}

            {selectedClient && !yearPeriods.some(period => period.clientRuc === selectedClient) && <div className="empty">Este cliente aún no tiene periodos creados.</div>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="periods-table">
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>AÑO FISCAL</th>
                  <th>MES</th>
                  <th>ESTADO DE PERIODO</th>
                  <th>ÚLTIMA ACTUALIZACIÓN</th>
                  <th>CAMBIAR ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeriods.map(period => (
                  <tr key={period.id}>
                    <td>
                      <strong>{period.clientName}</strong>
                      <small>RUC {period.clientRuc}</small>
                    </td>
                    <td><b>{period.year}</b></td>
                    <td><strong>{period.month}</strong></td>
                    <td>
                      <em className={`badge ${period.status === 'Completado' ? 'green' : period.status === 'En proceso' ? 'blue' : 'orange'}`}>
                        {period.status}
                      </em>
                    </td>
                    <td><small>{period.updatedAt}</small></td>
                    <td>
                      <select 
                        className="table-status-select"
                        value={period.status}
                        onChange={(e) => onUpdateStatus(period.id, e.target.value)}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Completado">Completado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPeriods.length && <div className="empty">No se encontraron periodos con los filtros seleccionados.</div>}
          </div>
        )}
      </section>}
      {selectedRecord && <div className="modal-backdrop" onMouseDown={() => setSelectedPeriodId(null)}><section className="panel period-checklist period-detail-modal" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSelectedPeriodId(null)}><Icon name="close"/></button><div className="panel-head"><div><h3>{selectedRecord.month} {selectedRecord.year}</h3><p>{selectedRecord.clientName}</p></div><em className={`badge ${selectedRecord.status === 'Completado' ? 'green' : selectedRecord.status === 'En proceso' ? 'blue' : 'orange'}`}>{selectedRecord.status}</em></div><div className="checklist-grid">{[['financial','Estados financieros'],['accounts','Cartera'],['declarations','Declaraciones'],['tax','Impuesto a la renta']].map(([key,label]) => <div key={key} className={`checklist-item ${(selectedRecord.documents || {})[key] ? 'checked' : ''} ${key === 'tax' && incomeTaxSummary.periodicity === 'Anual' ? 'tax-informative' : ''}`}><span>{(selectedRecord.documents || {})[key] ? '✓' : key === 'tax' ? '·' : '×'}</span><div><strong>{label}</strong><small>{(selectedRecord.documents || {})[key] ? 'Cargado y confirmado' : key === 'tax' && incomeTaxSummary.periodicity === 'Anual' ? 'Acumulando · periodicidad anual — ver resumen del año' : key === 'tax' ? 'Pendiente' : 'Sin cargar'}</small></div>{key === 'financial' && (selectedRecord.documents || {})[key] && <button type="button" className="row-upload-btn" onClick={() => navigate(`/estados-financieros?client=${selectedRecord.clientRuc}&year=${selectedRecord.year}&month=${encodeURIComponent(selectedRecord.month)}`)}><Icon name="eye" size={14}/></button>}{key === 'financial' && <button type="button" className="row-upload-btn" onClick={() => setShowFinancialFilesModal(true)}><Icon name="upload" size={14}/> Agregar archivos</button>}{key === 'accounts' && (selectedRecord.documents || {})[key] && <button type="button" className="row-upload-btn" onClick={() => navigate(`/cxc-cxp?client=${selectedRecord.clientRuc}&year=${selectedRecord.year}&month=${encodeURIComponent(selectedRecord.month)}`)}><Icon name="eye" size={14}/></button>}{key === 'accounts' && <button type="button" className="row-upload-btn" onClick={() => setShowPortfolioFilesModal(true)}><Icon name="upload" size={14}/> Agregar archivos</button>}{key === 'declarations' && (selectedRecord.documents || {})[key] && <button type="button" className="row-upload-btn" title="Ver declaración" onClick={() => navigate(`/declaraciones?readonly=1&client=${selectedRecord.clientRuc}&year=${selectedRecord.year}&month=${encodeURIComponent(selectedRecord.month)}`)}><Icon name="eye" size={14}/></button>}{key === 'declarations' && <button type="button" className="row-upload-btn" onClick={() => setShowDeclarationModal(true)}><Icon name="upload" size={14}/> Agregar declaración</button>}{key === 'tax' && incomeTaxSummary.periodicity !== 'Anual' && <button type="button" className="row-upload-btn" onClick={() => setShowTaxModal(true)}><Icon name="upload" size={16}/> Agregar impuesto</button>}</div>)}</div></section></div>}
      {showFinancialFilesModal && selectedRecord && <FinancialFilesModal documents={FINANCIAL_DOCUMENTS} files={financialFiles} existing={existingFinancialDocs} onClose={() => setShowFinancialFilesModal(false)} onSave={files => savePeriodFiles(files, 'Financial Statements', FINANCIAL_DOCUMENTS)} />}
      {showPortfolioFilesModal && selectedRecord && <FinancialFilesModal documents={PORTFOLIO_DOCUMENTS} files={portfolioFiles} existing={existingPortfolioDocs} onClose={() => setShowPortfolioFilesModal(false)} onSave={files => savePeriodFiles(files, 'Portfolio', PORTFOLIO_DOCUMENTS)} />}
      {showDeclarationModal && selectedRecord && <DeclarationPeriodModal periodId={selectedRecord.id} existing={existingDeclaration} onClose={() => setShowDeclarationModal(false)} onSave={saveDeclaration} />}
      {showTaxModal && (selectedRecord || selectedClientData) && (pendingApertureYear ? <IncomeTaxPeriodModal periodId={selectedRecord?.id} clientId={selectedRecord?.clientId || selectedClientData?.id} year={selectedRecord?.year || taxSetupYear || year} readOnly={false} onClose={() => { setShowTaxModal(false); setPendingApertureYear(''); }} onSave={async config => { try { const clientId = selectedRecord?.clientId || selectedClientData?.id; const taxYear = selectedRecord?.year || taxSetupYear || year; await api.put(`/clients/${clientId}/income-tax/${taxYear}`, { ...config, createPeriods: true, apertureYear: pendingApertureYear }); setClientYears(current => Array.from(new Set([...current, pendingApertureYear])).sort((a, b) => Number(b) - Number(a))); setYear(pendingApertureYear); setPendingApertureYear(''); setShowTaxModal(false); alert('Configuraci�n guardada correctamente.'); } catch (error) { alert(error?.response?.data?.error || 'No se pudo guardar la configuraci�n.'); } }} /> : <AnnualTaxSummaryModal clientId={selectedRecord?.clientId || selectedClientData?.id} year={selectedRecord?.year || year} initialBase={incomeTaxSummary.base} initialRate={incomeTaxSummary.rate} onClose={() => setShowTaxModal(false)} />)}
      {showApertureModal && <div className="modal-backdrop" onMouseDown={() => setShowApertureModal(false)}><form className="modal aperture-modal" onSubmit={async event => { event.preventDefault(); const selectedYear = Number(apertureYear); const hasExistingYears = clientYears.length > 0; const latestYear = hasExistingYears ? Math.max(...clientYears.map(Number)) : null; const maxYear = hasExistingYears ? latestYear + 1 : 2100; if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > maxYear || (hasExistingYears && selectedYear !== maxYear)) return alert(hasExistingYears ? `Solo puedes aperturar el año siguiente: ${maxYear}.` : 'Ingresa un año fiscal válido.'); if (clientYears.includes(String(selectedYear))) return alert(`El año ${selectedYear} ya tiene periodos creados para este cliente.`); setPendingApertureYear(String(selectedYear)); setTaxSetupYear(String(selectedYear)); setShowApertureModal(false); setShowTaxModal(true); }} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowApertureModal(false)}><Icon name="close" /></button><p className="eyebrow">NUEVO AÑO FISCAL</p><h2>Crear periodos</h2><p>Selecciona el año fiscal. Se crearán automáticamente los 12 meses después de guardar la configuración tributaria.</p><div className="aperture-fields"><label>Año fiscal<input type="number" min="2000" max={maxYear} value={apertureYear} onChange={event => setApertureYear(event.target.value)} /></label></div><div className="modal-actions"><button type="button" className="outline" onClick={() => setShowApertureModal(false)}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Continuar configuración</button></div></form></div>}
    </div>
  );
}

/* ==========================================================================
   MÓDULO 3: ESTADOS FINANCIEROS
   ========================================================================== */
function FinancialStatementsModule({ clients, year, documentGroup = 'Financial Statements', moduleTitle = 'Estados Financieros', clientActionLabel = 'Ver estados', moduleRoute = '/estados-financieros', isAdmin = false, globalClientRuc = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeParams = new URLSearchParams(location.search);
  const returnToPeriod = routeParams.get('return') === 'period-modal';
  const documentCatalog = documentGroup === 'Portfolio' ? PORTFOLIO_DOCUMENTS : FINANCIAL_DOCUMENTS;
  const [selectedUser, setSelectedUser] = useState('');
  useEffect(() => { if (selectedUser) window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }, [selectedUser]);
  const assignedUsers = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  const selectedUserClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  const visibleClients = isAdmin ? selectedUserClients : clients;
  const [statements, setStatements] = useState([]);
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(routeParams.get('client') || globalClientRuc || '');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState(routeParams.get('month') || 'ALL');
  const [clientYears, setClientYears] = useState([]);
  const selectedClientInfo = clients.find(client => String(client.ruc) === String(selectedClient));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [targetClientRuc, setTargetClientRuc] = useState(null);
  const [showFinancialFilesModal, setShowFinancialFilesModal] = useState(false);
  const [financialFiles, setFinancialFiles] = useState({});
  const financialResultsRef = useRef(null);
  // El filtro global obliga a este módulo a consultar únicamente ese cliente.
  useEffect(() => {
    if (globalClientRuc) setSelectedClient(globalClientRuc);
    else if (!routeParams.get('client')) setSelectedClient('');
  }, [globalClientRuc]);
  const selectFinancialClientAndScroll = clientRuc => {
    setSelectedClient(clientRuc);
    setSelectedYear('ALL');
    setSelectedMonth('ALL');
    setTimeout(() => financialResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  useEffect(() => {
    const client = clients.find(item => String(item.ruc) === String(selectedClient));
    if (!client?.id) { setClientYears([]); return; }
    api.get('/periods/years', { params: { clientId: client.id } })
      .then(({ data }) => setClientYears(data.data || []))
      .catch(() => setClientYears([]));
  }, [selectedClient, clients]);

  useEffect(() => {
    let cancelled = false;
    const client = clients.find(item => String(item.ruc) === String(selectedClient));
    if (!client?.id) { setStatements([]); setLoadingStatements(false); return () => { cancelled = true; }; }
    setLoadingStatements(true);
    Promise.all([
      api.get('/periods', { params: { clientId: client.id } }),
      api.get('/periods/documents', { params: { clientId: client.id } })
    ]).then(async ([periodsResponse, documentsResponse]) => {
      const periods = periodsResponse.data.data || [];
      const documentsByPeriod = new Map();
      (documentsResponse.data.data || []).forEach(doc => {
        const list = documentsByPeriod.get(String(doc.periodId)) || [];
        list.push(doc);
        documentsByPeriod.set(String(doc.periodId), list);
      });
      const loadedResults = await Promise.allSettled(periods.map(async period => {
        const docs = (documentsByPeriod.get(String(period.id)) || []).map(doc => ({ ...doc, documentGroup: doc.documentGroup ?? doc.document_group, documentType: doc.documentType ?? doc.document_type })).filter(doc => documentGroup === 'Portfolio' ? ['receivable', 'payable'].includes(doc.documentType) : FINANCIAL_DOCUMENTS.some(([key]) => key === doc.documentType));
        const versionGroups = new Map();
        docs.forEach(doc => {
          const group = versionGroups.get(doc.version) || { version: `v${doc.version}.0`, files: [], uploadedAt: doc.uploadedAt };
          const typeLabel = documentCatalog.find(([key]) => key === doc.documentType)?.[1] || doc.documentType;
          group.files.push({ id: doc.id, type: typeLabel, name: doc.originalName, size: doc.fileSize ? `${(Number(doc.fileSize) / 1048576).toFixed(2)} MB` : '' });
          if (new Date(doc.uploadedAt) > new Date(group.uploadedAt)) group.uploadedAt = doc.uploadedAt;
          versionGroups.set(doc.version, group);
        });
        const versions = [...versionGroups.values()].sort((a, b) => Number(b.version.slice(1, -2)) - Number(a.version.slice(1, -2))).map(group => ({
          ...group, fileName: `${group.files.length} ${moduleTitle.toLowerCase()}`, fileSize: '',
          uploadedAt: new Date(group.uploadedAt).toLocaleString('es-ES'), uploadedBy: 'Usuario', notes: ''
        }));
        const byType = new Map();
        docs.forEach(doc => {
          const list = byType.get(doc.documentType) || [];
          list.push(doc);
          byType.set(doc.documentType, list);
        });
        return [...byType.entries()].map(([type, typeDocs]) => {
          const typeVersions = typeDocs.sort((a, b) => Number(b.version) - Number(a.version)).map(doc => ({
            version: `v${doc.version}.0`, fileName: doc.originalName,
            fileSize: doc.fileSize ? `${(Number(doc.fileSize) / 1048576).toFixed(2)} MB` : '',
            uploadedAt: new Date(doc.uploadedAt).toLocaleString('es-ES'), uploadedBy: doc.uploadedBy || 'Usuario', notes: '',
            files: [{ id: doc.id, type: FINANCIAL_DOCUMENTS.find(([key]) => key === type)?.[1] || type, name: doc.originalName, size: doc.fileSize ? `${(Number(doc.fileSize) / 1048576).toFixed(2)} MB` : '' }]
          }));
          const latestDocument = typeDocs[0];
          const deliveryStatus = { Pending: 'Pendiente', Sent: 'Enviado', Delivered: 'Entregado' }[latestDocument?.deliveryStatus] || latestDocument?.deliveryStatus || 'Pendiente';
          return { id: `fs-${period.id}-${type}`, periodId: period.id, documentGroup, documentType: type, documentLabel: documentCatalog.find(([key]) => key === type)?.[1] || type, clientRuc: period.clientRuc, clientName: period.clientName, year: period.year, month: period.month, monthNum: period.monthNum, deliveryStatus, versions: typeVersions };
        });
      }));
      const loaded = loadedResults.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!cancelled) setStatements(loaded.flat().filter(Boolean));
    }).catch(() => { if (!cancelled) setStatements([]); })
      .finally(() => { if (!cancelled) setLoadingStatements(false); });
    return () => { cancelled = true; };
  }, [clients, selectedClient, documentGroup]);

  const filteredStatements = useMemo(() => {
    return statements.filter(item => {
      const matchClient = String(item.clientRuc) === String(selectedClient);
      const matchGroup = item.documentGroup === documentGroup;
      const matchYear = selectedYear === 'ALL' || String(item.year) === String(selectedYear);
      const matchStatus = statusFilter === 'ALL' || item.deliveryStatus === statusFilter;
      const matchMonth = selectedMonth === 'ALL' || item.month === selectedMonth;
      return matchClient && matchGroup && matchYear && matchStatus && matchMonth;
    });
  }, [statements, selectedYear, selectedMonth, selectedClient, statusFilter, documentGroup]);

  const financialMonths = useMemo(() => Array.from(new Set(statements.filter(item => String(item.clientRuc) === String(selectedClient)).map(item => item.month))), [statements, selectedClient]);

  const handleDeliveryStatusChange = async (id, newStatus) => {
    const item = statements.find(statement => statement.id === id);
    const documentId = item?.versions?.[0]?.files?.[0]?.id;
    if (!documentId) return;
    try {
      await api.patch(`/periods/${item.periodId}/documents/${documentId}/delivery-status`, { status: newStatus });
      setStatements(prev => prev.map(s => s.id === id ? { ...s, deliveryStatus: newStatus } : s));
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo actualizar el estado de entrega.');
    }
  };

  const previewDocument = async item => {
    const file = item.versions[0]?.files?.[0];
    if (!file?.id) return alert('No hay un archivo visualizable.');
    try {
      const response = await api.get(`/periods/${item.periodId}/documents/${file.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      alert('No se pudo visualizar el documento.');
    }
  };

  const handleSaveUpload = (newUploadData) => {
    const persistUpload = async () => {
      try {
        const client = clients.find(item => String(item.ruc) === String(newUploadData.clientRuc));
        const { data } = await api.get('/periods', { params: { clientId: client.id, year: String(year) } });
        const period = (data.data || []).find(item => item.month === newUploadData.month);
        if (!period) throw new Error('No existe un periodo aperturado para ese mes.');
        const payload = new FormData();
        payload.append('files', newUploadData.file);
        payload.append('group', documentGroup);
        payload.append('types', documentGroup === 'Portfolio' ? 'receivable' : 'balance');
        await api.post(`/periods/${period.id}/documents`, payload);
        setShowUploadModal(false);
        setTargetClientRuc(null);
        window.location.reload();
      } catch (error) {
        alert(error?.response?.data?.error || error?.message || 'No se pudo guardar el archivo.');
      }
    };
    void persistUpload();
    return;
    setStatements(prev => {
      const existingIdx = prev.findIndex(s => s.clientRuc === newUploadData.clientRuc && s.month === newUploadData.month && s.year === String(year));
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const nextVersionNum = `v${existing.versions.length + 1}.0`;
        const newVersionObj = {
          version: nextVersionNum,
          fileName: newUploadData.fileName,
          fileSize: newUploadData.fileSize || '1.1 MB',
          uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          uploadedBy: 'Andrea López',
          notes: newUploadData.notes || 'Nueva actualización de estado financiero.'
        };
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          versions: [newVersionObj, ...existing.versions]
        };
        return updated;
      } else {
        const newRecord = {
          id: `fs-${Date.now()}`,
          clientRuc: newUploadData.clientRuc,
          clientName: newUploadData.clientName,
          year: String(year),
          month: newUploadData.month,
          monthNum: MONTHS.findIndex(m => m.name === newUploadData.month) + 1,
          deliveryStatus: 'Pendiente',
          versions: [
            {
              version: 'v1.0',
              fileName: newUploadData.fileName,
              fileSize: newUploadData.fileSize || '1.2 MB',
              uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
              uploadedBy: 'Andrea López',
              notes: newUploadData.notes || 'Carga inicial del estado financiero.'
            }
          ]
        };
        return [newRecord, ...prev];
      }
    });
    setShowUploadModal(false);
    setTargetClientRuc(null);
  };

  return (
    <div className="content financial-statements-module">
      <section className="welcome">
        <div>
          <p className="eyebrow">{moduleTitle.toUpperCase()}</p>
          <h2>{moduleTitle}</h2>
          <p>Carga de archivos Excel, control de versiones y estado de entrega al cliente.</p>
        </div>
      </section>

      {isAdmin && <section className="panel clients-registry"><div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar sus archivos.</p></div></div><div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{assignedUsers.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { setSelectedUser(userName); setSelectedClient(''); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table></div></section>}

      {(!isAdmin || selectedUser) && <section id="assigned-clients-section" className="panel period-client-selector">
        <div className="panel-head"><div><h3>Clientes</h3><p>Selecciona un cliente para consultar sus estados financieros.</p></div></div>
        <div className="search period-client-search"><Icon name="search" size={18}/><input placeholder="Buscar cliente por nombre o RUC..." value={clientSearch} onChange={e => setClientSearch(e.target.value)}/></div>
        <div className="period-client-list">
          {visibleClients.filter(client => `${client.name} ${client.ruc}`.toLowerCase().includes(clientSearch.toLowerCase())).map(client => <div key={client.ruc} className={`period-client-row ${String(selectedClient) === String(client.ruc) ? 'selected' : ''}`}>
            <div><strong>{client.name}</strong><small>RUC/Cédula {client.ruc} · {client.owner || ''}</small></div>
            <em className="badge green">{client.clientStatus || 'Activo'}</em>
            <button type="button" className="edit-btn" onClick={() => selectFinancialClientAndScroll(client.ruc)}>{clientActionLabel}</button>
          </div>)}
          {!visibleClients.filter(client => `${client.name} ${client.ruc}`.toLowerCase().includes(clientSearch.toLowerCase())).length && <div className="empty">No se encontraron clientes.</div>}
        </div>
      </section>}

      {selectedClient && <section ref={financialResultsRef} className="panel">
        <div className="panel-head">
          <div>
            <h3>Reportes de {moduleTitle} del cliente seleccionado</h3>
            {selectedClientInfo && <strong className="selected-module-client">{selectedClientInfo.name} · RUC/Cédula {selectedClientInfo.ruc}</strong>}
            <p>Monitoreo de entregables, historial de versiones y estado de notificación.</p>
          </div>
          {returnToPeriod && <button type="button" className="return-period-btn" onClick={() => navigate(`/periodos-contables?client=${selectedClient}&year=${selectedYear === 'ALL' ? year : selectedYear}&month=${encodeURIComponent(selectedMonth === 'ALL' ? routeParams.get('month') || '' : selectedMonth)}&openPeriod=1`)}><Icon name="arrow" size={15}/> Regresar al periodo</button>}
        </div>

        <div className="fs-filter-bar">
          <div className="filter-selects">
             <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
               <option value="ALL">Todos los años</option>
               {clientYears.map(item => <option key={item} value={item}>Año fiscal {item}</option>)}
             </select>
             <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              <option value="ALL">Todos los meses</option>
              {financialMonths.map(month => <option key={month} value={month}>{month}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos los estados de envío</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Enviado">Enviado</option>
              <option value="Entregado">Entregado</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>PERIODO</th>
                <th>ARCHIVO EXCEL ACTUAL</th>
                <th>VERSIONADO</th>
                <th>FECHA Y USUARIO DE CARGA</th>
                <th>ESTADO DE ENVÍO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loadingStatements ? (
                <tr><td colSpan="7" className="empty">Cargando estados financieros...</td></tr>
              ) : filteredStatements.map((item, index) => {
                const latestVersion = item.versions[0];
                const statusTone = item.deliveryStatus === 'Entregado' ? 'green' : item.deliveryStatus === 'Enviado' ? 'blue' : 'orange';
                const previousItem = filteredStatements[index - 1];
                const showMonthHeader = selectedMonth === 'ALL' && (!previousItem || previousItem.month !== item.month || String(previousItem.year) !== String(item.year));

                return (
                  <Fragment key={item.id}>
                  {showMonthHeader && <tr className="month-group-row"><td colSpan="7"><strong>{item.month} {item.year}</strong></td></tr>}
                  <tr>
                    <td>
                      <strong>{item.clientName}</strong>
                      <small>RUC {item.clientRuc}</small>
                    </td>
                    <td>
                      <strong>{item.month}</strong>
                      <small>{item.year}</small>
                    </td>
                    <td>
                      <div className="excel-file-badge">
                        <Icon name="file" size={20}/>
                        <div>
                        <strong>{item.documentLabel || latestVersion.fileName}</strong>
                          <small>{latestVersion.fileSize}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button 
                        className="version-pill" 
                        onClick={() => setHistoryRecord(item)}
                        title="Ver historial de versiones"
                      >
                        <span>{latestVersion.version}</span>
                        <span className="v-count">({item.versions.length} ver.)</span>
                      </button>
                    </td>
                    <td>
                      <strong>{latestVersion.uploadedBy}</strong>
                      <small>{latestVersion.uploadedAt}</small>
                    </td>
                    <td>
                      <span className={`delivery-status-select ${statusTone}`} aria-label={`Estado de envío: ${item.deliveryStatus}`}>
                        {item.deliveryStatus}
                      </span>
                      <button type="button" className="icon-action-btn" title="Cambiar estado de entrega" onClick={() => handleDeliveryStatusChange(item.id, item.deliveryStatus === 'Pendiente' ? 'Enviado' : item.deliveryStatus === 'Enviado' ? 'Entregado' : 'Pendiente')}>↻</button>
                    </td>
                    <td>
                      <div className="action-buttons-wrap">
                        <button className="icon-action-btn" title="Visualizar documento" onClick={() => previewDocument(item)}>
                          <Icon name="file" size={15}/>
                        </button>
                        <button 
                          className="icon-action-btn" 
                          title="Ver historial de versiones"
                          onClick={() => setHistoryRecord(item)}
                        >
                          <Icon name="history" size={15}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!loadingStatements && !filteredStatements.length && <div className="empty">No se encontraron estados financieros registrados para este periodo.</div>}
        </div>
      </section>}

      {showUploadModal && (
        <UploadExcelModal 
          moduleTitle="Estados Financieros"
          clients={clients} 
          defaultRuc={targetClientRuc}
          onClose={() => { setShowUploadModal(false); setTargetClientRuc(null); }} 
          onSave={handleSaveUpload}
        />
      )}

      {historyRecord && (
        <VersionHistoryModal 
          record={historyRecord} 
          onClose={() => setHistoryRecord(null)}
        />
      )}
      {showFinancialFilesModal && <FinancialFilesModal documents={FINANCIAL_DOCUMENTS} files={financialFiles} onClose={() => setShowFinancialFilesModal(false)} onSave={files => { setFinancialFiles(files); setShowFinancialFilesModal(false); }} />}
    </div>
  );
}

/* ==========================================================================
   MÓDULO 4: CUENTAS POR COBRAR Y PAGAR (CXC Y CXP)
   ========================================================================== */
function WorkflowModule({ clients, year, workflow, setWorkflow }) {
  const [clientRuc, setClientRuc] = useState(clients[0]?.ruc || ''), [month, setMonth] = useState('Julio');
  const current = workflow.find(item => item.clientRuc === clientRuc && item.year === String(year) && item.month === month);
  const steps = [['financial', 'Estados Financieros'], ['accounts', 'CxC / CxP'], ['iva', 'IVA PDF'], ['retentions', 'Retenciones PDF'], ['tax', 'Impuesto a la Renta']];
  const update = key => setWorkflow(old => old.map(item => item.id === current?.id ? { ...item, [key]: !item[key] } : item));
  const complete = () => { if (current && steps.every(([key]) => current[key])) setWorkflow(old => old.map(item => item.id === current.id ? { ...item, completed: true } : item)); };
  const share = () => { if (current?.completed) setWorkflow(old => old.map(item => item.id === current.id ? { ...item, shared: true } : item)); };
  return <div className="content workflow-module"><section className="welcome"><div><p className="eyebrow">FLUJO OPERATIVO · DATOS LOCALES</p><h2>Flujo general</h2><p>Completa cada etapa del periodo en orden. Los cambios se guardan en esta sesión.</p></div></section><section className="panel"><div className="workflow-selectors"><label>Cliente<select value={clientRuc} onChange={e => setClientRuc(e.target.value)}>{clients.map(c => <option key={c.ruc} value={c.ruc}>{c.name}</option>)}</select></label><label>Año<select value={year} disabled><option>{year}</option></select></label><label>Mes<select value={month} onChange={e => setMonth(e.target.value)}>{MONTHS.map(m => <option key={m.name}>{m.name}</option>)}</select></label></div>{current && <><div className="flow-progress"><strong>{current.completed ? 'Periodo completado' : `${steps.filter(([key]) => current[key]).length} de ${steps.length} etapas completadas`}</strong><div className="progress-line"><span style={{ width: `${steps.filter(([key]) => current[key]).length / steps.length * 100}%` }}/></div></div><div className="flow-steps">{steps.map(([key, label], index) => <button key={key} className={`flow-step-card ${current[key] ? 'complete' : ''}`} onClick={() => update(key)} disabled={current.completed}><span>{current[key] ? '✓' : index + 1}</span><strong>{label}</strong><small>{current[key] ? 'Registrado' : 'Pendiente · hacer clic para simular carga'}</small></button>)}</div><div className="flow-actions"><button className="primary" onClick={complete} disabled={current.completed || !steps.every(([key]) => current[key])}>Marcar periodo como completado</button><button className="outline" onClick={share} disabled={!current.completed}>{current.shared ? 'Documentación compartida' : 'Compartir documentación'}</button></div>{current.completed && <div className="form-success">Periodo {current.month} {current.year} listo para compartir.</div>}</>}</section></div>;
}

function IncomeTaxModule({ clients, year }) {
  const [clientRuc, setClientRuc] = useState(clients[0]?.ruc || ''), [taxpayer, setTaxpayer] = useState('Sociedad'), [regime, setRegime] = useState('Régimen general'), [accounting, setAccounting] = useState('Sí'), [taxType, setTaxType] = useState('Impuesto a la renta'), [rate, setRate] = useState('25'), [formula, setFormula] = useState('Base imponible × porcentaje'), [periodicity, setPeriodicity] = useState('Anual'), [ivaBase, setIvaBase] = useState(''), [retentionBase, setRetentionBase] = useState(''), [enabled, setEnabled] = useState(true), [saved, setSavedState] = useState(false);
  const setSaved = value => { setSavedState(value); if (value) void saveTaxConfiguration(); };
  const base = (Number(ivaBase) || 0) + (Number(retentionBase) || 0);
  const saveTaxConfiguration = async () => { const client = clients.find(item => item.ruc === clientRuc); if (!client?.id) return; try { await api.put(`/clients/${client.id}/income-tax/${year}`, { taxpayer, regime, accounting, taxType: 'Impuesto a la renta', rate, formula, periodicity, enabled }); setSavedState(true); } catch { setSavedState(false); alert('No se pudo guardar la configuración.'); } };
  useEffect(() => { const client = clients.find(item => item.ruc === clientRuc); if (!client?.id) return; api.get(`/clients/${client.id}/income-tax/${year}`).then(({ data }) => { const config = data.data?.configuration; const baseData = data.data?.base || {}; if (config) { setTaxpayer(config.taxpayer); setRegime(config.regime); setAccounting(config.accounting === 'Yes' ? 'Sí' : config.accounting); setTaxType(config.taxType || 'Impuesto a la renta'); setRate(String(config.rate ?? '25')); setFormula(config.formula || 'Base imponible × porcentaje'); setPeriodicity(config.periodicity || 'Anual'); setEnabled(Boolean(config.enabled)); } setIvaBase(String(baseData.iva || 0)); setRetentionBase(String(baseData.retentions || 0)); }).catch(() => {}); }, [clientRuc, year, clients]);
  useEffect(() => {
    const client = clients.find(item => item.ruc === clientRuc);
    if (!client?.id) { setIvaBase(''); setRetentionBase(''); return; }
    api.get('/periods', { params: { clientId: client.id, year } }).then(async ({ data }) => {
      const declarations = await Promise.all((data.data || []).map(period => api.get(`/periods/${period.id}/declaration`).then(response => response.data.data).catch(() => null)));
      setIvaBase(String(declarations.reduce((sum, item) => sum + (Number(item?.iva) || 0), 0)));
      setRetentionBase(String(declarations.reduce((sum, item) => sum + (Number(item?.retentions) || 0), 0)));
    }).catch(() => { setIvaBase('0'); setRetentionBase('0'); });
  }, [clientRuc, year, clients]);
  return <div className="content tax-module"><section className="welcome"><div><p className="eyebrow">MÓDULO 6 · CONFIGURACIÓN {year}</p><h2>Impuesto a la Renta</h2><p>Configura los parámetros tributarios por empresa y año. El cálculo se habilitará posteriormente.</p></div><label className="rule-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/><span>{enabled ? 'Reglas activas' : 'Reglas inactivas'}</span></label></section><div className="tax-grid"><section className="panel"><div className="panel-head"><div><h3>Parámetros tributarios</h3><p>Estos valores quedan asociados al año {year}.</p></div></div><div className="form-grid"><label>Empresa / cliente<select value={clientRuc} onChange={e => setClientRuc(e.target.value)}>{clients.map(c => <option key={c.ruc} value={c.ruc}>{c.name}</option>)}</select></label><label>Tipo de contribuyente<select value={taxpayer} onChange={e => setTaxpayer(e.target.value)}><option>Persona natural</option><option>Sociedad</option><option>Empresa pública</option><option>Otro</option></select></label><label>Régimen tributario<select value={regime} onChange={e => setRegime(e.target.value)}><option>Régimen general</option><option>RIMPE - Emprendedor</option><option>RIMPE - Negocio popular</option><option>Especial</option></select></label><label>Obligado a llevar contabilidad<select value={accounting} onChange={e => setAccounting(e.target.value)}><option>Sí</option><option>No</option></select></label><label>Impuesto aplicable<select value={taxType} onChange={e => setTaxType(e.target.value)}><option>Impuesto a la renta</option><option>Impuesto único</option><option>Exento / no aplica</option></select></label><label>Periodicidad<select value={periodicity} onChange={e => setPeriodicity(e.target.value)}><option>Anual</option><option>Anticipos</option><option>Anual + anticipos</option><option>Otra</option></select></label><label>Porcentaje (%)<input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)}/></label><label>Fórmula de cálculo<input value={formula} onChange={e => setFormula(e.target.value)} placeholder="Ej. Base × porcentaje"/></label></div><div className="modal-actions"><button className="primary" onClick={() => setSaved(true)}><Icon name="check" size={16}/> Guardar configuración</button></div>{saved && <div className="form-success">Configuración guardada para {year}.</div>}</section><section className="panel"><div className="panel-head"><div><h3>Base de cálculo</h3><p>Información acumulada proveniente del Módulo 5.</p></div><span className="config-year">{year}</span></div><div className="form-grid"><label>IVA acumulado<input type="number" min="0" step="0.01" value={ivaBase} onChange={e => setIvaBase(e.target.value)} placeholder="0.00"/></label><label>Retenciones acumuladas<input type="number" min="0" step="0.01" value={retentionBase} onChange={e => setRetentionBase(e.target.value)} placeholder="0.00"/></label></div><div className="tax-base-card"><span>Base acumulada disponible</span><strong>${base.toFixed(2)}</strong><small>IVA + Retenciones · cálculo automático pendiente de desarrollo</small></div><div className="rule-list"><div><span className="rule-dot"/><div><strong>Regla para {taxpayer}</strong><small>{regime} · {accounting === 'Sí' ? 'Obligado' : 'No obligado'} a llevar contabilidad</small></div><b>{enabled ? 'Activa' : 'Inactiva'}</b></div><div><span className="rule-dot blue"/><div><strong>Parámetro anual</strong><small>{taxType} · {periodicity} · {rate}%</small></div><b>{year}</b></div></div></section></div></div>;
}

function AdminAssignedUsers({ clients, title = 'Usuarios / Contadores', description = 'Selecciona un usuario para consultar sus clientes.', onSelect }) {
  const users = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  return <section className="panel clients-registry"><div className="panel-head"><div><h3>{title}</h3><p>{description}</p></div></div><div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{users.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { onSelect(userName); window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table>{!users.length && <div className="empty">No hay usuarios con clientes asignados.</div>}</div></section>;
}

function DeclarationsPage({ clients, year, isAdmin = false, globalClientRuc = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const readOnly = params.get('readonly') === '1';
  const [selectedUser, setSelectedUser] = useState('');
  const selectedClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  if (!readOnly && isAdmin) return <div className="content declarations-module"><AdminAssignedUsers clients={clients} title="Usuarios / Contadores" description="Selecciona un usuario para consultar sus declaraciones." onSelect={setSelectedUser} />{selectedUser && <div id="assigned-clients-section"><DeclarationsBrowser clients={selectedClients} year={year} /></div>}</div>;
  if (!readOnly) return <DeclarationsBrowser clients={clients} year={year} globalClientRuc={globalClientRuc} />;
  const returnToPeriod = params.get('return') === 'period-modal';
  return <div className="declaration-return-wrapper">{returnToPeriod && <button type="button" className="return-period-btn return-period-floating" onClick={() => navigate(`/periodos-contables?client=${params.get('client') || ''}&year=${params.get('year') || year}&month=${encodeURIComponent(params.get('month') || '')}&openPeriod=1`)}><Icon name="arrow" size={15}/> Regresar al periodo</button>}<DeclarationReadonlyCards clients={clients} year={params.get('year') || String(year)} clientRuc={params.get('client') || ''} month={params.get('month') || ''} /></div>;
}

function DeclarationsBrowser({ clients, year, globalClientRuc = '' }) {
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(globalClientRuc);
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [clientYears, setClientYears] = useState([]);
  const declarationResultsRef = useRef(null);
  // Mantiene el cliente del filtro global al cambiar de sección o actualizarlo.
  useEffect(() => {
    if (globalClientRuc) setSelectedClient(globalClientRuc);
    else setSelectedClient('');
  }, [globalClientRuc]);
  useEffect(() => { if (!selectedClient) return; const timer = window.setTimeout(() => declarationResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); return () => window.clearTimeout(timer); }, [selectedClient]);
  const filtered = clients.filter(client => `${client.name} ${client.ruc}`.toLowerCase().includes(search.toLowerCase()));
  const open = client => { setSelectedClient(client.ruc); setSelectedYear('ALL'); setSelectedMonth(''); };
  useEffect(() => { const client = clients.find(item => item.ruc === selectedClient); if (!client?.id) { setClientYears([]); return; } api.get('/periods/years', { params: { clientId: client.id } }).then(({ data }) => setClientYears(data.data || [])).catch(() => setClientYears([])); }, [selectedClient, clients]);
  return <div className="content declarations-module declarations-readonly"><section className="welcome"><div><h2>Declaraciones mensuales</h2><p>Selecciona un cliente para consultar sus valores y documentos PDF.</p></div></section><section className="panel declarations-client-panel"><div className="panel-head"><div><h3>Clientes</h3><p>Busca y selecciona el cliente que deseas consultar.</p></div></div><div className="client-search-field"><Icon name="search" size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente por nombre o RUC..." /></div><div className="declarations-client-list">{filtered.map(client => <div className={`declarations-client-row ${selectedClient === client.ruc ? 'selected' : ''}`} key={client.ruc}><div><strong>{client.name}</strong><small>RUC/Cédula {client.ruc} · {client.owner || 'Cliente activo'}</small></div><span className="client-status">Activo</span><button type="button" className="outline-btn" onClick={() => open(client)}>Ver declaraciones</button></div>)}{!filtered.length && <div className="empty">No se encontraron clientes.</div>}</div></section>{selectedClient && <><section ref={declarationResultsRef} className="declaration-filters panel"><div><small>CLIENTE SELECCIONADO</small><strong>{clients.find(item => item.ruc === selectedClient)?.name}</strong></div><select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}><option value="ALL">Todos los años</option>{clientYears.map(item => <option key={item} value={item}>{`Año fiscal ${item}`}</option>)}</select><select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}><option value="">Todos los meses</option>{MONTHS.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></section><DeclarationReadonlyCards clients={clients} year={selectedYear} clientRuc={selectedClient} month={selectedMonth} /></>}</div>;
}

function DeclarationReadonlyCards({ clients, year, clientRuc, month }) {
  const [rows, setRows] = useState([]);
  const client = clients.find(item => item.ruc === clientRuc);
  useEffect(() => {
    api.get('/periods', { params: { ...(year !== 'ALL' ? { year } : {}), ...(client?.id ? { clientId: client.id } : {}) } }).then(async ({ data }) => {
      const periods = (data.data || []).filter(item => !month || item.month === month);
      const result = await Promise.all(periods.map(async period => ({ period, declaration: (await api.get(`/periods/${period.id}/declaration`)).data.data })));
      setRows(result.filter(item => item.declaration));
    }).catch(() => setRows([]));
  }, [client?.id, year, month]);
  const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  const openPdf = async (periodId, documentId) => {
    if (!documentId) return;
    try {
      const response = await api.get(`/periods/${periodId}/documents/${documentId}/download`, { responseType: 'blob' });
      window.open(URL.createObjectURL(response.data), '_blank', 'noopener,noreferrer');
    } catch { alert('No se pudo visualizar el archivo.'); }
  };
  return <div className="content declarations-module declarations-readonly"><section className="welcome"><div><p className="eyebrow">MÓDULO 5 · {year} · SOLO LECTURA</p><h2>Declaraciones mensuales</h2><p>Consulta las declaraciones y visualiza los PDFs cargados.</p></div></section><section className="declaration-context"><div><small>CLIENTE</small><strong>{clientRuc ? client?.name || clientRuc : 'Todos los clientes'}</strong></div><div><small>AÑO FISCAL</small><strong>{year}</strong></div><div><small>MES</small><strong>{month || 'Todos los meses'}</strong></div><span className="readonly-pill"><Icon name="eye" size={14}/> Solo lectura</span></section><section className="declaration-cards">{rows.map(({ period, declaration }) => <article className="declaration-card" key={period.id}><div className="declaration-card-head"><div><span className="declaration-month">{period.month}</span><h3>{period.clientName}</h3><small>RUC {period.clientRuc} · Año fiscal {period.year}</small></div><span className="readonly-pill"><Icon name="eye" size={13}/> Consulta</span></div><div className="declaration-values"><div><small>IVA declarado</small><strong>{money(declaration.iva)}</strong></div><div><small>Retenciones</small><strong>{money(declaration.retentions)}</strong></div><div className="declaration-total-card"><small>Total mensual</small><strong>{money(Number(declaration.iva) + Number(declaration.retentions))}</strong></div></div><div className="declaration-files"><div><Icon name="file" size={16}/><span><small>PDF de IVA</small><strong>{declaration.ivaFile || 'No cargado'}</strong></span>{declaration.ivaDocumentId && <button type="button" className="row-upload-btn" title="Visualizar PDF" onClick={() => openPdf(period.id, declaration.ivaDocumentId)}><Icon name="eye" size={14}/></button>}</div><div><Icon name="file" size={16}/><span><small>PDF de retenciones</small><strong>{declaration.retentionFile || 'No cargado'}</strong></span>{declaration.retentionDocumentId && <button type="button" className="row-upload-btn" title="Visualizar PDF" onClick={() => openPdf(period.id, declaration.retentionDocumentId)}><Icon name="eye" size={14}/></button>}</div></div></article>)}{!rows.length && <div className="empty">No hay declaraciones registradas.</div>}</section></div>;
}

function DeclarationReadonlyList({ clients, year, clientRuc, month }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const client = clients.find(item => item.ruc === clientRuc);
    api.get('/periods', { params: { year, ...(client?.id ? { clientId: client.id } : {}) } }).then(async ({ data }) => {
      const periods = (data.data || []).filter(item => !month || item.month === month);
      const result = await Promise.all(periods.map(async period => ({ period, declaration: (await api.get(`/periods/${period.id}/declaration`)).data.data })));
      setRows(result.filter(item => item.declaration));
    }).catch(() => setRows([]));
  }, [clients, year, clientRuc, month]);
  const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  return <div className="content declarations-module"><section className="welcome"><div><p className="eyebrow">MÓDULO 5 · {year} · SOLO LECTURA</p><h2>Declaraciones mensuales</h2><p>Consulta los valores y documentos registrados. La carga y edición se realiza desde períodos contables.</p></div></section><section className="panel"><div className="panel-head"><div><h3>Histórico de declaraciones</h3><p>{clientRuc ? `Cliente: ${clients.find(item => item.ruc === clientRuc)?.name || clientRuc}` : 'Todos los clientes'}</p></div></div><div className="table-wrap"><table><thead><tr><th>CLIENTE / PERÍODO</th><th>IVA</th><th>RETENCIONES</th><th>TOTAL</th><th>DOCUMENTOS</th></tr></thead><tbody>{rows.map(({ period, declaration }) => <tr key={period.id}><td><strong>{period.clientName}</strong><small>{period.month} {period.year}</small></td><td>{money(declaration.iva)}</td><td>{money(declaration.retentions)}</td><td><strong>{money(Number(declaration.iva) + Number(declaration.retentions))}</strong></td><td><small>{[declaration.ivaFile, declaration.retentionFile].filter(Boolean).join(' · ') || 'Sin documentos'}</small></td></tr>)}</tbody></table>{!rows.length && <div className="empty">No hay declaraciones registradas.</div>}</div></section></div>;
}

function DeclarationReadonlyModule({ clients, year, clientRuc, selectedYear, month }) {
  const [declaration, setDeclaration] = useState(null);
  const client = clients.find(item => item.ruc === clientRuc);
  useEffect(() => {
    if (!client?.id) return;
    api.get('/periods', { params: { clientId: client.id, year: selectedYear } }).then(async ({ data }) => {
      const period = (data.data || []).find(item => item.month === month);
      if (period) setDeclaration((await api.get(`/periods/${period.id}/declaration`)).data.data);
    }).catch(() => setDeclaration(null));
  }, [client?.id, selectedYear, month]);
  const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  return <div className="content declarations-module"><section className="welcome"><div><p className="eyebrow">DECLARACIONES · SOLO LECTURA</p><h2>Declaración mensual</h2><p>{client?.name || 'Cliente'} · {month} {selectedYear}</p></div></section><section className="panel"><div className="panel-head"><div><h3>Detalle de declaración</h3><p>Los documentos y valores se muestran únicamente para consulta.</p></div></div>{declaration ? <div className="form-grid"><label>Valor IVA ($)<input value={money(declaration.iva)} readOnly /></label><label>Valor retenciones ($)<input value={money(declaration.retentions)} readOnly /></label><label className="full-width">PDF de IVA<input value={declaration.ivaFile || 'No cargado'} readOnly /></label><label className="full-width">PDF de retenciones<input value={declaration.retentionFile || 'No cargado'} readOnly /></label><div className="declaration-total"><span>Total mensual</span><strong>{money(Number(declaration.iva) + Number(declaration.retentions))}</strong></div></div> : <div className="empty">No se encontró una declaración registrada para este período.</div>}</section></div>;
}

function DeclarationsModule({ clients, year }) {
  const [rows, setRows] = useState([]), [clientRuc, setClientRuc] = useState(clients[0]?.ruc || ''), [month, setMonth] = useState('Julio'), [iva, setIva] = useState(''), [retentions, setRetentions] = useState(''), [ivaFile, setIvaFile] = useState(null), [retentionFile, setRetentionFile] = useState(null), [historyYear, setHistoryYear] = useState(String(year)), [message, setMessage] = useState('');
  const money = v => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(v || 0), num = v => Number(String(v).replace(',', '.')) || 0;
  const annual = rows.filter(r => r.year === historyYear), total = key => annual.reduce((s, r) => s + r[key], 0);
  const pdf = (file, setFile, setValue) => { setFile(file); const m = file?.name.match(/(?:^|[_ -])(\d+[.,]\d{1,2})(?=\.|$)/); if (m) setValue(m[1].replace(',', '.')); };
  const save = e => { e.preventDefault(); if (!iva && !retentions) return setMessage('Registra al menos un valor declarado.'); const client = clients.find(c => c.ruc === clientRuc), i = num(iva), r = num(retentions), row = { id: `${clientRuc}-${year}-${month}`, clientName: client?.name || 'Cliente', year: String(year), month, iva: i, retentions: r, total: i + r, ivaFile: ivaFile?.name || '', retentionFile: retentionFile?.name || '' }; setRows(old => [row, ...old.filter(x => x.id !== row.id)]); setMessage('Declaración guardada correctamente.'); setIva(''); setRetentions(''); setIvaFile(null); setRetentionFile(null); };
  return <div className="content declarations-module"><section className="welcome"><div><p className="eyebrow">MÓDULO 5 · {year}</p><h2>Declaraciones mensuales</h2><p>Carga PDFs de IVA y retenciones, registra los valores y consulta el histórico anual.</p></div></section><section className="metrics declarations-metrics"><Metric icon="receipt" title="Total anual" value={money(total('total'))} note={`${historyYear} · ${annual.length} meses`} tone="violet"/><Metric icon="file" title="Meses registrados" value={annual.length} note="Declaraciones guardadas" tone="blue"/><Metric icon="shield" title="IVA acumulado" value={money(total('iva'))} note="Año consultado" tone="green"/><Metric icon="wallet" title="Retenciones" value={money(total('retentions'))} note="Año consultado" tone="orange"/></section><div className="declarations-grid"><form className="panel declaration-form" onSubmit={save}><div className="panel-head"><div><h3>Registrar declaración</h3><p>El total mensual se calcula automáticamente.</p></div></div><div className="form-grid"><label>Cliente *<select value={clientRuc} onChange={e => setClientRuc(e.target.value)}>{clients.map(c => <option key={c.ruc} value={c.ruc}>{c.name}</option>)}</select></label><label>Mes *<select value={month} onChange={e => setMonth(e.target.value)}>{MONTHS.map(m => <option key={m.name}>{m.name}</option>)}</select></label><label>Valor IVA ($)<input type="number" min="0" step="0.01" value={iva} onChange={e => setIva(e.target.value)} placeholder="0.00"/></label><label>Valor retenciones ($)<input type="number" min="0" step="0.01" value={retentions} onChange={e => setRetentions(e.target.value)} placeholder="0.00"/></label><label className="full-width">PDF de IVA<input type="file" accept=".pdf,application/pdf" onChange={e => pdf(e.target.files?.[0], setIvaFile, setIva)}/><small className="input-hint">Opcional; registra el valor manualmente si no se puede extraer.</small></label><label className="full-width">PDF de retenciones<input type="file" accept=".pdf,application/pdf" onChange={e => pdf(e.target.files?.[0], setRetentionFile, setRetentions)}/></label></div><div className="declaration-total"><span>Total mensual</span><strong>{money(num(iva) + num(retentions))}</strong></div>{message && <div className="form-success">{message}</div>}<div className="modal-actions"><button className="primary"><Icon name="check" size={16}/> Guardar declaración</button></div></form><section className="panel"><div className="panel-head"><div><h3>Histórico anual</h3><p>Consulta las declaraciones guardadas por año.</p></div><select className="year-select-dropdown" value={historyYear} onChange={e => setHistoryYear(e.target.value)}><option>{year}</option><option>{Number(year) - 1}</option></select></div><div className="table-wrap"><table><thead><tr><th>MES / CLIENTE</th><th>IVA</th><th>RETENCIONES</th><th>TOTAL</th><th>PDF</th></tr></thead><tbody>{annual.map(row => <tr key={row.id}><td><strong>{row.month}</strong><small>{row.clientName}</small></td><td>{money(row.iva)}</td><td>{money(row.retentions)}</td><td><strong>{money(row.total)}</strong></td><td><small>{[row.ivaFile, row.retentionFile].filter(Boolean).length}/2 archivos</small></td></tr>)}</tbody></table>{!annual.length && <div className="empty">Aún no hay declaraciones registradas para {historyYear}.</div>}</div></section></div></div>;
}

function AccountsModule({ clients, year }) {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [targetClientRuc, setTargetClientRuc] = useState(null);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(item => {
      const matchYear = item.year === String(year);
      const matchClient = selectedClient === 'ALL' || item.clientRuc === selectedClient;
      const matchStatus = statusFilter === 'ALL' || item.deliveryStatus === statusFilter;
      const matchSearch = item.clientName.toLowerCase().includes(search.toLowerCase()) ||
                          item.clientRuc.includes(search) ||
                          item.month.toLowerCase().includes(search.toLowerCase());
      return matchYear && matchClient && matchStatus && matchSearch;
    });
  }, [accounts, year, selectedClient, statusFilter, search]);

  const handleDeliveryStatusChange = (id, newStatus) => {
    setAccounts(prev => prev.map(s => s.id === id ? { ...s, deliveryStatus: newStatus } : s));
  };

  const handleSaveUpload = (newUploadData) => {
    setAccounts(prev => {
      const existingIdx = prev.findIndex(s => s.clientRuc === newUploadData.clientRuc && s.month === newUploadData.month && s.year === String(year));
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const nextVersionNum = `v${existing.versions.length + 1}.0`;
        const newVersionObj = {
          version: nextVersionNum,
          fileName: newUploadData.fileName,
          fileSize: newUploadData.fileSize || '1.1 MB',
          uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          uploadedBy: 'Andrea López',
          notes: newUploadData.notes || 'Nueva actualización de reporte CxC/CxP.'
        };
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          versions: [newVersionObj, ...existing.versions]
        };
        return updated;
      } else {
        const newRecord = {
          id: `cx-${Date.now()}`,
          clientRuc: newUploadData.clientRuc,
          clientName: newUploadData.clientName,
          year: String(year),
          month: newUploadData.month,
          monthNum: MONTHS.findIndex(m => m.name === newUploadData.month) + 1,
          deliveryStatus: 'Pendiente',
          versions: [
            {
              version: 'v1.0',
              fileName: newUploadData.fileName,
              fileSize: newUploadData.fileSize || '1.2 MB',
              uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
              uploadedBy: 'Andrea López',
              notes: newUploadData.notes || 'Carga inicial de reporte CxC/CxP.'
            }
          ]
        };
        return [newRecord, ...prev];
      }
    });
    setShowUploadModal(false);
    setTargetClientRuc(null);
  };

  return (
    <div className="content financial-statements-module">
      <section className="welcome">
        <div>
          <p className="eyebrow">CXC Y CXP</p>
          <h2>Cuentas por Cobrar y Pagar</h2>
          <p>Sube el archivo Excel de cartera de clientes/proveedores, controla versiones y el estado de entrega.</p>
        </div>
        <button className="primary" onClick={() => setShowUploadModal(true)}>
          <Icon name="upload" size={18}/> Cargar reporte Excel
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Reportes de Cartera · Año {year}</h3>
            <p>Monitoreo de entregables de CxC/CxP en Excel, historial de versiones y estado de notificación.</p>
          </div>
        </div>

        <div className="fs-filter-bar">
          <div className="search filter-search">
            <Icon name="search" size={18}/>
            <input 
              placeholder="Buscar por cliente, mes o RUC..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-selects">
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
              <option value="ALL">Todos los clientes ({clients.length})</option>
              {clients.map(c => (
                <option key={c.ruc} value={c.ruc}>{c.name}</option>
              ))}
            </select>

            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos los estados de envío</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Enviado">Enviado</option>
              <option value="Entregado">Entregado</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>PERIODO</th>
                <th>ARCHIVO EXCEL ACTUAL</th>
                <th>VERSIONADO</th>
                <th>FECHA Y USUARIO DE CARGA</th>
                <th>ESTADO DE ENVÍO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map(item => {
                const latestVersion = item.versions[0];
                const statusTone = item.deliveryStatus === 'Entregado' ? 'green' : item.deliveryStatus === 'Enviado' ? 'blue' : 'orange';

                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.clientName}</strong>
                      <small>RUC {item.clientRuc}</small>
                    </td>
                    <td>
                      <strong>{item.month}</strong>
                      <small>{item.year}</small>
                    </td>
                    <td>
                      <div className="excel-file-badge">
                        <Icon name="file" size={20}/>
                        <div>
                          <strong>{latestVersion.fileName}</strong>
                          <small>{latestVersion.fileSize}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button 
                        className="version-pill" 
                        onClick={() => setHistoryRecord(item)}
                        title="Ver historial de versiones"
                      >
                        <span>{latestVersion.version}</span>
                        <span className="v-count">({item.versions.length} ver.)</span>
                      </button>
                    </td>
                    <td>
                      <strong>{latestVersion.uploadedBy}</strong>
                      <small>{latestVersion.uploadedAt}</small>
                    </td>
                    <td>
                      <select 
                        className={`delivery-status-select ${statusTone}`}
                        value={item.deliveryStatus}
                        onChange={(e) => handleDeliveryStatusChange(item.id, e.target.value)}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Enviado">Enviado</option>
                        <option value="Entregado">Entregado</option>
                      </select>
                    </td>
                    <td>
                      <div className="action-buttons-wrap">
                        <button 
                          className="icon-action-btn" 
                          title="Cargar nueva versión de este archivo"
                          onClick={() => {
                            setTargetClientRuc(item.clientRuc);
                            setShowUploadModal(true);
                          }}
                        >
                          <Icon name="upload" size={15}/>
                        </button>
                        <button 
                          className="icon-action-btn" 
                          title="Ver historial de versiones"
                          onClick={() => setHistoryRecord(item)}
                        >
                          <Icon name="history" size={15}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredAccounts.length && <div className="empty">No se encontraron reportes de CxC o CxP registrados para este periodo.</div>}
        </div>
      </section>

      {showUploadModal && (
        <UploadExcelModal 
          moduleTitle="Cuentas por Cobrar y Pagar"
          clients={clients} 
          defaultRuc={targetClientRuc}
          onClose={() => { setShowUploadModal(false); setTargetClientRuc(null); }} 
          onSave={handleSaveUpload}
        />
      )}

      {historyRecord && (
        <VersionHistoryModal 
          record={historyRecord} 
          onClose={() => setHistoryRecord(null)}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   COMPONENTES COMPARTIDOS: MODALES
   ========================================================================== */
function UploadExcelModal({ moduleTitle = "Documento", clients, defaultRuc, onClose, onSave }) {
  const [selectedRuc, setSelectedRuc] = useState(defaultRuc || (clients[0] ? clients[0].ruc : ''));
  const [month, setMonth] = useState('Julio');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!selectedRuc) return setError('Selecciona un cliente.');
    if (!file) return setError('Por favor adjunta un archivo Excel (.xlsx, .xls).');

    const clientObj = clients.find(c => c.ruc === selectedRuc);
    onSave({
      clientRuc: selectedRuc,
      clientName: clientObj ? clientObj.name : 'Cliente Seleccionado',
      month,
      file,
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      notes
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">{moduleTitle.toUpperCase()}</p>
        <h2>Cargar {moduleTitle === "Estados Financieros" ? "Estado Financiero" : "Reporte"} Excel</h2>
        <p>Adjunta el archivo correspondiente y registra los detalles de la versión.</p>

        <div className="form-grid">
          <label>Cliente *
            <select value={selectedRuc} onChange={e => setSelectedRuc(e.target.value)}>
              {clients.map(c => (
                <option key={c.ruc} value={c.ruc}>{c.name} ({c.ruc})</option>
              ))}
            </select>
          </label>

          <label>Mes correspondiente *
            <select value={month} onChange={e => setMonth(e.target.value)}>
              {MONTHS.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </label>

          <div className="full-width">
            <label>Archivo Excel (.xlsx, .xls) *</label>
            <div className="file-dropzone">
              <Icon name="file" size={32}/>
              <p>Arrastra tu archivo Excel aquí o <strong>haz clic para examinar</strong></p>
              <small>Formatos permitidos: .xlsx, .xls (Máximo 15MB)</small>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileChange}/>
              {file && (
                <div className="file-selected-badge">
                  Archivo seleccionado: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>
          </div>

          <div className="full-width">
            <label>Notas / Comentarios de la versión
              <input 
                placeholder="Ej. Carga de información actualizada..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
              />
            </label>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button className="primary"><Icon name="upload" size={16}/> Subir versión</button>
        </div>
      </form>
    </div>
  );
}

function VersionHistoryModal({ record, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">HISTORIAL DE VERSIONADO</p>
        <h2>{record.clientName}</h2>
        <p>Historial de entregables para el periodo <strong>{record.month} {record.year}</strong>.</p>

        <div className="versions-timeline">
          {record.versions.map((ver, idx) => (
            <div key={ver.version} className={`version-item ${idx === 0 ? 'active-version' : ''}`}>
              <div className="version-header">
                <span className="version-badge">
                  {ver.version} {idx === 0 && <small>(Actual)</small>}
                </span>
                <span className="version-date">Cargado el {ver.uploadedAt} por <strong>{ver.uploadedBy}</strong></span>
              </div>

              <div className="version-file-box">
                <Icon name="file" size={22}/>
                <div>
                  <strong>{ver.fileName}</strong>
                  {ver.files ? ver.files.map(file => <small key={`${ver.version}-${file.type}`}><strong>{file.type}</strong>: {file.name} {file.size && `(${file.size})`}</small>) : <small>Tamaño: {ver.fileSize}</small>}
                </div>
                <button className="icon-action-btn" title="Descargar esta versión" onClick={() => {
                  const file = ver.files?.[0];
                  if (!file?.id) return alert('Esta versión no tiene un archivo descargable.');
                  api.get(`/periods/${record.periodId}/documents/${file.id}/download`, { responseType: 'blob' }).then(response => {
                    const url = URL.createObjectURL(response.data);
                    const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
                    URL.revokeObjectURL(url);
                  }).catch(error => alert(error?.response?.data?.error || 'No se pudo descargar el archivo.'));
                }}>
                  <Icon name="arrow" size={15}/>
                </button>
              </div>

              {ver.notes && (
                <div className="version-notes">
                  <strong>Observación:</strong> {ver.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button className="primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, title, value, note, tone }) {
  return (
    <div className="metric">
      <div className={`metric-icon ${tone}`}><Icon name={icon}/></div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <small className={tone === 'orange' ? 'warning' : ''}>
          {tone === 'orange' ? '● ' : '↗ '}{note}
        </small>
      </div>
    </div>
  );
}

function ModuleView({ title, setShowModal }) {
  return (
    <div className="content module">
      <p className="eyebrow">MÓDULO DE GESTIÓN</p>
      <h2>{title}</h2>
      <p>Esta sección está lista para conectarse con tus datos y flujos de aprobación.</p>
      <div className="empty-module">
        <div className="empty-icon"><Icon name="file" size={34}/></div>
        <h3>Comienza a gestionar {title.toLowerCase()}</h3>
        <p>Configura los registros y documentos que necesitas para este módulo.</p>
        <button className="primary" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={18}/> Crear nuevo registro
        </button>
      </div>
    </div>
  );
}

function ConfigurationModule({ clients, onRestore, canAudit = false, userRole }) {
  const [activeSection, setActiveSection] = useState('');
  return <div className="content configuration-module">
    <section className="configuration-menu-card">
      <div className="configuration-menu-head">
        <h2>Configuración</h2>
        <p>Administra clientes deshabilitados y consulta la trazabilidad del sistema.</p>
      </div>
      <button type="button" className={`configuration-menu-row ${activeSection === 'disabled' ? 'active' : ''}`} onClick={() => setActiveSection('disabled')}>
        <span className="configuration-menu-icon"><Icon name="users" size={17}/></span>
        <span className="configuration-menu-copy"><strong>Usuarios deshabilitados</strong><small>Clientes ocultos, conservados para mantener su historial.</small></span>
        <Icon name="arrow" size={16}/>
      </button>
      {canAudit && <button type="button" className={`configuration-menu-row ${activeSection === 'audit' ? 'active' : ''}`} onClick={() => setActiveSection('audit')}>
        <span className="configuration-menu-icon"><Icon name="history" size={17}/></span>
        <span className="configuration-menu-copy"><strong>Trazabilidad del sistema</strong><small>Historial de cambios del sistema.</small></span>
        <Icon name="arrow" size={16}/>
      </button>}
    </section>
    {activeSection === 'disabled' && <div className="configuration-detail"><DisabledClientsModule clients={clients} onRestore={onRestore} /></div>}
    {activeSection === 'audit' && canAudit && <div className="configuration-detail"><AuditHistoryPanel userRole={userRole} /></div>}
  </div>;
}

function AuditHistoryPanel({ userRole }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/audit')
      .then(({ data }) => { if (active) setEvents(data.data || []); })
      .catch(() => { if (active) setError('No se pudo cargar el historial de cambios.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => events.reduce((result, event) => {
    const key = event.userName || `Usuario ${event.userId || ''}`;
    (result[key] ||= []).push(event);
    return result;
  }, {}), [events]);
  const actionLabels = { 'client.created': 'Cliente creado', 'client.updated': 'Cliente actualizado', 'client.disabled': 'Cliente deshabilitado', 'client.restored': 'Cliente reactivado', 'document.uploaded': 'Documento cargado', 'document.delivery_status_changed': 'Estado de documento actualizado', 'period.status_changed': 'Estado de periodo actualizado', 'period.shared': 'Periodo compartido' };
  const formatDate = value => value ? new Date(value).toLocaleString('es-EC') : '—';

  return <section className="panel audit-history-panel">
    <div className="panel-head"><div><p className="eyebrow">SEGURIDAD · SOLO LECTURA</p><h3>Historial de cambios</h3><p>{userRole === 'ADMIN' ? 'Eventos agrupados por usuario del sistema.' : 'Eventos de tus clientes asignados.'}</p></div><span className="audit-readonly-badge"><Icon name="eye" size={13}/> Solo lectura</span></div>
    {loading && <div className="empty">Cargando historial...</div>}
    {error && <div className="form-error">{error}</div>}
    {!loading && !error && !events.length && <div className="empty">Aún no hay cambios registrados.</div>}
    {!loading && !error && Object.entries(groups).map(([userName, userEvents]) => <div className="audit-user-group" key={userName}><div className="audit-user-heading"><strong>{userName}</strong><span>{userEvents.length} evento{userEvents.length === 1 ? '' : 's'}</span></div><div className="table-wrap"><table className="audit-table"><thead><tr><th>FECHA</th><th>ACCIÓN</th><th>CLIENTE</th><th>DETALLE</th></tr></thead><tbody>{userEvents.map(event => <tr key={event.id}><td><small>{formatDate(event.createdAt)}</small></td><td><strong>{actionLabels[event.action] || event.action}</strong></td><td>{event.clientName ? <><strong>{event.clientName}</strong><small>RUC {event.clientRuc}</small></> : '—'}</td><td><small>{event.details?.name || event.details?.group || event.details?.type || (event.details?.after ? 'Datos modificados' : 'Actividad registrada')}</small></td></tr>)}</tbody></table></div></div>)}
  </section>;
}

function DisabledClientsModule({ clients, onRestore }) {
  return <div className="content clients-module"><section className="welcome"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>Usuarios deshabilitados</h2><p>Clientes ocultos del sistema principal, conservados para mantener su historial.</p></div></section><section className="panel clients-registry"><div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>RUC / CÉDULA</th><th>DESHABILITADO EL</th><th>ACCIÓN</th></tr></thead><tbody>{clients.map(client => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.email || 'Sin correo registrado'}</small></td><td>{client.ruc}</td><td><small>{client.disabledAt ? new Date(client.disabledAt).toLocaleString('es-EC') : '—'}</small></td><td><button className="edit-btn" onClick={() => onRestore(client)}>Reactivar</button></td></tr>)}</tbody></table>{!clients.length && <div className="empty">No hay clientes deshabilitados.</div>}</div></section></div>;
}

function DisableClientModal({ client, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">DESHABILITAR CLIENTE</p>
        <h2>¿Deshabilitar a {client.name}?</h2>
        <p>El cliente dejará de mostrarse en el sistema principal, pero no se eliminará de la base de datos.</p>
        <div className="form-success" style={{ marginTop: '18px' }}>
          Sus periodos contables y su historial se conservarán. Para reactivarlo, ve a <strong>Configuración → Usuarios deshabilitados</strong> y pulsa <strong>Reactivar</strong>.
        </div>
        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="delete-btn" onClick={onConfirm}>Deshabilitar cliente</button>
        </div>
      </section>
    </div>
  );
}

function FinancialFilesModal({ documents, files, existing = {}, onClose, onSave }) {
  const [selectedFiles, setSelectedFiles] = useState(files || {});
  const updateFile = (key, file) => setSelectedFiles(current => ({ ...current, [key]: file }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal financial-files-modal" onSubmit={event => { event.preventDefault(); onSave(selectedFiles); }} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">ESTADOS FINANCIEROS</p><h2>Agregar archivos Excel</h2><p>Selecciona un archivo Excel para cada informe del periodo.</p><div className="financial-upload-list">{documents.map(([key, label, description]) => <label key={key} className="financial-upload-item"><strong>{label}</strong><small>{description}</small><input type="file" accept=".xlsx,.xls" onChange={event => updateFile(key, event.target.files?.[0] || null)}/>{selectedFiles[key] ? <em>{selectedFiles[key].name}</em> : existing[key] ? <em>Guardado: {existing[key].originalName} · v{existing[key].version}.0</em> : <small>Ningún archivo seleccionado</small>}</label>)}</div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cerrar</button><button type="submit" className="primary"><Icon name="upload" size={16}/> Guardar archivos</button></div></form></div>;
}

// Modal para registrar o editar la declaración mensual del período seleccionado.
// Aquí se cargan los PDFs y se muestran los valores de IVA y retenciones.
function DeclarationPeriodModal({ periodId, existing, onClose, onSave }) {
  const [current, setCurrent] = useState(existing);
  const [iva, setIva] = useState(existing?.iva != null ? String(existing.iva) : '');
  const [retentions, setRetentions] = useState(existing?.retentions != null ? String(existing.retentions) : '');
  const [ivaFile, setIvaFile] = useState(null);
  const [retentionFile, setRetentionFile] = useState(null);
  const [readingIva, setReadingIva] = useState(false);
  const [pdfMessage, setPdfMessage] = useState('');
  useEffect(() => { if (existing) { setCurrent(existing); setIva(String(existing.iva ?? '')); setRetentions(String(existing.retentions ?? '')); } }, [existing]);
  const remove = async type => { if (!window.confirm('¿Eliminar este PDF?')) return; try { const { data } = await api.delete(`/periods/${periodId}/declaration/${type}`); setCurrent(data.data); } catch { alert('No se pudo eliminar el PDF.'); } };
  // Envía temporalmente el PDF al backend para extraer el valor del formulario SRI.
  const selectIvaPdf = async file => {
    setIvaFile(file);
    setPdfMessage('');
    if (!file) return;
    setReadingIva(true);
    // FormData permite enviar el archivo binario en la petición HTTP.
    const formData = new FormData();
    formData.append('file', file);
    try {
      // La respuesta contiene el valor detectado y el código del campo utilizado.
      const { data } = await api.post('/periods/declaration/parse', formData);
      setIva(String(data.data.iva));
      setPdfMessage(`IVA leído automáticamente del campo ${data.data.field} del formulario SRI.`);
    } catch (error) {
      setPdfMessage(error?.response?.data?.error || 'No se pudo leer el valor del PDF. Puedes ingresarlo manualmente.');
    } finally { setReadingIva(false); }
  };
  // Envía los valores y archivos al componente padre para guardarlos en el backend.
  const submit = event => { event.preventDefault(); onSave({ iva, retentions, ivaFile, retentionFile }); };
  // Cada vez que cambia ivaFile, se lee automáticamente el PDF seleccionado.
  useEffect(() => {
    if (!ivaFile) return;
    let cancelled = false;
    const readPdf = async () => {
      setReadingIva(true);
      setPdfMessage('');
      // Se construye un FormData nuevo para el archivo actual.
      const formData = new FormData();
      formData.append('file', ivaFile);
      try {
        // El backend devuelve, por ejemplo, el valor del campo 902 del formulario.
        const { data } = await api.post('/periods/declaration/parse', formData);
        if (!cancelled) {
          setIva(String(data.data.iva));
          setPdfMessage(`IVA leído automáticamente del campo ${data.data.field} del formulario SRI.`);
        }
      } catch (error) {
        if (!cancelled) setPdfMessage(error?.response?.data?.error || 'No se pudo leer el valor del PDF. Puedes ingresarlo manualmente.');
      } finally { if (!cancelled) setReadingIva(false); }
    };
    readPdf();
    return () => { cancelled = true; };
  }, [ivaFile]);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal declaration-period-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">DECLARACIONES</p><h2>Registrar declaración mensual</h2><p>{current ? 'Edita los valores o administra los PDFs guardados.' : 'Primero selecciona el PDF que deseas registrar.'}</p><div className="form-grid"><label>Valor IVA ($)<input type="number" min="0" step="0.01" value={iva} onChange={event => setIva(event.target.value)} placeholder="0.00"/></label><label>Valor retenciones ($)<input type="number" min="0" step="0.01" value={retentions} onChange={event => setRetentions(event.target.value)} placeholder="0.00"/></label><label className="full-width">PDF de IVA{current?.ivaFile && <div className="saved-declaration-file"><Icon name="file" size={15}/><span>{current.ivaFile}</span><button type="button" onClick={() => remove('iva')}>Eliminar</button></div>}<input type="file" accept=".pdf,application/pdf" onChange={event => setIvaFile(event.target.files?.[0] || null)}/>{ivaFile && <small className="input-hint">Nuevo: {ivaFile.name}</small>}</label><label className="full-width">PDF de retenciones{current?.retentionFile && <div className="saved-declaration-file"><Icon name="file" size={15}/><span>{current.retentionFile}</span><button type="button" onClick={() => remove('retentions')}>Eliminar</button></div>}<input type="file" accept=".pdf,application/pdf" onChange={event => setRetentionFile(event.target.files?.[0] || null)}/>{retentionFile && <small className="input-hint">Nuevo: {retentionFile.name}</small>}</label></div><div className="declaration-total"><span>Total mensual</span><strong>${((Number(iva) || 0) + (Number(retentions) || 0)).toFixed(2)}</strong></div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Guardar cambios</button></div></form></div>;
}

function DeclarationPeriodModalLegacy({ existing, onClose, onSave }) {
  const [iva, setIva] = useState(existing?.iva != null ? String(existing.iva) : '');
  const [retentions, setRetentions] = useState(existing?.retentions != null ? String(existing.retentions) : '');
  const [ivaFile, setIvaFile] = useState(null);
  const [retentionFile, setRetentionFile] = useState(null);
  useEffect(() => { if (existing) { setIva(String(existing.iva ?? '')); setRetentions(String(existing.retentions ?? '')); } }, [existing]);
  const hasPdf = Boolean(ivaFile || retentionFile || existing?.ivaFile || existing?.retentionFile);
  const submit = event => {
    event.preventDefault();
    if (hasPdf) onSave({ iva, retentions, ivaFile, retentionFile });
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">DECLARACIONES</p><h2>Registrar declaración mensual</h2><p>Primero selecciona el PDF que deseas registrar.</p><div className="form-grid">{ivaFile && <label>Valor IVA ($)<input type="number" min="0" step="0.01" value={iva} onChange={event => setIva(event.target.value)} placeholder="0.00"/></label>}{retentionFile && <label>Valor retenciones ($)<input type="number" min="0" step="0.01" value={retentions} onChange={event => setRetentions(event.target.value)} placeholder="0.00"/></label>}<label className="full-width">PDF de IVA<input type="file" accept=".pdf,application/pdf" onChange={event => { setIvaFile(event.target.files?.[0] || null); setIva(''); }}/>{ivaFile && <small className="input-hint">{ivaFile.name}</small>}</label><label className="full-width">PDF de retenciones<input type="file" accept=".pdf,application/pdf" onChange={event => { setRetentionFile(event.target.files?.[0] || null); setRetentions(''); }}/>{retentionFile && <small className="input-hint">{retentionFile.name}</small>}</label></div>{hasPdf && <div className="declaration-total"><span>Total mensual</span><strong>${((Number(iva) || 0) + (Number(retentions) || 0)).toFixed(2)}</strong></div>}<div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary" disabled={!hasPdf}><Icon name="check" size={16}/> Guardar declaración</button></div></form></div>;
}

function DeclarationPeriodModalLegacyOld({ onClose, onSave }) {
  const [iva, setIva] = useState('');
  const [retentions, setRetentions] = useState('');
  const [ivaFile, setIvaFile] = useState(null);
  const [retentionFile, setRetentionFile] = useState(null);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={event => { event.preventDefault(); onSave({ iva, retentions, ivaFile, retentionFile }); }} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">DECLARACIONES</p><h2>Registrar declaración mensual</h2><p>Registra IVA y retenciones en un solo formulario para este periodo.</p><div className="form-grid"><label>Valor IVA ($)<input type="number" min="0" step="0.01" value={iva} onChange={event => setIva(event.target.value)} placeholder="0.00"/></label><label>Valor retenciones ($)<input type="number" min="0" step="0.01" value={retentions} onChange={event => setRetentions(event.target.value)} placeholder="0.00"/></label><label className="full-width">PDF de IVA<input type="file" accept=".pdf,application/pdf" onChange={event => setIvaFile(event.target.files?.[0] || null)}/>{ivaFile && <small className="input-hint">{ivaFile.name}</small>}</label><label className="full-width">PDF de retenciones<input type="file" accept=".pdf,application/pdf" onChange={event => setRetentionFile(event.target.files?.[0] || null)}/>{retentionFile && <small className="input-hint">{retentionFile.name}</small>}</label></div><div className="declaration-total"><span>Total mensual</span><strong>${((Number(iva) || 0) + (Number(retentions) || 0)).toFixed(2)}</strong></div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Guardar declaración</button></div></form></div>;
}

function IncomeTaxPeriodModal({ clientId, year, onClose, onSave, readOnly = false }) {
  const [taxpayer, setTaxpayer] = useState('Sociedad');
  const [regime, setRegime] = useState('Régimen general');
  const [accounting, setAccounting] = useState('Sí');
  const [taxType, setTaxType] = useState('Impuesto a la renta');
  const [periodicity, setPeriodicity] = useState('Anual');
  const [rate, setRate] = useState('25');
  const [formula, setFormula] = useState('Base imponible × porcentaje');
  const [enabled, setEnabled] = useState(true);
  const [iva, setIva] = useState('0');
  const [retentions, setRetentions] = useState('0');
  useEffect(() => { const numericRate = Number(rate); if (rate !== '' && Number.isFinite(numericRate) && rate !== numericRate.toFixed(1)) setRate(numericRate.toFixed(1)); }, [rate]);
  useEffect(() => { if (!clientId || !year) return; api.get(`/clients/${clientId}/income-tax/${year}`).then(({ data }) => { const config = data.data?.configuration; const base = data.data?.base || {}; if (config) { setTaxpayer(config.taxpayer || 'Sociedad'); setRegime(config.regime || 'Régimen general'); setAccounting(config.accounting === 'Yes' ? 'Sí' : config.accounting || 'Sí'); setTaxType(config.taxType || 'Impuesto a la renta'); setPeriodicity(config.periodicity || 'Anual'); setRate(String(config.rate ?? '25')); setFormula(config.formula || 'Base imponible × porcentaje'); setEnabled(Boolean(config.enabled)); } setIva(String(base.iva || 0)); setRetentions(String(base.retentions || 0)); }).catch(() => {}); }, [clientId, year]);
  useEffect(() => {
    if (!readOnly) return undefined;
    const modal = document.querySelector('.tax-period-modal');
    if (!modal) return undefined;
    modal.querySelectorAll('input, select').forEach(field => { field.disabled = true; });
    modal.querySelector('.modal-actions .primary')?.setAttribute('hidden', 'true');
    return undefined;
  }, [readOnly]);
  const submit = event => { event.preventDefault(); if (readOnly) return; onSave({ taxpayer, regime, accounting, taxType, periodicity, rate, formula, enabled }); };
  const total = (Number(iva) || 0) + (Number(retentions) || 0);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal tax-period-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">IMPUESTO A LA RENTA · CONFIGURACIÓN DEL PERÍODO</p><h2>Impuesto a la Renta</h2><p>Configura los parámetros tributarios del cliente para el año {year}.</p><div className="tax-grid"><section className="panel"><div className="panel-head"><div><h3>Parámetros tributarios</h3><p>Configurables por cliente y año fiscal.</p></div></div><div className="form-grid"><label>Tipo de contribuyente<select value={taxpayer} onChange={event => setTaxpayer(event.target.value)}><option>Persona natural</option><option>Sociedad</option><option>Empresa pública</option><option>Otro</option></select></label><label>Régimen tributario<select value={regime} onChange={event => setRegime(event.target.value)}><option>Régimen general</option><option>RIMPE - Emprendedor</option><option>RIMPE - Negocio popular</option><option>Especial</option></select></label><label>Obligado a llevar contabilidad<select value={accounting} onChange={event => setAccounting(event.target.value)}><option>Sí</option><option>No</option></select></label><label>Tipo de impuesto aplicable<select value={taxType} onChange={event => setTaxType(event.target.value)}><option>Impuesto a la renta</option><option>Impuesto único</option><option>Exento / no aplica</option></select></label><label>Periodicidad<select value={periodicity} onChange={event => setPeriodicity(event.target.value)}><option>Anual</option><option>Anticipos</option><option>Anual + anticipos</option><option>Otra</option></select></label><label>Porcentaje (%)<input type="number" min="0" step="0.01" value={rate} onChange={event => setRate(event.target.value)}/></label><label className="full-width">Fórmula de cálculo<input value={formula} onChange={event => setFormula(event.target.value)}/></label><label className="rule-toggle full-width"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/><span>{enabled ? 'Reglas activas' : 'Reglas inactivas'}</span></label></div></section><section className="panel"><div className="panel-head"><div><h3>Base anual de cálculo</h3><p>Acumulado automáticamente desde el Módulo 5.</p></div><span className="config-year">{year}</span></div><div className="form-grid"><label>IVA acumulado<input value={iva} readOnly /></label><label>Retenciones acumuladas<input value={retentions} readOnly /></label></div><div className="tax-base-card"><span>Base acumulada disponible</span><strong>${total.toFixed(2)}</strong><small>IVA + Retenciones · histórico anual</small></div></section></div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Guardar configuración</button></div></form></div>;
}

function AnnualTaxSummaryModal({ clientId, year, initialBase = { iva: 0, retentions: 0 }, initialRate = 0, onClose }) {
  const [summary, setSummary] = useState(null);
  const [annualStatus, setAnnualStatus] = useState('acumulando');
  const [form101, setForm101] = useState(null);
  const [annualRate, setAnnualRate] = useState(Number(initialRate || 0));
  useEffect(() => { if (!clientId || !year) return; Promise.allSettled([api.get(`/clients/${clientId}/annual-tax/${year}`), api.get(`/clients/${clientId}/income-tax/${year}`)]).then(([annualResult, incomeTaxResult]) => { const annual = annualResult.status === 'fulfilled' ? annualResult.value.data.data || {} : {}; const incomeTax = incomeTaxResult.status === 'fulfilled' ? incomeTaxResult.value.data.data || {} : {}; const configuration = annual.configuration || incomeTax.configuration || {}; const base = incomeTax.base || annual.base || { iva: 0, retentions: 0 }; setAnnualRate(Number(configuration.rate || 0)); setSummary({ ...annual, configuration, base, accumulatedBase: Number(base.iva || 0) + Number(base.retentions || 0) }); }); }, [clientId, year]);
  const configuration = summary?.configuration || {};
  const declaration = summary?.declaration || {};
  const ivaAccumulated = Number(summary?.base?.iva ?? initialBase.iva ?? 0);
  const retentionsAccumulated = Number(summary?.base?.retentions ?? initialBase.retentions ?? 0);
  const base = Number(summary?.base?.total ?? summary?.accumulatedBase ?? ivaAccumulated + retentionsAccumulated);
  const configuredRate = annualRate || Number(initialRate || 0);
  const canCloseYear = !declaration.status || declaration.status === 'acumulando';
  const calculatedTax = declaration.status === 'calculada' || declaration.status === 'presentada' || declaration.status === 'pagada'
    ? Number(declaration.calculatedTax || 0)
    : Number((base * configuredRate / 100).toFixed(2));
  const closeAnnualYear = async () => { if (!window.confirm('¿Estás seguro de cerrar el año? Esta acción no se puede deshacer.')) return; try { const { data } = await api.post(`/clients/${clientId}/annual-tax/${year}/close`); setSummary(current => ({ ...(current || {}), declaration: data.data })); setAnnualStatus(data.data?.status || 'calculada'); } catch (error) { alert(error?.response?.data?.error || 'No se pudo cerrar el año fiscal.'); } };
  const presentAnnualYear = async () => { if (!form101 || !declaration.id) return alert('Selecciona el Formulario 101 en PDF.'); try { const payload = new FormData(); payload.append('form101', form101); const { data } = await api.post(`/annual-tax/${declaration.id}/present`, payload); setSummary(current => ({ ...(current || {}), declaration: { ...(current?.declaration || {}), ...(data.data || {}), status: 'presentada', annualDocumentId: data.data?.annualDocumentId || true } })); setAnnualStatus('presentada'); } catch (error) { alert(error?.response?.data?.error || 'No se pudo presentar el Formulario 101.'); } };
  const openAnnualForm101 = async (download = false) => { if (!declaration.id) return; try { const response = await api.get(`/annual-tax/${declaration.id}/form101`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; if (download) { link.download = 'Formulario-101.pdf'; link.click(); } else { window.open(url, '_blank', 'noopener,noreferrer'); } window.setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { alert(error?.response?.data?.error || 'No se pudo abrir el Formulario 101.'); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal tax-period-modal annual-summary-modal" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close" /></button><p className="eyebrow">IMPUESTO A LA RENTA · RESUMEN ANUAL</p><h2>Impuesto a la Renta · {year}</h2><p>Consulta del cierre fiscal. Los parámetros de configuración son de solo lectura.</p><section className="panel"><div className="panel-head"><div><h3>Base anual de cálculo</h3><p>Acumulado desde las declaraciones mensuales.</p></div><span className="config-year">{year}</span></div><div className="form-grid"><label>IVA acumulado<input value={ivaAccumulated.toFixed(2)} readOnly /></label><label>Retenciones acumuladas<input value={retentionsAccumulated.toFixed(2)} readOnly /></label></div><div className="tax-base-card"><span>Base acumulada disponible</span><strong>${base.toFixed(2)}</strong><small>Valor actualizado del año fiscal</small></div></section><section className="panel annual-tax-preview"><div className="panel-head"><div><h3>Cierre anual · {year}</h3><p>Estado y resultado del impuesto.</p></div><span className="status-badge status-neutral">{declaration.status || annualStatus}</span></div><div className="annual-tax-preview-grid"><div><small>Impuesto estimado</small><strong>${calculatedTax.toFixed(2)}</strong></div><div className="annual-form101-cell"><small>Formulario 101</small><span>{declaration.annualDocumentId ? 'Presentado' : canCloseYear ? 'Se carga después del cierre' : 'Pendiente de presentación'}</span>{declaration.annualDocumentId && <div className="annual-form101-actions"><button type="button" className="row-upload-btn" onClick={() => openAnnualForm101(false)}>Ver PDF</button><button type="button" className="row-upload-btn" onClick={() => openAnnualForm101(true)}>Descargar</button></div>}{!canCloseYear && !declaration.annualDocumentId && <input type="file" accept=".pdf,application/pdf" onChange={event => setForm101(event.target.files?.[0] || null)}/>} {form101 && <em>{form101.name}</em>}</div><div><small>Vencimiento</small><span>{declaration.dueDate || 'Pendiente de cálculo'}</span></div></div><div className="annual-tax-actions"><button type="button" className="danger" onClick={closeAnnualYear} disabled={!canCloseYear}>Cerrar año</button>{!canCloseYear && !declaration.annualDocumentId && <button type="button" className="primary" onClick={presentAnnualYear}>Subir Formulario 101</button>}</div></section><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cerrar</button></div></section></div>;
}

function AnnualTaxClosurePreview({ base, rate, readOnly }) {
  const [status, setStatus] = useState('acumulando');
  const calculatedTax = (Number(base || 0) * Number(rate || 0) / 100).toFixed(2);
  return <section className="panel annual-tax-preview"><div className="panel-head"><div><h3>Cierre anual · Prueba</h3><p>Vista preliminar del ciclo anual del impuesto.</p></div><span className="status-badge status-neutral">{status}</span></div><div className="annual-tax-preview-grid"><div><small>Base acumulada</small><strong>${Number(base || 0).toFixed(2)}</strong></div><div><small>Impuesto calculado</small><strong>${calculatedTax}</strong></div><div><small>Formulario 101</small><span>{status === 'acumulando' ? 'Pendiente de cierre' : status === 'calculada' ? 'Pendiente de presentación' : 'Registrado'}</span></div></div>{!readOnly && <div className="modal-actions"><button type="button" className="outline" onClick={() => setStatus('calculada')} disabled={status !== 'acumulando'}>Cerrar año (prueba)</button><button type="button" className="primary" onClick={() => setStatus('presentada')} disabled={status !== 'calculada'}>Presentar (prueba)</button></div>}</section>;
}

function IncomeTaxPeriodModalLegacy({ periodId, clientId, year, onClose, onSave }) {
  const [taxpayer, setTaxpayer] = useState('Sociedad');
  const [regime, setRegime] = useState('Régimen general');
  const [accounting, setAccounting] = useState('Sí');
  const [periodicity, setPeriodicity] = useState('Anual');
  const [rate, setRate] = useState('25');
  const [formula, setFormula] = useState('Base imponible × porcentaje');
  const [base, setBase] = useState('');
  const [retentions, setRetentions] = useState('');
  const [file, setFile] = useState(null);
  useEffect(() => { if (!clientId || !year) return; api.get(`/clients/${clientId}/income-tax/${year}`).then(({ data }) => { const config = data.data?.configuration; if (!config) return; setTaxpayer(config.taxpayer || 'Sociedad'); setRegime(config.regime || 'Régimen general'); setAccounting(config.accounting === 'Yes' ? 'Sí' : config.accounting || 'Sí'); setPeriodicity(config.periodicity || 'Anual'); setRate(String(config.rate ?? '25')); setFormula(config.formula || 'Base imponible × porcentaje'); }).catch(() => {}); }, [clientId, year]);
  useEffect(() => { if (!periodId) return; api.get(`/periods/${periodId}/declaration`).then(({ data }) => { const declaration = data.data; setBase(String(declaration?.iva ?? 0)); setRetentions(String(declaration?.retentions ?? 0)); }).catch(() => { setBase('0'); setRetentions('0'); }); }, [periodId]);
  const total = (Number(base) || 0) + (Number(retentions) || 0);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal tax-period-modal" onSubmit={event => { event.preventDefault(); onSave({ taxpayer, regime, accounting, periodicity, rate, formula, base, retentions, file }); }} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">IMPUESTO A LA RENTA · CONFIGURACIÓN DEL PERIODO</p><h2>Impuesto a la Renta</h2><p>Configura los parámetros tributarios y la base de cálculo de este periodo.</p><div className="tax-grid"><section className="panel"><div className="panel-head"><div><h3>Parámetros tributarios</h3><p>Valores aplicados al periodo.</p></div></div><div className="form-grid"><label>Tipo de contribuyente<select value={taxpayer} onChange={event => setTaxpayer(event.target.value)}><option>Persona natural</option><option>Sociedad</option><option>Empresa pública</option><option>Otro</option></select></label><label>Régimen tributario<select value={regime} onChange={event => setRegime(event.target.value)}><option>Régimen general</option><option>RIMPE - Emprendedor</option><option>RIMPE - Negocio popular</option><option>Especial</option></select></label><label>Obligado a llevar contabilidad<select value={accounting} onChange={event => setAccounting(event.target.value)}><option>Sí</option><option>No</option></select></label><label>Periodicidad<select value={periodicity} onChange={event => setPeriodicity(event.target.value)}><option>Anual</option><option>Anticipos</option><option>Anual + anticipos</option></select></label><label>Porcentaje (%)<input type="number" min="0" step="0.01" value={rate} onChange={event => setRate(event.target.value)}/></label><label>Fórmula de cálculo<input value={formula} onChange={event => setFormula(event.target.value)}/></label></div></section><section className="panel"><div className="panel-head"><div><h3>Base de cálculo</h3><p>Información acumulada del periodo.</p></div></div><div className="form-grid"><label>IVA acumulado<input type="number" min="0" step="0.01" value={base} onChange={event => setBase(event.target.value)} placeholder="0.00"/></label><label>Retenciones acumuladas<input type="number" min="0" step="0.01" value={retentions} onChange={event => setRetentions(event.target.value)} placeholder="0.00"/></label></div><div className="tax-base-card"><span>Base acumulada disponible</span><strong>${total.toFixed(2)}</strong><small>IVA + Retenciones · cálculo automático</small></div><label className="full-width">Archivo de respaldo (Excel o PDF)<input type="file" accept=".xlsx,.xls,.pdf" onChange={event => setFile(event.target.files?.[0] || null)}/>{file && <small className="input-hint">{file.name}</small>}</label></section></div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Guardar configuración</button></div></form></div>;
}

function ClientModal({ onClose, onSave, clientToEdit, isAdmin = false, assignableUsers = [] }) {
  const [form, setForm] = useState({
    idType: clientToEdit ? (clientToEdit.idType || (clientToEdit.ruc?.length === 10 ? 'cedula' : 'ruc')) : 'ruc',
    ruc: clientToEdit ? clientToEdit.ruc : '',
    name: clientToEdit ? clientToEdit.name : '',
    owner: clientToEdit ? clientToEdit.owner : '',
    email: clientToEdit ? (clientToEdit.email || '') : '',
    phone: clientToEdit ? (clientToEdit.phone || '') : '',
    taxRegime: clientToEdit ? (clientToEdit.taxRegime || 'Régimen general') : 'Régimen general',
    accounting: clientToEdit ? (clientToEdit.accounting || 'Sí') : 'Sí',
    clientStatus: clientToEdit ? (clientToEdit.clientStatus || 'Activo') : 'Activo',
    assignedUserCode: clientToEdit ? (clientToEdit.userCode || '') : ''
  });
  const [error, setError] = useState('');

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const numbersOnly = (key, value) => update(key, value.replace(/\D/g, ''));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.ruc || !form.name || !form.owner || !form.email || !form.phone) {
      return setError('Completa los campos obligatorios para guardar el cliente.');
    }
    if (isAdmin && !clientToEdit && !form.assignedUserCode) return setError('Selecciona el contador responsable del cliente.');
    if (form.idType === 'cedula' && !/^\d{10}$/.test(form.ruc)) {
      return setError('La c�dula debe tener exactamente 10 d�gitos.');
    }
    if (form.idType === 'ruc' && !/^\d{10}001$/.test(form.ruc)) {
      return setError('El RUC debe tener 13 d�gitos y terminar en 001.');
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      return setError('Ingresa un correo electrónico válido.');
    }
    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError?.message || 'No se pudo guardar el cliente.');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal client-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">CLIENTES</p>
        <h2>{clientToEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
        <p>{clientToEdit ? 'Modifica los datos generales y la configuración tributaria.' : 'Registra sus datos generales y la configuración tributaria.'}</p>

        <div className="form-grid">
          <label>Tipo de identificación *
            <select value={form.idType} onChange={e => { update('idType', e.target.value); update('ruc', ''); }} disabled={!!clientToEdit}>
              <option value="ruc">RUC</option>
              <option value="cedula">Cédula</option>
            </select>
          </label>
          <label>{form.idType === 'ruc' ? 'RUC *' : 'Cédula *'}
            <input inputMode="numeric" pattern="[0-9]*" maxLength={form.idType === 'ruc' ? 13 : 10} value={form.ruc} onChange={e => numbersOnly('ruc', e.target.value)} placeholder={form.idType === 'ruc' ? 'Ej. 1799999999001' : 'Ej. 0999999999'} disabled={!!clientToEdit}/>
          </label>
          <label>Razón social *
            <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nombre legal de la empresa"/>
          </label>
          <label>Responsable *
            <input value={form.owner} onChange={e => update('owner', e.target.value)} placeholder="Nombre completo"/>
          </label>
          <label>Correo *
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="correo@empresa.com"/>
          </label>
          <label>Teléfono *
            <input inputMode="numeric" pattern="[0-9]*" maxLength="15" value={form.phone} onChange={e => numbersOnly('phone', e.target.value)} placeholder="Ej. 0991234567"/>
          </label>
          <label>Estado
            <select value={form.clientStatus} onChange={e => update('clientStatus', e.target.value)}>
              <option>Activo</option>
              <option>Inactivo</option>
            </select>
          </label>
          {isAdmin && !clientToEdit && <label>Contador asignado *
            <select value={form.assignedUserCode} onChange={e => update('assignedUserCode', e.target.value)}>
              <option value="">Selecciona un contador</option>
              {assignableUsers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
        </div>

        <div className="tax-section">
          <strong>Configuración tributaria</strong>
          <div className="form-grid">
            <label>Régimen tributario
              <select value={form.taxRegime} onChange={e => update('taxRegime', e.target.value)}>
                <option>Régimen general</option>
                <option>RIMPE emprendedor</option>
                <option>RIMPE negocio popular</option>
                <option>Otro</option>
              </select>
            </label>
            <label>Obligado a llevar contabilidad
              <select value={form.accounting} onChange={e => update('accounting', e.target.value)}>
                <option>Sí</option>
                <option>No</option>
              </select>
            </label>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button className="primary">{clientToEdit ? 'Guardar cambios' : 'Guardar cliente'}</button>
        </div>
      </form>
    </div>
  );
}

// Vite puede reevaluar este módulo durante HMR. Reutilizar la raíz evita
// crear dos raíces sobre el mismo contenedor y previene pantallas en blanco.
const rootElement = document.getElementById('root');
const appRoot = globalThis.__contamaticRoot || (globalThis.__contamaticRoot = createRoot(rootElement));

appRoot.render(
  // BrowserRouter habilita navegación y URLs reales en React.
  <BrowserRouter>
    {/* AuthProvider comparte el usuario con toda la aplicación. */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
); 
