-- Casilleros del Formulario 103 para consulta y cálculos posteriores.
-- retention_amount se conserva como total de retenciones declarado.
ALTER TABLE declaraciones_mensuales
  ADD COLUMN retention_details JSON NULL AFTER retention_amount,
  ADD COLUMN retention_detail_rows JSON NULL AFTER retention_details;
