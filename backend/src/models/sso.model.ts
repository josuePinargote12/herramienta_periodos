// Acceso a las tablas temporales del handoff SSO.
import crypto from 'node:crypto';
import { pool } from '../config/database.js';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// Consume un ticket una sola vez y crea la preautenticación asociada.
export async function consumeTicket(ticket: string, _ip: string | null, _userAgent: string) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tokenHash = sha256(ticket);

    // El UPDATE atómico evita que dos peticiones utilicen el mismo ticket.
    const [updated] = await connection.execute<any>(
      `UPDATE sso_tickets
       SET used_at = UTC_TIMESTAMP()
       WHERE token_hash = ?
         AND used_at IS NULL
         AND expires_at > UTC_TIMESTAMP()`,
      [tokenHash]
    );
    if (updated.affectedRows !== 1) {
      await connection.rollback();
      return null;
    }

    const [rows] = await connection.execute<any[]>(
      'SELECT user_id FROM sso_tickets WHERE token_hash = ? LIMIT 1',
      [tokenHash]
    );
    const userId = rows[0]?.user_id;
    if (!userId) {
      await connection.rollback();
      return null;
    }

    const preauth = crypto.randomBytes(32).toString('base64url');
    await connection.execute(
      `INSERT INTO preauth_sessions (id_hash, user_id, created_at, expires_at, attempts)
       VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 5 MINUTE, 0)`,
      [sha256(preauth), userId]
    );
    await connection.commit();
    return { preauth, userId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Busca el contexto de preautenticación sin confiar en un usuario enviado por el navegador.
export async function findPreauthContext(preauth: string) {
  const [rows] = await pool.execute<any[]>(
    `SELECT p.user_id, u.ALI_USUEMP AS username, u.NOM_USUEMP AS name
     FROM preauth_sessions p
     INNER JOIN usuarios u ON u.COD_USUEMP = p.user_id
     WHERE p.id_hash = SHA2(?, 256)
       AND p.expires_at > UTC_TIMESTAMP()
       AND p.attempts < 3
       AND u.ELIMINADO = 0
     LIMIT 1`,
    [preauth]
  );
  return rows[0] || null;
}

// Elimina una preautenticación inválida o ya vencida y permite limpiar su cookie.
export async function deletePreauth(preauth: string) {
  await pool.execute('DELETE FROM preauth_sessions WHERE id_hash = SHA2(?, 256)', [preauth]);
}

// Incrementa el contador de intentos y devuelve el usuario asociado.
export async function getPreauthForLogin(preauth: string) {
  const [rows] = await pool.execute<any[]>(
    `SELECT p.user_id, p.attempts, u.ALI_USUEMP AS username
     FROM preauth_sessions p
     INNER JOIN usuarios u ON u.COD_USUEMP = p.user_id
     WHERE p.id_hash = SHA2(?, 256)
       AND p.expires_at > UTC_TIMESTAMP()
       AND p.attempts < 3
       AND u.ELIMINADO = 0
     LIMIT 1`,
    [preauth]
  );
  if (!rows[0]) return null;
  await pool.execute('UPDATE preauth_sessions SET attempts = attempts + 1 WHERE id_hash = SHA2(?, 256) AND attempts < 3', [preauth]);
  // Conservamos el contador actualizado para invalidar después del tercer intento.
  return { ...(rows[0] as { user_id: number; username: string }), attempts: Number(rows[0].attempts) + 1 };
}

// Elimina datos temporales que ya no pueden utilizarse.
// Los tickets usados se conservan 24 horas para permitir auditoría.
export async function cleanupSsoData() {
  const [preauthResult] = await pool.execute<any>(
    'DELETE FROM preauth_sessions WHERE expires_at <= UTC_TIMESTAMP()'
  );
  const [ticketResult] = await pool.execute<any>(
    `DELETE FROM sso_tickets
     WHERE (used_at IS NOT NULL AND used_at < UTC_TIMESTAMP() - INTERVAL 24 HOUR)
        OR (used_at IS NULL AND expires_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR)`
  );
  return {
    preauthDeleted: preauthResult.affectedRows || 0,
    ticketsDeleted: ticketResult.affectedRows || 0
  };
}
