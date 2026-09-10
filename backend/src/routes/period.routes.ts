import { Router } from 'express';
import { createPeriodYear, createSinglePeriod, listPeriodYears, listPeriods, markPortfolioReviewed, sharePeriod, updatePeriod } from '../controllers/period.controller.js';
import { downloadDocument, listDocuments, listDocumentsByClient, updateDeliveryStatus, uploadDocuments } from '../controllers/document.controller.js';
import { deleteDeclarationDocument, getDeclaration, parseDeclarationPdf, parseFinancialStatementFile, saveDeclaration, updateEmployeeExpense, updateIncomeTaxRetention, updateRetention } from '../controllers/declaration.controller.js';
import { exportDeclarationsExcel } from '../controllers/declarationExport.controller.js';
import { previewDeclarationsPdf } from '../controllers/declarationPdf.controller.js';
import { requireAnyPermission, requirePermission } from '../middleware/permission.middleware.js';
import { createCombinedPreviewLink, createCombinedShareLink } from '../controllers/combinedShare.controller.js';
import { validateAnyUploadedFiles, validateFile, validateOptionalUploadedFiles, persistValidatedFiles } from '../middleware/fileValidator.js';
import { validateBody, declarationBodySchema, documentsBodySchema, periodYearBodySchema, periodBodySchema, periodUpdateBodySchema } from '../middleware/bodyValidator.js';
import { upload } from '../config/upload.js';

const router = Router();
// Las rutas de periodos, documentos y declaraciones quedan protegidas por acción.

router.get('/years', requirePermission('period.read'), listPeriodYears);
router.post('/years', requirePermission('period.create'), validateBody(periodYearBodySchema), createPeriodYear);
router.post('/single', requirePermission('period.create'), validateBody(periodBodySchema), createSinglePeriod);
router.get('/', requirePermission('period.read'), listPeriods);
router.get('/documents', requirePermission('document.read'), listDocumentsByClient);
router.get('/declarations/export', requirePermission('declaration.manage'), exportDeclarationsExcel);
router.get('/declarations/preview-pdf', requirePermission('declaration.manage'), previewDeclarationsPdf);
router.get('/:id/documents/:documentId/download', requirePermission('document.download'), downloadDocument);
router.get('/:id/documents', requirePermission('document.read'), listDocuments);
router.patch('/:id/documents/:documentId/delivery-status', requirePermission('document.share'), updateDeliveryStatus);
router.get('/:id/declaration', requirePermission('declaration.manage'), getDeclaration);
router.patch('/:id/declaration/employee-expense', requirePermission('declaration.manage'), updateEmployeeExpense);
router.patch('/:id/declaration/retentions', requirePermission('declaration.manage'), updateRetention);
router.patch('/:id/declaration/income-tax-retention', requirePermission('declaration.manage'), updateIncomeTaxRetention);
router.post('/declaration/parse', requirePermission('declaration.manage'), upload.single('file'), validateFile('pdf'), persistValidatedFiles(), parseDeclarationPdf);
router.post('/financial-statements/parse', requirePermission('document.upload'), upload.single('file'), validateAnyUploadedFiles(), persistValidatedFiles(), parseFinancialStatementFile);
router.delete('/:id/declaration/:type', requirePermission('declaration.manage'), deleteDeclarationDocument);
router.patch('/:id', requireAnyPermission('period.update', 'period.complete'), validateBody(periodUpdateBodySchema), updatePeriod);
router.patch('/:id/steps/portfolio', requirePermission('period.update'), markPortfolioReviewed);
router.post('/:id/share', requirePermission('document.share'), sharePeriod);
router.post('/:id/share-pdf-link', requirePermission('document.share'), createCombinedShareLink);
router.post('/:id/preview-pdf-link', requirePermission('document.share'), createCombinedPreviewLink);
router.post('/:id/documents', requirePermission('document.upload'), upload.array('files', 10), validateAnyUploadedFiles(), validateBody(documentsBodySchema), persistValidatedFiles(), uploadDocuments);
router.post('/:id/declaration', requirePermission('declaration.manage'), upload.fields([{ name: 'ivaFile', maxCount: 1 }, { name: 'retentionFile', maxCount: 1 }]), validateOptionalUploadedFiles('pdf'), validateBody(declarationBodySchema), persistValidatedFiles(), saveDeclaration);

export default router;
