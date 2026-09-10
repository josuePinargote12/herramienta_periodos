ALTER TABLE estados_financieros_resumen
  ADD COLUMN IF NOT EXISTS activo_corriente DECIMAL(14,2) NULL AFTER results_document_id,
  ADD COLUMN IF NOT EXISTS activo_no_corriente DECIMAL(14,2) NULL AFTER activo_corriente,
  ADD COLUMN IF NOT EXISTS pasivo_corriente DECIMAL(14,2) NULL AFTER total_activos,
  ADD COLUMN IF NOT EXISTS pasivo_no_corriente DECIMAL(14,2) NULL AFTER pasivo_corriente;
