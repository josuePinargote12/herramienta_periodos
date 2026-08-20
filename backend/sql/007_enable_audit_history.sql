-- Habilita la consulta del historial para CONTADOR.
-- El panel es solo de lectura; las operaciones de escritura no existen en esta API.
INSERT IGNORE INTO permisos_contamatic (codigo, nombre, modulo, accion)
VALUES ('audit.read', 'Consultar auditoría', 'Auditoría', 'read');

INSERT IGNORE INTO roles_permisos_contamatic (rol, permiso_id)
SELECT 'CONTADOR', id
FROM permisos_contamatic
WHERE codigo = 'audit.read' AND activo = 1;
