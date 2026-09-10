import { Router } from 'express';
import { requirePermission } from '../middleware/permission.middleware.js';
import { importPortfolio, listPortfolio, portfolioSummary, previewPortfolio } from '../controllers/portfolio.controller.js';
import { validateAnyUploadedFiles, persistValidatedFiles } from '../middleware/fileValidator.js';
import { validateBody, portfolioBodySchema } from '../middleware/bodyValidator.js';
import { upload } from '../config/upload.js';

const router = Router();

router.post('/periods/:id/portfolio/preview', requirePermission('document.read'), upload.single('file'), validateAnyUploadedFiles(), validateBody(portfolioBodySchema), persistValidatedFiles(), previewPortfolio);
router.post('/periods/:id/portfolio/import', requirePermission('document.upload'), upload.single('file'), validateAnyUploadedFiles(), validateBody(portfolioBodySchema), persistValidatedFiles(), importPortfolio);
router.get('/periods/:id/portfolio', requirePermission('document.read'), listPortfolio);
router.get('/clients/:clientId/portfolio/:fiscalYear/summary', requirePermission('document.read'), portfolioSummary);

export default router;
