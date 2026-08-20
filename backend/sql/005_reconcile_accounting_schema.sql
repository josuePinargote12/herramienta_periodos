-- Reconciliación idempotente para instalaciones existentes.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_by BIGINT NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS configuraciones_periodos (
  client_id CHAR(36) NOT NULL,
  fiscal_year SMALLINT UNSIGNED NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'Mensual',
  PRIMARY KEY (client_id, fiscal_year),
  CONSTRAINT fk_config_periodos_cliente FOREIGN KEY (client_id)
    REFERENCES clientes(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shared_by BIGINT NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS accounting_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NULL,
  period_id BIGINT UNSIGNED NULL,
  document_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  details JSON NULL,
  user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_client (client_id),
  KEY idx_audit_period (period_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_client FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_period FOREIGN KEY (period_id) REFERENCES accounting_periods(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_document FOREIGN KEY (document_id) REFERENCES documentos_contables(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
