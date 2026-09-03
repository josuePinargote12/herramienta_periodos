-- Guarda el acumulado anual del Módulo 5 sin crear una tabla nueva.
-- El cálculo del Impuesto a la Renta se implementará posteriormente.
ALTER TABLE declaraciones_anuales
  MODIFY COLUMN income_tax_config_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS iva_accumulated DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER accumulated_base,
  ADD COLUMN IF NOT EXISTS retentions_accumulated DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER iva_accumulated,
  ADD COLUMN IF NOT EXISTS accumulated_calculated_at DATETIME NULL AFTER retentions_accumulated,
  ADD COLUMN IF NOT EXISTS accumulated_calculated_by INT NULL AFTER accumulated_calculated_at;

ALTER TABLE declaraciones_anuales
  ADD KEY IF NOT EXISTS idx_declaraciones_anuales_accumulated_at (accumulated_calculated_at);
