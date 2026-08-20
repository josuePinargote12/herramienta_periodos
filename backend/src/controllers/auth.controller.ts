// Controlador HTTP del login: recibe la petición, llama al servicio y devuelve JSON.
import type { Request, Response } from 'express';
import { login, refreshAccessToken } from '../services/auth.service.js';
import { listPermissions } from '../services/permission.service.js';
import { deletePreauth, getPreauthForLogin } from '../models/sso.model.js';
import { findAssignableUsers } from '../models/user.model.js';

function readCookie(req: Request, name: string) {
  if (req.cookies?.[name]) return String(req.cookies[name]);
  const value = req.headers.cookie?.split(';').find(item => item.trim().startsWith(`${name}=`));
  return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : '';
}

function durationMinutesMilliseconds(name: string, fallbackMinutes: number) {
  const value = Number(process.env[name] || fallbackMinutes);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un número entero positivo en minutos`);
  }
  return value * 60 * 1000;
}

function durationDaysMilliseconds(name: string, fallbackDays: number) {
  const value = Number(process.env[name] || fallbackDays);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un número entero positivo en días`);
  }
  return value * 24 * 60 * 60 * 1000;
}

function refreshTokenMaxAge() {
  if (process.env.REFRESH_TOKEN_EXPIRES_MINUTES) {
    return durationMinutesMilliseconds('REFRESH_TOKEN_EXPIRES_MINUTES', 2);
  }
  return durationDaysMilliseconds('REFRESH_TOKEN_EXPIRES_DAYS', 7);
}

function clearPreauthCookie(res: Response) {
  const cookieName = process.env.NODE_ENV === 'production' ? '__Host-preauth' : 'preauth';
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: durationMinutesMilliseconds('ACCESS_TOKEN_EXPIRES_MINUTES', 15),
    path: '/'
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: refreshTokenMaxAge(),
    path: '/api/auth'
  });
}

function clearAuthCookies(res: Response) {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie('accessToken', { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  res.clearCookie('refreshToken', { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth' });
}

export async function loginController(req: Request, res: Response) {
  const password = String(req.body?.password || '');
  const suppliedUsername = String(req.body?.username || '').trim();
  const ssoAttempt = Boolean(req.body?.ssoAttempt);
  const cookieName = process.env.NODE_ENV === 'production' ? '__Host-preauth' : 'preauth';
  const preauth = readCookie(req, cookieName);
  let username = suppliedUsername;
  let preauthUser: { user_id: number; username: string; attempts: number } | null = null;

  try {
    // Si no se envía usuario, la identidad sale de la preautenticación SSO.
    if (!suppliedUsername && preauth) {
      preauthUser = await getPreauthForLogin(preauth);
      if (!preauthUser) {
        await deletePreauth(preauth);
        clearPreauthCookie(res);
        return res.status(401).json({ ok: false, requiresCredentials: true, error: 'Credenciales inválidas' });
      }
      username = preauthUser.username;
    }

    if (ssoAttempt && !preauthUser) {
      return res.status(401).json({ ok: false, requiresCredentials: true, error: 'El acceso inicial expiró. Ingresa nuevamente desde el sistema principal.' });
    }

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username y password son obligatorios' });
    }

    const session = await login(username, password);
    setAuthCookies(res, session.accessToken, session.refreshToken);
    // La preautenticación solo se elimina al alcanzar tres errores.
    const maxAttemptsReached = Boolean(preauthUser && preauthUser.attempts >= 3);
    if (preauthUser && preauth) {
      await deletePreauth(preauth);
      clearPreauthCookie(res);
    }
    return res.json({ ok: true, user: session.user });
  } catch (error) {
    console.error('[auth] login failed:', error);
    const maxAttemptsReached = Boolean(preauthUser && preauthUser.attempts >= 3);
    if (preauthUser && preauth && maxAttemptsReached) {
      await deletePreauth(preauth);
      clearPreauthCookie(res);
    }
    return res.status(401).json({
      ok: false,
      requiresCredentials: maxAttemptsReached,
      error: 'Credenciales inválidas'
    });
  }
}

// Devuelve los datos seguros que fueron validados desde el JWT.
export function currentUserController(req: Request, res: Response) {
  return res.json({ ok: true, user: req.user });
}

// Devuelve los permisos reales del rol consultándolos en la base de datos.
export async function currentPermissionsController(req: Request, res: Response) {
  const permissions = await listPermissions(req.user!.role);
  return res.json({ ok: true, role: req.user!.role, permissions });
}

export async function assignableUsersController(_req: Request, res: Response) {
  return res.json({ ok: true, data: await findAssignableUsers() });
}

export async function refreshController(req: Request, res: Response) {
  const refreshToken = String(req.body?.refreshToken || '').trim() || readCookie(req, 'refreshToken');
  if (!refreshToken) {
    return res.status(400).json({ ok: false, error: 'refreshToken es obligatorio' });
  }

  try {
    const session = await refreshAccessToken(refreshToken);
    setAuthCookies(res, session.accessToken, refreshToken);
    return res.json({ ok: true, user: session.user });
  } catch (error) {
    console.error('[auth] refresh failed:', error);
    return res.status(401).json({ ok: false, error: 'Refresh token invÃ¡lido o expirado' });
  }
}

export function logoutController(_req: Request, res: Response) {
  clearPreauthCookie(res);
  clearAuthCookies(res);
  return res.json({ ok: true });
}
