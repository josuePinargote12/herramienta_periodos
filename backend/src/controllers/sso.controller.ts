// Controladores del flujo SSO nuevo basado en sso_tickets y preauth_sessions.
import type { Request, Response } from 'express';
import { consumeTicket, deletePreauth, findPreauthContext } from '../models/sso.model.js';

function readCookie(req: Request, name: string) {
  if (req.cookies?.[name]) return String(req.cookies[name]);
  const value = req.headers.cookie?.split(';').find(item => item.trim().startsWith(`${name}=`));
  return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : '';
}

function invalidRedirect(res: Response) {
  const url = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
  url.searchParams.set('sso', 'invalid');
  const cookieName = process.env.NODE_ENV === 'production' ? '__Host-preauth' : 'preauth';
  res.clearCookie(cookieName, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  return res.redirect(303, url.toString());
}

// POST /api/sso/consume consume un ticket una sola vez y crea una preautenticación.
export async function consumeSsoTicket(req: Request, res: Response) {
  const ticket = String(req.body?.t || '').trim();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (!ticket) return invalidRedirect(res);
  try {
    const result = await consumeTicket(ticket, req.ip || null, req.get('user-agent') || '');
    if (!result) return invalidRedirect(res);
    const secure = process.env.NODE_ENV === 'production';
    const cookieName = secure ? '__Host-preauth' : 'preauth';
    res.cookie(cookieName, result.preauth, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60 * 1000
    });
    return res.redirect(303, `${frontendUrl}/`);
  } catch (error) {
    console.error('[sso] ticket consumption failed:', error);
    return invalidRedirect(res);
  }
}

// GET /api/auth/context informa al frontend qué formulario debe mostrar.
export async function getAuthContext(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  const cookieName = process.env.NODE_ENV === 'production' ? '__Host-preauth' : 'preauth';
  const preauth = readCookie(req, cookieName);
  if (!preauth) return res.json({ mode: 'full' });
  const context = await findPreauthContext(preauth);
  if (!context) {
    await deletePreauth(preauth);
    res.clearCookie(cookieName, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    return res.json({ mode: 'full' });
  }
  // La identidad se conserva únicamente en el backend y no se expone al frontend.
  return res.json({ mode: 'password_only', nombre: context.name });
}
