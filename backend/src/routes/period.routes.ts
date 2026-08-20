import { Router } from 'express';
import { createPeriodYear, listPeriodYears, listPeriods, sharePeriod, updatePeriod } from '../controllers/period.controller.js';
import { downloadDocument, listDocuments, listDocumentsByClient, updateDeliveryStatus, uploadDocuments } from '../controllers/document.controller.js';
import { deleteDeclarationDocument, getDeclaration, parseDeclarationPdf, saveDeclaration } from '../controllers/declaration.controller.js';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { requireAnyPermission, requirePermission } from '../middleware/permission.middleware.js';

const router = Router();
const uploadDir = path.resolve('storage/accounting');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
// Las rutas de periodos, documentos y declaraciones quedan protegidas por acción.

router.get('/years', requirePermission('period.read'), listPeriodYears);
router.post('/years', requirePermission('period.create'), createPeriodYear);
router.get('/', requirePermission('period.read'), listPeriods);
router.get('/documents', requirePermission('document.read'), listDocumentsByClient);
router.get('/:id/documents/:documentId/download', requirePermission('document.download'), downloadDocument);
router.get('/:id/documents', requirePermission('document.read'), listDocuments);
router.patch('/:id/documents/:documentId/delivery-status', requirePermission('document.share'), updateDeliveryStatus);
router.get('/:id/declaration', requirePermission('declaration.manage'), getDeclaration);
router.post('/declaration/parse', requirePermission('declaration.manage'), upload.single('file'), parseDeclarationPdf);
router.delete('/:id/declaration/:type', requirePermission('declaration.manage'), deleteDeclarationDocument);
router.patch('/:id', requireAnyPermission('period.update', 'period.complete'), updatePeriod);
router.post('/:id/share', requirePermission('document.share'), sharePeriod);
router.post('/:id/documents', requirePermission('document.upload'), upload.array('files', 10), uploadDocuments);
router.post('/:id/declaration', requirePermission('declaration.manage'), upload.fields([{ name: 'ivaFile', maxCount: 1 }, { name: 'retentionFile', maxCount: 1 }]), saveDeclaration);

export default router;
