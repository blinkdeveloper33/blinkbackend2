// src/routes/plaidRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';
import {
  createLinkToken,
  exchangePublicToken,
  getTransactions,
  transactionsSyncHandler,
  syncBalancesHandler,
  handleWebhook,
  getRecentTransactions,
  getCurrentBalances,
  getAllTransactions,
  getDailyTransactionSummary,
  getSpendingSummary,
} from '../controllers/plaidController';
import authMiddleware from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';

const router: Router = express.Router();

/**
 * Custom validation middleware
 */
const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ 
          success: false,
          errors: errors.array() 
      });
      return;
    }
    next();
  };
};

/**
 * Rate limiter for webhook endpoint
 */
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});

/**
 * Webhook handler
 * No authentication, as it's from Plaid
 */
router.post('/webhook', webhookLimiter, handleWebhook);

// Apply authentication middleware for all routes below
router.use(authMiddleware);

/**
 * Create link token endpoint
 */
router.post(
  '/create_link_token',
  validate([
    body('userId')
      .notEmpty()
      .withMessage('User ID is required')
  ]),
  createLinkToken
);

/**
 * Exchange public token endpoint
 */
router.post(
  '/exchange_public_token',
  validate([
    body('publicToken')
      .notEmpty()
      .withMessage('Public Token is required'),
    body('userId')
      .notEmpty()
      .withMessage('User ID is required')
  ]),
  exchangePublicToken
);

/**
 * Sync transactions endpoint
 */
router.post(
  '/sync',
  validate([
    body('userId')
      .notEmpty()
      .withMessage('User ID is required')
  ]),
  transactionsSyncHandler
);

/**
 * Get transactions endpoint
 */
router.post(
  '/get_transactions',
  validate([
    body('userId')
      .notEmpty()
      .withMessage('User ID is required'),
    body('bankAccountId')
      .notEmpty()
      .withMessage('Bank Account ID is required'),
    body('startDate')
      .isISO8601()
      .withMessage('Start Date must be a valid ISO 8601 date'),
    body('endDate')
      .isISO8601()
      .withMessage('End Date must be a valid ISO 8601 date')
      .custom((endDate, { req }) => {
        if (new Date(endDate) < new Date(req.body.startDate)) {
          throw new Error('End Date must be after Start Date');
        }
        return true;
      }),
    body('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be a positive integer and not exceed 100')
  ]),
  getTransactions
);

/**
 * Sync balances endpoint
 */
router.post(
  '/sync_balances',
  validate([
    body('userId')
      .notEmpty()
      .withMessage('User ID is required')
  ]),
  syncBalancesHandler
);

/**
 * Get recent transactions endpoint
 */
router.get(
  '/recent-transactions/:userId',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getRecentTransactions(req, res);
  }
);

/**
 * Get current balances endpoint
 */
router.get(
  '/current-balances',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getCurrentBalances(req, res);
  }
);

/**
 * Get all transactions for a user
 * GET /api/plaid/all-transactions
 */
router.get(
  '/all-transactions',
  authMiddleware,
  getAllTransactions
);

/**
 * Get Daily Transaction Summary
 * GET /api/plaid/daily-transaction-summary
 */
router.get(
  '/daily-transaction-summary',
  authMiddleware,
  getDailyTransactionSummary
);

/**
* Get Spending Summary
* GET /api/plaid/spending-summary
*/
router.get(
 '/spending-summary',
 authMiddleware,
 getSpendingSummary
);

export default router;

