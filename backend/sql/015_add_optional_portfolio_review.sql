-- Permite conservar que CxC/CxP fue revisado aunque no se haya cargado un archivo.
ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS portfolio_reviewed TINYINT(1) NOT NULL DEFAULT 0;
