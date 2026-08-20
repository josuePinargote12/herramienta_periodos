import axios from 'axios';

// URL configurable por entorno. En desarrollo se usa el backend local.
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Lee el CSRF desde la cookie actual, no desde una variable en memoria.
// Así funciona si el backend la renueva o si hay varias pestañas abiertas.
function readCsrfCookie() {
  const item = document.cookie.split('; ').find(value => value.startsWith('csrfToken='));
  return item ? decodeURIComponent(item.slice('csrfToken='.length)) : '';
}

// Instancia sin interceptor de respuestas: se usa para /csrf y /refresh.
// Evita que un 401 del refresh intente volver a ejecutar otro refresh.
const plain = axios.create({ baseURL, withCredentials: true });
const api = axios.create({ baseURL, withCredentials: true });

let csrfPromise = null;

// Solo pide un token nuevo si todavía no existe la cookie CSRF.
export async function getCsrfToken() {
  const currentToken = readCsrfCookie();
  if (currentToken) return currentToken;
  if (!csrfPromise) {
    csrfPromise = plain.get('/auth/csrf')
      .then(({ data }) => data.csrfToken || '')
      .finally(() => { csrfPromise = null; });
  }
  return csrfPromise;
}

// Ambas instancias agregan CSRF solo a métodos que pueden cambiar datos.
const addCsrfHeader = async config => {
  const method = config.method?.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    config.headers = config.headers || {};
    config.headers['X-CSRF-Token'] = await getCsrfToken();
  }
  return config;
};

plain.interceptors.request.use(addCsrfHeader);
api.interceptors.request.use(addCsrfHeader);

let refreshing = null;

api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    const csrfError = error.response?.status === 403 &&
      String(error.response?.data?.error || '').toLowerCase().includes('csrf');

    // Si el backend reemitió el CSRF, sincroniza cookie y reintenta una sola vez.
    if (csrfError && !original?._csrfRetry) {
      original._csrfRetry = true;
      return api(original);
    }

    if (error.response?.status !== 401 || original?.skipRefresh || original?._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    refreshing ||= plain.post('/auth/refresh').finally(() => {
      refreshing = null;
    });

    try {
      await refreshing;
      return api(original);
    } catch (refreshError) {
      window.dispatchEvent(new CustomEvent('session-expired'));
      return Promise.reject(refreshError);
    }
  }
);

export default api;
