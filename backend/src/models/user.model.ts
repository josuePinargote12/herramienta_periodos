// Consultas SQL relacionadas con los usuarios.
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

export type User = {
  id: number;
  identification: string;
  username: string;
  name: string;
  companyId: number | null;
  passwordHashLegacy: string | null;
  passwordHashNew: string | null;
  // Rol original proveniente de usuarios; permission.service lo normaliza.
  sourceRole: string | null;
};

// Busca usuarios activos utilizando ALI_USUEMP como identificador.
export async function findUserByUsername(username: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    // Se incluye ROL_USUEMP para validar permisos sin crear otra autenticación.
    'SELECT COD_USUEMP AS id, IDE_USUEMP AS identification, ALI_USUEMP AS username, NOM_USUEMP AS name, NULL AS companyId, PASS_USUEMP AS passwordHashLegacy, PASSWORD_USER AS passwordHashNew, ROL_USUEMP AS sourceRole FROM usuarios WHERE ALI_USUEMP = ? AND ELIMINADO = 0 LIMIT 1',
    [username]
  );
  return (rows[0] as User | undefined) || null;
}

// Busca el usuario activo por id para renovar el accessToken.
export async function findUserById(userId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    // También se incluye el rol al renovar o revalidar una sesión.
    'SELECT COD_USUEMP AS id, IDE_USUEMP AS identification, ALI_USUEMP AS username, NOM_USUEMP AS name, NULL AS companyId, PASS_USUEMP AS passwordHashLegacy, PASSWORD_USER AS passwordHashNew, ROL_USUEMP AS sourceRole FROM usuarios WHERE COD_USUEMP = ? AND ELIMINADO = 0 LIMIT 1',
    [userId]
  );
  return (rows[0] as User | undefined) || null;
}

// Usuarios internos que pueden recibir clientes; no incluye clientes externos.
export async function findAssignableUsers() {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COD_USUEMP AS id, NOM_USUEMP AS name, ALI_USUEMP AS username, ROL_USUEMP AS sourceRole
     FROM usuarios
     WHERE ELIMINADO = 0 AND UPPER(ROL_USUEMP) IN ('IMPRENTA', 'GERENTE', 'VENDEDOR')
     ORDER BY NOM_USUEMP`
  );
  return rows;
}

// Guarda únicamente el hash bcrypt nuevo de la contraseña.
export async function saveNewPasswordHash(userId: number, passwordHashNew: string) {
  await pool.execute('UPDATE usuarios SET PASSWORD_USER = ? WHERE COD_USUEMP = ?', [passwordHashNew, userId]);
}
