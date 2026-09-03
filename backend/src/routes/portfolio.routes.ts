import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { requirePermission } from '../middleware/permission.middleware.js';
import { importPortfolio, listPortfolio, portfolioSummary, previewPortfolio } from '../controllers/portfolio.controller.js';

const router = Router();
const uploadDir = path.resolve('storage/accounting');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/periods/:id/portfolio/preview', requirePermission('document.read'), upload.single('file'), previewPortfolio);
router.post('/periods/:id/portfolio/import', requirePermission('document.upload'), upload.single('file'), importPortfolio);
router.get('/periods/:id/portfolio', requirePermission('document.read'), listPortfolio);
router.get('/clients/:clientId/portfolio/:fiscalYear/summary', requirePermission('document.read'), portfolioSummary);

export default router;
