ALTER TABLE clientes
  ADD COLUMN taxpayer_type VARCHAR(50) NOT NULL DEFAULT 'Sociedad'
  AFTER tax_regime;
