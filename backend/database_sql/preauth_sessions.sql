CREATE TABLE preauth_sessions (
  id_hash CHAR(64) NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT(3) UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id_hash),
  INDEX idx_preauth_sessions_user_id (user_id),
  INDEX idx_preauth_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;