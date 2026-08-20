CREATE TABLE sso_tickets (
  id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  user_id INT(11) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  ip VARCHAR(45) NULL DEFAULT NULL,
  ua_hash CHAR(64) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sso_tickets_token_hash (token_hash),
  INDEX idx_sso_tickets_user_id (user_id),
  INDEX idx_sso_tickets_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;