// Rutas del cierre anual del Impuesto a la Renta.
// Este router se registra posteriormente en server.ts bajo /api/annual-tax.
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {
  closeAnnualTax,
  accumulateAnnualTax,
  downloadAnnualForm101,
  getAnnualTax,
  payAnnualTax,
  presentAnnualTax
} from '../controllers/annualTax.controller.js';
import { requirePermission, requireAccountingRole } from '../middleware/permission.middleware.js';
import { getAnnualDetail, exportAnnualDetailExcel, exportAnnualDetailPdf } from '../controllers/annualTaxDetail.controller.js';

const router = Router();
const uploadDir = path.resolve('storage/accounting');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 15 * 1024 * 1024 } });
// El cierre anual y la configuración tributaria requieren income_tax.configure.

// Consulta la configuración, el estado y la base acumulada del año.
router.get('/clients/:clientId/annual-tax/:fiscalYear', requirePermission('income_tax.configure'), getAnnualTax);
router.get('/clients/:clientId/annual-tax-detail/:fiscalYear', requireAccountingRole(), getAnnualDetail);
router.get('/clients/:clientId/annual-tax-detail/:fiscalYear/excel', requireAccountingRole(), exportAnnualDetailExcel);
router.get('/clients/:clientId/annual-tax-detail/:fiscalYear/pdf', requireAccountingRole(), exportAnnualDetailPdf);
router.post('/clients/:clientId/annual-tax/:fiscalYear/accumulate', requirePermission('income_tax.configure'), accumulateAnnualTax);

// Congela el acumulado y calcula el impuesto anual.
router.post('/clients/:clientId/annual-tax/:fiscalYear/close', requirePermission('income_tax.configure'), upload.single('form101'), closeAnnualTax);

// Vincula el documento previamente cargado del Formulario 101.
router.post('/annual-tax/:id/present', requirePermission('income_tax.configure'), upload.single('form101'), presentAnnualTax);
router.get('/annual-tax/:id/form101', requirePermission('document.download'), downloadAnnualForm101);

// Registra el pago de una declaración ya presentada.
router.post('/annual-tax/:id/pay', requirePermission('income_tax.configure'), payAnnualTax);

export default router;
