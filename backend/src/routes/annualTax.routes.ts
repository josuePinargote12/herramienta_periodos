// Rutas del cierre anual del Impuesto a la Renta.
// Este router se registra posteriormente en server.ts bajo /api/annual-tax.
import { Router } from 'express';
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
import { validateOptionalUploadedFiles, persistValidatedFiles } from '../middleware/fileValidator.js';
import { validateBody, annualPaymentBodySchema } from '../middleware/bodyValidator.js';
import { upload } from '../config/upload.js';

const router = Router();
// El cierre anual y la configuración tributaria requieren income_tax.configure.

// Consulta la configuración, el estado y la base acumulada del año.
router.get('/clients/:clientId/annual-tax/:fiscalYear', requirePermission('income_tax.configure'), getAnnualTax);
router.get('/clients/:clientId/annual-tax-detail/:fiscalYear', requireAccountingRole(), getAnnualDetail);
router.get('/clients/:clientId/annual-tax-detail/:fiscalYear/excel', requireAccountingRole(), exportAnnualDetailExcel);
router.get('/clients/:clientId/annual-tax-detail/:fiscalYear/pdf', requireAccountingRole(), exportAnnualDetailPdf);
router.post('/clients/:clientId/annual-tax/:fiscalYear/accumulate', requirePermission('income_tax.configure'), accumulateAnnualTax);

// Congela el acumulado y calcula el impuesto anual.
router.post('/clients/:clientId/annual-tax/:fiscalYear/close', requirePermission('income_tax.configure'), upload.single('form101'), validateOptionalUploadedFiles(), persistValidatedFiles(), closeAnnualTax);

// Vincula el documento previamente cargado del Formulario 101.
router.post('/annual-tax/:id/present', requirePermission('income_tax.configure'), upload.single('form101'), validateOptionalUploadedFiles(), persistValidatedFiles(), presentAnnualTax);
router.get('/annual-tax/:id/form101', requirePermission('document.download'), downloadAnnualForm101);

// Registra el pago de una declaración ya presentada.
router.post('/annual-tax/:id/pay', requirePermission('income_tax.configure'), validateBody(annualPaymentBodySchema), payAnnualTax);

export default router;
