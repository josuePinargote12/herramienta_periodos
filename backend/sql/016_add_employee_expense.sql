-- Gasto mensual de empleados utilizado como parte de los costos para la utilidad.
ALTER TABLE declaraciones_mensuales
  ADD COLUMN IF NOT EXISTS employee_expense_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER iva_values_amount;
