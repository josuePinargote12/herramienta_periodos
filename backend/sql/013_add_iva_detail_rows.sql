ALTER TABLE declaraciones_mensuales
  ADD COLUMN iva_detail_rows JSON NULL AFTER iva_details;
