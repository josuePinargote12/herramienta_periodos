/**
 * Validación y sanitización de cuerpos HTTP.
 * Los schemas Zod transforman valores provenientes de JSON o multipart/form-data
 * antes de que lleguen a los controllers.
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

// Elimina caracteres de control, etiquetas HTML simples y espacios exteriores.
const clean = (value: unknown) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim()
  : value;

// Constructores reutilizables para campos de texto y números no negativos.
export const text = (max = 2000) => z.preprocess(clean, z.string().max(max));
export const optionalText = (max = 2000) => text(max).optional();
export const nonNegativeNumber = z.preprocess(value => value === '' || value == null ? undefined : Number(value), z.number().finite().nonnegative().optional());

// Datos adicionales enviados junto con cargas de CxC/CxP.
export const portfolioBodySchema = z.object({
  accountType: z.preprocess(value => value == null || value === '' ? undefined : String(value).toUpperCase(), z.enum(['CXC', 'CXP']).optional()),
  manualValues: optionalText(5000)
});

// Metadatos que acompañan a documentos contables múltiples.
export const documentsBodySchema = z.object({
  group: optionalText(100),
  types: optionalText(500),
  manualValues: optionalText(5000)
});

// Valores manuales de declaraciones mensuales.
export const declarationBodySchema = z.object({
  iva: nonNegativeNumber,
  ivaCosts: nonNegativeNumber,
  ivaValues: nonNegativeNumber,
  employeeExpense: nonNegativeNumber,
  retentions: nonNegativeNumber,
  type: optionalText(30)
});

// Datos necesarios para registrar el pago del impuesto anual.
export const annualPaymentBodySchema = z.object({
  paidAmount: z.preprocess(value => Number(value), z.number().finite().nonnegative()),
  paymentDate: z.preprocess(clean, z.string().max(20).regex(/^\d{4}-\d{2}-\d{2}$/))
});

// Datos de creación y edición de clientes.
export const clientBodySchema = z.object({
  idType: text(20).optional(), ruc: text(20).optional(), name: text(200).optional(), owner: text(200).optional(),
  email: text(254).optional(), phone: text(30).optional(), clientStatus: text(50).optional(), taxRegime: text(100).optional(),
  taxpayerType: text(50).optional(), accounting: text(10).optional(),
  assignedUserCode: z.preprocess(value => value == null || value === '' ? undefined : Number(value), z.number().int().positive().optional())
});

// Datos para abrir todos los períodos de un año.
export const periodYearBodySchema = z.object({
  year: z.preprocess(value => Number(value), z.number().int().min(2000).max(2100)),
  clientId: text(100), frequency: text(30).optional()
});

// Datos para abrir un solo período mensual.
export const periodBodySchema = periodYearBodySchema.extend({
  month: z.preprocess(value => Number(value), z.number().int().min(1).max(12))
});

// Estados permitidos como texto antes de la validación de negocio del modelo.
export const periodUpdateBodySchema = z.object({ status: text(30) });

// Configuración del impuesto a la renta y apertura de períodos.
export const incomeTaxBodySchema = z.object({
  taxpayer: text(50).optional(), regime: text(100).optional(), accounting: text(10).optional(), taxType: text(50).optional(),
  rate: z.preprocess(value => value === '' || value == null ? undefined : Number(value), z.number().finite().nonnegative().optional()),
  formula: optionalText(500), periodicity: text(30).optional(),
  enabled: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean().optional()),
  createPeriods: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean().optional()),
  apertureYear: z.preprocess(value => value === '' || value == null ? undefined : Number(value), z.number().int().min(2000).max(2100).optional())
});

export function validateBody(schema: z.ZodType) {
  // Ejecuta el schema, devuelve errores 400 y reemplaza req.body con los datos
  // ya transformados y sanitizados.
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) return res.status(400).json({ ok: false, error: 'Los datos enviados no son válidos', details: result.error.flatten().fieldErrors });
    req.body = result.data;
    return next();
  };
}
