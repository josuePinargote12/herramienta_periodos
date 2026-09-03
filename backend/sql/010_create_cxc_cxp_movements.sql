/*
  Estructura para almacenar cargas y movimientos extraídos de Excel CxC/CxP.
  Las tablas ya existen en la base de desarrollo; este archivo documenta la migración.
*/

CREATE TABLE IF NOT EXISTS cxc_cxp_cargas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    period_id BIGINT UNSIGNED NOT NULL,
    document_id BIGINT UNSIGNED NOT NULL,
    account_type ENUM('CXC', 'CXP') NOT NULL,
    status ENUM('uploaded', 'processing', 'processed', 'validated', 'error') NOT NULL DEFAULT 'uploaded',
    total_rows INT UNSIGNED NOT NULL DEFAULT 0,
    valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
    error_rows INT UNSIGNED NOT NULL DEFAULT 0,
    processed_at DATETIME NULL,
    processed_by INT NULL,
    validation_notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cxc_cxp_carga_documento (document_id),
    KEY idx_cxc_cxp_cargas_period (period_id),
    KEY idx_cxc_cxp_cargas_type (account_type),
    KEY idx_cxc_cxp_cargas_status (status),
    CONSTRAINT fk_cxc_cxp_carga_period FOREIGN KEY (period_id) REFERENCES accounting_periods(id),
    CONSTRAINT fk_cxc_cxp_carga_document FOREIGN KEY (document_id) REFERENCES documentos_contables(id),
    CONSTRAINT fk_cxc_cxp_carga_user FOREIGN KEY (processed_by) REFERENCES usuarios(COD_USUEMP) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cxc_cxp_movimientos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    carga_id BIGINT UNSIGNED NOT NULL,
    source_row_number INT UNSIGNED NOT NULL,
    transaction_date DATE NULL,
    third_party_identification VARCHAR(20) NULL,
    third_party_name VARCHAR(255) NULL,
    document_type VARCHAR(50) NULL,
    document_number VARCHAR(80) NULL,
    description VARCHAR(500) NULL,
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    retention_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    pending_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    payment_status ENUM('pending', 'partial', 'paid', 'unknown') NOT NULL DEFAULT 'unknown',
    validation_status ENUM('valid', 'warning', 'error') NOT NULL DEFAULT 'valid',
    validation_message TEXT NULL,
    raw_data JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cxc_cxp_source_row (carga_id, source_row_number),
    KEY idx_cxc_cxp_mov_carga (carga_id),
    KEY idx_cxc_cxp_mov_date (transaction_date),
    KEY idx_cxc_cxp_mov_identification (third_party_identification),
    KEY idx_cxc_cxp_mov_status (payment_status),
    CONSTRAINT fk_cxc_cxp_mov_carga FOREIGN KEY (carga_id) REFERENCES cxc_cxp_cargas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
