ALTER TABLE clientes
  ADD COLUMN identification_type ENUM('ruc', 'cedula', 'passport') NOT NULL DEFAULT 'ruc' AFTER ruc_cedula;

UPDATE clientes
SET identification_type = CASE
  WHEN CHAR_LENGTH(ruc_cedula) = 10 THEN 'cedula'
  ELSE 'ruc'
END
WHERE identification_type = 'ruc';
