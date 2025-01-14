// src/routes/cashFlowRoutes.ts

import express, { Router } from 'express';
import { 
  getCashFlowAnalysis,
  getCashFlowTrends,
  getFinancialHealthScore,
  getIncomeSourceAnalysis,
  getExpenseToIncomeAnalysis,
  getCashFlowForecast
} from '../controllers/cashFlowController';
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

/**
* Get Cash Flow Trends
* GET /api/cash-flow/trends
*/
router.get(
  '/trends',
  getCashFlowTrends
);

/**
* Get Financial Health Score
* GET /api/cash-flow/health-score
*/
router.get(
  '/health-score',
  getFinancialHealthScore
);

/**
* Get Income Source Analysis
* GET /api/cash-flow/income-analysis
*/
router.get(
  '/income-analysis',
  getIncomeSourceAnalysis
);

/**
* Get Expense to Income Analysis
* GET /api/cash-flow/expense-analysis
*/
router.get(
  '/expense-analysis',
  getExpenseToIncomeAnalysis
);

/**
* Get Cash Flow Forecast
* GET /api/cash-flow/forecast
*/
router.get(
  '/forecast',
  getCashFlowForecast
);

export default router;

