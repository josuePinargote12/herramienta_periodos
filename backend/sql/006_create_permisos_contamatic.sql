-- Permisos disponibles dentro de ContaMatic.
CREATE TABLE IF NOT EXISTS permisos_contamatic (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(100) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  modulo VARCHAR(80) NOT NULL,
  accion VARCHAR(50) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_permisos_codigo (codigo)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;

-- Relación entre los roles existentes y los permisos de ContaMatic.
CREATE TABLE IF NOT EXISTS roles_permisos_contamatic (
  rol VARCHAR(30) NOT NULL,
  permiso_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (rol, permiso_id),

  CONSTRAINT fk_roles_permisos_permiso
    FOREIGN KEY (permiso_id)
    REFERENCES permisos_contamatic(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;

-- Catálogo inicial de permisos.
INSERT IGNORE INTO permisos_contamatic (codigo, nombre, modulo, accion) VALUES
  ('client.read', 'Consultar clientes', 'Clientes', 'read'),
  ('client.create', 'Crear clientes', 'Clientes', 'create'),
  ('client.update', 'Editar clientes', 'Clientes', 'update'),
  ('client.disable', 'Deshabilitar clientes', 'Clientes', 'disable'),
  ('period.read', 'Consultar periodos', 'Periodos', 'read'),
  ('period.create', 'Crear periodos', 'Periodos', 'create'),
  ('period.update', 'Actualizar periodos', 'Periodos', 'update'),
  ('period.complete', 'Completar periodos', 'Periodos', 'complete'),
  ('document.read', 'Consultar documentos', 'Documentos', 'read'),
  ('document.upload', 'Cargar documentos', 'Documentos', 'upload'),
  ('document.download', 'Descargar documentos', 'Documentos', 'download'),
  ('document.share', 'Compartir documentos', 'Documentos', 'share'),
  ('declaration.manage', 'Gestionar declaraciones', 'Declaraciones', 'manage'),
  ('income_tax.configure', 'Configurar impuesto a la renta', 'Impuesto', 'configure'),
  ('dashboard.read', 'Consultar dashboard', 'Dashboard', 'read'),
  ('audit.read', 'Consultar auditoria', 'Auditoria', 'read');

-- ADMIN recibe todos los permisos disponibles.
INSERT IGNORE INTO roles_permisos_contamatic (rol, permiso_id)
SELECT 'ADMIN', id FROM permisos_contamatic;

-- CONTADOR recibe permisos operativos, sin acceso global a auditoría.
INSERT IGNORE INTO roles_permisos_contamatic (rol, permiso_id)
SELECT 'CONTADOR', id
FROM permisos_contamatic
WHERE codigo IN (
  'client.read', 'client.create', 'client.update',
  'period.read', 'period.create', 'period.update', 'period.complete',
  'document.read', 'document.upload', 'document.download', 'document.share',
  'declaration.manage', 'income_tax.configure', 'dashboard.read', 'audit.read'
);

-- CLIENTE solo puede consultar y descargar su propia información.
INSERT IGNORE INTO roles_permisos_contamatic (rol, permiso_id)
SELECT 'CLIENTE', id
FROM permisos_contamatic
WHERE codigo IN ('document.read', 'document.download', 'dashboard.read');
