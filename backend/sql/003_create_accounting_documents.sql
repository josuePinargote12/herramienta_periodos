-- Documentos/versiones del flujo mensual.
CREATE TABLE IF NOT EXISTS documentos_contables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  document_group ENUM('Financial Statements','Portfolio','Declaration','Income Tax') NOT NULL,
  document_type VARCHAR(80) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size BIGINT UNSIGNED NULL,
  delivery_status ENUM('Pending','Sent','Delivered') NOT NULL DEFAULT 'Pending',
  notes TEXT NULL,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_documento_contable_version (period_id, document_group, document_type, version),
  KEY idx_documentos_contables_period (period_id),
  KEY idx_documentos_contables_group (document_group),
  CONSTRAINT fk_documentos_contables_period
    FOREIGN KEY (period_id) REFERENCES accounting_periods(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Valores y PDFs de IVA/retenciones. Un registro por periodo.
CREATE TABLE IF NOT EXISTS declaraciones_mensuales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  iva_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  retention_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  iva_document_id BIGINT UNSIGNED NULL,
  retention_document_id BIGINT UNSIGNED NULL,
  registered_by INT NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_declaracion_mensual_periodo (period_id),
  KEY idx_declaraciones_mensuales_period (period_id),
  CONSTRAINT fk_declaraciones_mensuales_period
    FOREIGN KEY (period_id) REFERENCES accounting_periods(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_declaraciones_mensuales_iva_documento
    FOREIGN KEY (iva_document_id) REFERENCES documentos_contables(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_declaraciones_mensuales_retencion_documento
    FOREIGN KEY (retention_document_id) REFERENCES documentos_contables(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Configuración de impuesto a la renta por cliente y año fiscal.
CREATE TABLE IF NOT EXISTS configuraciones_impuesto_renta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id CHAR(36) NOT NULL,
  fiscal_year SMALLINT UNSIGNED NOT NULL,
  taxpayer_type VARCHAR(50) NOT NULL,
  tax_regime VARCHAR(80) NOT NULL,
  accounting_required ENUM('Yes','No') NOT NULL DEFAULT 'Yes',
  tax_type VARCHAR(80) NOT NULL DEFAULT 'Income Tax',
  rate DECIMAL(7,4) NULL,
  formula VARCHAR(255) NULL,
  periodicity ENUM('Annual','Advances','Annual + Advances','Other') NOT NULL DEFAULT 'Annual',
  rules_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_impuesto_renta_cliente_anio (client_id, fiscal_year),
  KEY idx_impuesto_renta_cliente (client_id),
  CONSTRAINT fk_impuesto_renta_cliente
    FOREIGN KEY (client_id) REFERENCES clientes(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
