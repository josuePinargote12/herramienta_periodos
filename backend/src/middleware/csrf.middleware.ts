import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const csrfCookieName = 'csrfToken';
const csrfHeaderName = 'x-csrf-token';

function csrfMaxAge() {
  const value = Number(process.env.CSRF_TOKEN_EXPIRES_DAYS || 7);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('CSRF_TOKEN_EXPIRES_DAYS debe ser un número entero positivo en días');
  }
  return value * 24 * 60 * 60 * 1000;
}

export function issueCsrfToken(_req: Request, res: Response) {
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
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieToken = req.cookies?.[csrfCookieName];
  const headerToken = req.get(csrfHeaderName);
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ ok: false, error: 'Token CSRF inválido o ausente' });
  }
  return next();
}
