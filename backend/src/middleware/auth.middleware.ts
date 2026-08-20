// Middleware de seguridad: valida el token antes de permitir que llegue al controller.
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../models/user.model.js';
import { normalizeRole, type AppRole } from '../services/permission.service.js';

// Identidad que queda disponible para controllers y modelos después de autenticar.
export type AuthenticatedUser = {
  codigo: number;
  ID: string;
  nombre: string;
  role: AppRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      cookies?: Record<string, string>;
    }
  }
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurada');
  return secret;
}

function readCookie(req: Request, name: string) {
  if (req.cookies?.[name]) return String(req.cookies[name]);
  const value = req.headers.cookie?.split(';').find(item => item.trim().startsWith(`${name}=`));
  return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : '';
}

// Valida el accessToken enviado como "Authorization: Bearer <token>".
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Las vistas y respuestas privadas no deben recuperarse desde la caché.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  const cookieToken = readCookie(req, 'accessToken');
  const accessToken = scheme === 'Bearer' && token ? token : cookieToken;

  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'Token de acceso obligatorio' });
  }

  try {
    const decoded = jwt.verify(accessToken, jwtSecret()) as Partial<AuthenticatedUser>;
    if (!decoded.codigo || !decoded.ID || !decoded.nombre) {
      return res.status(401).json({ ok: false, error: 'Token de acceso inválido' });
    }

    // Se vuelve a leer usuarios para que un cambio de rol tenga efecto
    // inmediatamente, sin esperar a que expire el JWT.
    const currentUser = await findUserById(Number(decoded.codigo));
    // Se usa el rol actual de la base y solo como respaldo el del token.
    const role = normalizeRole(currentUser?.sourceRole || String(decoded.role || ''));
    if (!currentUser || !role) {
      return res.status(403).json({ ok: false, error: 'El rol del usuario no está autorizado' });
    }

    req.user = {
      codigo: Number(decoded.codigo),
      ID: String(currentUser.identification || decoded.ID),
      nombre: String(currentUser.name || decoded.nombre),
      role
    };
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token de acceso inválido o expirado' });
  }
}
