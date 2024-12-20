// src/routes/cashFlowRoutes.ts

import express, { Router } from 'express';
import { getCashFlowAnalysis } from '../controllers/cashFlowController';
import authMiddleware from '../middleware/authMiddleware';

const router: Router = express.Router();

// Apply authentication middleware for all routes
router.use(authMiddleware);

/**
* Get Cash Flow Analysis
* GET /api/cash-flow/analysis
*/
router.get(
  '/analysis',
  getCashFlowAnalysis
);

export default router;

