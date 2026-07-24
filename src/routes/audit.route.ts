import { Router } from 'express';

import { auditController } from '../controllers/audit.controller.js';
import { auditRateLimitMiddleware } from '../middleware/audit-rate-limit.middleware.js';

export const auditRouter = Router();

auditRouter.post('/', auditRateLimitMiddleware, auditController);
