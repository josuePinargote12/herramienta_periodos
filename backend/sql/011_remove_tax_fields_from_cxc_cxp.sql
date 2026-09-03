/* CxC/CxP conserva únicamente valores propios de cartera.
   IVA y retenciones pertenecen al módulo de declaraciones mensuales. */

ALTER TABLE cxc_cxp_movimientos
  DROP COLUMN subtotal,
  DROP COLUMN tax_amount,
  DROP COLUMN retention_amount;
