import type { NextFunction, Request, Response } from 'express';
import { hasPermission, type AppRole } from '../services/permission.service.js';

export function requireRole(role: AppRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return res.status(403).json({ ok: false, error: 'Rol no autorizado' });
    return next();
  };
}

// El detalle anual es una vista interna exclusiva de administradores y contadores.
export function requireAccountingRole() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!['ADMIN', 'CONTADOR'].includes(String(req.user?.role))) {
      return res.status(403).json({ ok: false, error: 'Solo ADMIN y CONTADOR pueden consultar el detalle anual' });
    }
    return next();
  };
}

// Protege un endpoint con un permiso almacenado en permisos_contamatic.
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allowed = await hasPermission(req.user!.codigo, permission, req.user!.role as AppRole);
      if (!allowed) return res.status(403).json({ ok: false, error: 'No tienes permisos para realizar esta operación' });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// Protege un endpoint cuando basta con tener cualquiera de los permisos indicados.
export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allowed = await Promise.all(permissions.map(permission => hasPermission(req.user!.codigo, permission, req.user!.role as AppRole)));
      if (!allowed.some(Boolean)) return res.status(403).json({ ok: false, error: 'No tienes permisos para realizar esta operación' });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
