/**
 * Protección CSRF para peticiones que modifican información.
 * El frontend recibe un token en cookie y debe repetirlo en el header.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const csrfCookieName = 'csrfToken';
const csrfHeaderName = 'x-csrf-token';

function csrfMaxAge() {
  // Convierte la configuración expresada en días a milisegundos para Express.
  const value = Number(process.env.CSRF_TOKEN_EXPIRES_DAYS || 7);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('CSRF_TOKEN_EXPIRES_DAYS debe ser un número entero positivo en días');
  }
  return value * 24 * 60 * 60 * 1000;
}

export function issueCsrfToken(_req: Request, res: Response) {
  // Crea un token impredecible y lo entrega al navegador mediante cookie.
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(csrfCookieName, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: csrfMaxAge(),
    path: '/'
  });
  return res.json({ ok: true, csrfToken: token });
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  // El handoff SSO llega desde el sistema externo y usa su propio ticket de un solo uso.
  if (req.path === '/sso/consume') return next();
  // Las peticiones de lectura no cambian estado y no necesitan CSRF.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieToken = req.cookies?.[csrfCookieName];
  const headerToken = req.get(csrfHeaderName);
  // timingSafeEqual evita comparar tokens de forma vulnerable a ataques de
  // temporización y además exige que ambos valores sean idénticos.
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ ok: false, error: 'Token CSRF inválido o ausente' });
  }
  return next();
}
