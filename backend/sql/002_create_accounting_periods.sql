CREATE TABLE IF NOT EXISTS accounting_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id CHAR(36) NOT NULL,
  fiscal_year SMALLINT UNSIGNED NOT NULL,
  fiscal_month TINYINT UNSIGNED NOT NULL,
  status ENUM('Pending','In Progress','Completed') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_accounting_period (client_id, fiscal_year, fiscal_month),
  KEY idx_accounting_period_client (client_id), KEY idx_accounting_period_year (fiscal_year),
  CONSTRAINT fk_accounting_period_cliente FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
