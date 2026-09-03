-- Retención independiente utilizada exclusivamente para calcular el impuesto a la renta.
ALTER TABLE declaraciones_mensuales
  ADD COLUMN IF NOT EXISTS income_tax_retention_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER retention_amount;
