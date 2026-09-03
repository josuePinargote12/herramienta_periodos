-- Guarda el comentario asociado al último envío del periodo.
ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS shared_comment VARCHAR(1000) NULL DEFAULT NULL;
