import { pool } from '../config/database.js';

// Roles internos que utiliza ContaMatic. Los nombres originales del sistema
// principal se convierten a estos valores antes de consultar permisos.
export type AppRole = 'ADMIN' | 'CONTADOR' | 'CLIENTE';

// Convierte el rol de usuarios.ROL_USUEMP al catálogo de ContaMatic.
// Imprenta, Gerente y Vendedor realizan las mismas operaciones contables.
export function normalizeRole(sourceRole: string | null | undefined): AppRole | null {
  const role = String(sourceRole || '').trim().toUpperCase();
  if (role === 'ADMIN') return 'ADMIN';
  if (['IMPRENTA', 'GERENTE', 'VENDEDOR'].includes(role)) return 'CONTADOR';
  if (role === 'CLIENTE') return 'CLIENTE';
  return null;
}

// Consulta en la base si el rol tiene habilitada una acción concreta.
// El userCode queda disponible para futuras reglas por usuario específico;
// el alcance por cliente se valida adicionalmente en los modelos SQL.
export async function hasPermission(userCode: number, permission: string, role?: AppRole | null) {
  if (!role) return false;
  const [rows]: any = await pool.execute(`
    SELECT 1
    FROM roles_permisos_contamatic rp
    INNER JOIN permisos_contamatic p ON p.id = rp.permiso_id
    WHERE rp.rol = ? AND p.codigo = ? AND p.activo = 1
    LIMIT 1`, [role, permission]);
  return rows.length > 0;
}

// Devuelve todos los permisos activos del rol autenticado para que el frontend
// pueda controlar la visibilidad sin mantener un catálogo duplicado.
export async function listPermissions(role: AppRole | null | undefined) {
  if (!role) return [] as string[];
  const [rows]: any = await pool.execute(`
    SELECT p.codigo
    FROM roles_permisos_contamatic rp
    INNER JOIN permisos_contamatic p ON p.id = rp.permiso_id
    WHERE rp.rol = ? AND p.activo = 1
    ORDER BY p.codigo`, [role]);
  return rows.map((row: any) => String(row.codigo));
}
