// Servicio de autenticación: verifica contraseñas y crea los tokens de sesión.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { findUserById, findUserByUsername, saveNewPasswordHash, type User } from '../models/user.model.js';
import { normalizeRole } from './permission.service.js';

function requiredEnv(name: string) {
  // Obliga a configurar secretos necesarios antes de crear JWT.
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está configurada`);
  return value;
}

function durationMinutes(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un número entero positivo en minutos`);
  }
  return value * 60;
}

function durationDays(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un número entero positivo en días`);
  }
  return value * 24 * 60 * 60;
}

function refreshTokenDurationSeconds() {
  if (process.env.REFRESH_TOKEN_EXPIRES_MINUTES) {
    return durationMinutes('REFRESH_TOKEN_EXPIRES_MINUTES', 2);
  }
  return durationDays('REFRESH_TOKEN_EXPIRES_DAYS', 7);
}

/** PHP suele guardar bcrypt con $2y$. bcryptjs trabaja de forma compatible usando $2a$. */
function normalizePhpHash(hash: string) {
  // Convierte el prefijo bcrypt usado por PHP al formato compatible con bcryptjs.
  return hash.startsWith('$2y$') ? hash.replace('$2y$', '$2a$') : hash;
}

function isMd5(value: string) {
  // Detecta si una contraseña heredada tiene formato MD5.
  return /^[a-f0-9]{32}$/i.test(value);
}

function buildAuthPayload(user: User) {
  // El token transporta el rol normalizado, no el nombre variable del sistema principal.
  const role = normalizeRole(user.sourceRole);
  if (!role) throw new Error('El rol del usuario no está autorizado para ContaMatic');
  return { codigo: user.id, ID: user.identification, nombre: user.name, role };
}

function createAccessToken(user: User) {
  // El accessToken es corto y solo contiene datos no sensibles.
  return jwt.sign(buildAuthPayload(user), requiredEnv('JWT_SECRET'), {
    expiresIn: durationMinutes('ACCESS_TOKEN_EXPIRES_MINUTES', 15)
  });
}

export async function login(username: string, password: string) {
  // Busca el usuario, verifica el hash compatible y crea los tokens de sesión.
  const user = await findUserByUsername(username);
  if (!user) throw new Error('Usuario o contraseña incorrectos');

  let valid = false;
  if (user.passwordHashNew) {
    // Desde este momento la contraseña nueva tiene prioridad.
    valid = await bcrypt.compare(password, user.passwordHashNew);
  } else if (user.passwordHashLegacy) {
    // Compatibilidad con contraseñas heredadas: bcrypt, MD5 o texto plano.
    const legacy = user.passwordHashLegacy;
    if (legacy.startsWith('$2')) {
      valid = await bcrypt.compare(password, normalizePhpHash(legacy));
    } else if (isMd5(legacy)) {
      valid = crypto.createHash('md5').update(password).digest('hex').toLowerCase() === legacy.toLowerCase();
    } else {
      valid = password === legacy;
    }
    if (valid) {
      // Migración progresiva: guarda solo el nuevo hash bcrypt.
      await saveNewPasswordHash(user.id, await bcrypt.hash(password, 12));
    }
  }

  if (!valid) throw new Error('Usuario o contraseña incorrectos');
  // Datos no sensibles que viajarán dentro del access token.
  const payload = buildAuthPayload(user);
  // Token corto para acceder a la API.
  const accessToken = createAccessToken(user);
  // Token más largo para renovar la sesión cuando expire el access token.
  const refreshToken = jwt.sign({ userId: user.id }, requiredEnv('JWT_REFRESH_SECRET'), {
    expiresIn: refreshTokenDurationSeconds()
  });
  return {
    user: payload,
    accessToken,
    refreshToken
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const decoded = jwt.verify(refreshToken, requiredEnv('JWT_REFRESH_SECRET')) as { userId?: number };
  if (!decoded.userId) throw new Error('Refresh token invÃ¡lido');

  // Se consulta la base para confirmar que el usuario sigue activo.
  const user = await findUserById(Number(decoded.userId));
  if (!user) throw new Error('Usuario no disponible');

  return {
    user: buildAuthPayload(user),
    accessToken: createAccessToken(user)
  };
}
