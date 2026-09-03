-- Casilleros del Formulario 104/104A utilizados por cálculos posteriores.
-- iva_amount se conserva como total declarado para compatibilidad.
ALTER TABLE declaraciones_mensuales
  ADD COLUMN iva_costs_amount DECIMAL(14,2) NULL AFTER iva_amount,
  ADD COLUMN iva_values_amount DECIMAL(14,2) NULL AFTER iva_costs_amount,
  ADD COLUMN iva_details JSON NULL AFTER iva_values_amount;
