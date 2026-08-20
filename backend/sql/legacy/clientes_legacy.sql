CREATE TABLE clientes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ruc_cedula VARCHAR(13) NOT NULL UNIQUE,
  business_name VARCHAR(255) NOT NULL,
  responsible VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  tax_regime VARCHAR(100) NOT NULL DEFAULT 'General regime',
  accounting_required ENUM('Yes', 'No') NOT NULL DEFAULT 'Yes',
  disabled_at TIMESTAMP NULL DEFAULT NULL,
  disabled_by BIGINT NULL DEFAULT NULL,
  COD_USUEMP INT NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_clients_cod_usuemp (COD_USUEMP),

  CONSTRAINT fk_clients_users
    FOREIGN KEY (COD_USUEMP)
    REFERENCES usuarios (COD_USUEMP)
) ENGINE=InnoDB;
