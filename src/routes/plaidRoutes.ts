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
  getTransactionCategoryAnalysis,
  getTransactionDetails,
  getSpendingAnalysis,
  getHistoricalSpending,
  getFinancialInsights,
  getRecurringExpenses,
  syncTransactions,
  getTransactionAnalysis,
  getCategories,
  createTransferAuthorization,
  createTransfer,
  createAssetReport,
  getItem,
  getItemProducts
} from '../controllers/plaidController';
import authMiddleware from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';

// Create separate routers for public and protected routes
const publicRouter: Router = express.Router();
const protectedRouter: Router = express.Router();

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

// Public Routes
publicRouter.post('/webhook', webhookLimiter, handleWebhook);
publicRouter.post('/categories/get', getCategories);

// Protected Routes with validation middleware
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

// Add all protected routes
protectedRouter.post(
  '/create_link_token',
  validate([
    body('userId').notEmpty().withMessage('User ID is required')
  ]),
  createLinkToken
);

/**
 * Exchange public token endpoint
 */
protectedRouter.post(
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
protectedRouter.post(
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
protectedRouter.post(
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
protectedRouter.post(
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
protectedRouter.get(
  '/recent-transactions/:userId',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getRecentTransactions(req, res);
  }
);

/**
 * Get current balances endpoint
 */
protectedRouter.get(
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
protectedRouter.get(
  '/all-transactions',
  authMiddleware,
  getAllTransactions
);

/**
 * Get Daily Transaction Summary
 * GET /api/plaid/daily-transaction-summary
 */
protectedRouter.get(
  '/daily-transaction-summary',
  authMiddleware,
  getDailyTransactionSummary
);

/**
* Get Spending Summary
* GET /api/plaid/spending-summary
*/
protectedRouter.get(
 '/spending-summary',
 authMiddleware,
 getSpendingSummary
);

/**
* Get Transaction Category Analysis
* GET /api/plaid/category-analysis
*/
protectedRouter.get(
  '/category-analysis',
  authMiddleware,
  getTransactionCategoryAnalysis
);

/**
 * Get transaction details endpoint
 */
protectedRouter.get(
  '/transactions/:transactionId',
  authMiddleware,
  getTransactionDetails
);

/**
 * Get comprehensive spending analysis
 * GET /api/plaid/spending-analysis
 */
protectedRouter.get(
  '/spending-analysis',
  authMiddleware,
  getSpendingAnalysis
);

/**
 * Get historical spending totals
 * GET /api/plaid/historical-spending
 */
protectedRouter.get(
  '/historical-spending',
  authMiddleware,
  getHistoricalSpending
);

/**
 * Get comprehensive financial insights
 * GET /api/plaid/financial-insights
 */
protectedRouter.get(
  '/financial-insights',
  authMiddleware,
  getFinancialInsights
);

/**
 * Get recurring expenses analysis
 * GET /api/plaid/recurring-expenses
 */
protectedRouter.get(
  '/recurring-expenses',
  authMiddleware,
  getRecurringExpenses
);

/**
 * Sync transactions endpoint
 */
protectedRouter.post(
  '/transactions/sync',
  authMiddleware,
  validate([
    body('cursor').optional(),
    body('count').optional().isInt({ min: 1, max: 500 }),
    body('options').optional().isObject()
  ]),
  syncTransactions
);

/**
 * Get transaction analysis
 * GET /api/plaid/transaction-analysis
 */
protectedRouter.get('/transaction-analysis', authMiddleware, getTransactionAnalysis);

/**
 * Create transfer authorization endpoint
 */
protectedRouter.post(
  '/transfer/authorization/create',
  validate([
    body('access_token').notEmpty().withMessage('Access token is required'),
    body('account_id').notEmpty().withMessage('Account ID is required'),
    body('type').isIn(['debit', 'credit']).withMessage('Type must be either debit or credit'),
    body('network').isIn(['ach', 'same-day-ach', 'rtp']).withMessage('Network must be one of: ach, same-day-ach, rtp'),
    body('amount')
      .notEmpty()
      .matches(/^\d+\.\d{2}$/)
      .withMessage('Amount must be a decimal string with two digits of precision')
      .custom((value) => {
        const amount = parseFloat(value);
        if (amount < 200 || amount > 250) {
          throw new Error('Amount must be between $200 and $250');
        }
        return true;
      }),
    body('user.legal_name').notEmpty().withMessage('User legal name is required'),
    body('ach_class')
      .optional()
      .equals('ccd')
      .withMessage('Only CCD (Corporate Credit or Debit) is supported for bank account transfers')
      .custom((value, { req }) => {
        const network = req.body.network;
        if (network.startsWith('ach') && !value) {
          throw new Error('ACH class is required for ACH transfers and must be CCD');
        }
        return true;
      }),
    body('iso_currency_code').optional().isString().withMessage('Invalid currency code'),
    body('idempotency_key')
      .optional()
      .isString()
      .isLength({ max: 50 })
      .withMessage('Idempotency key must not exceed 50 characters'),
    body('user_present').optional().isBoolean(),
    body('device').optional().isObject(),
    body('device.ip_address').optional().isIP().withMessage('Invalid IP address'),
    body('device.user_agent').optional().isString(),
    body('user.phone_number').optional().isString(),
    body('user.email_address').optional().isEmail().withMessage('Invalid email address'),
    body('user.address').optional().isObject(),
    body('user.address.street').optional().isString(),
    body('user.address.city').optional().isString(),
    body('user.address.region').optional().isString(),
    body('user.address.postal_code').optional().isString(),
    body('user.address.country').optional().isString().isLength({ min: 2, max: 2 }).withMessage('Country must be a two-letter code')
  ]),
  createTransferAuthorization
);

/**
 * Create transfer endpoint
 */
protectedRouter.post(
  '/transfer/create',
  authMiddleware,
  validate([
    body('account_id')
      .notEmpty()
      .withMessage('Account ID is required'),
    body('authorization_id')
      .notEmpty()
      .withMessage('Authorization ID is required'),
    body('description')
      .notEmpty()
      .isLength({ max: 15 })
      .withMessage('Description is required and must not exceed 15 characters'),
    body('amount')
      .optional()
      .matches(/^\d+\.\d{2}$/)
      .withMessage('Amount must be a decimal with two digits of precision'),
    body('metadata')
      .optional()
      .isObject()
      .custom((value) => {
        const keys = Object.keys(value || {});
        if (keys.length > 50) {
          throw new Error('Maximum of 50 key/value pairs allowed in metadata');
        }
        for (const key of keys) {
          if (key.length > 40) {
            throw new Error('Maximum key length is 40 characters');
          }
          if (typeof value[key] !== 'string') {
            throw new Error('Metadata values must be strings');
          }
          if (value[key].length > 500) {
            throw new Error('Maximum value length is 500 characters');
          }
          if (!/^[\x00-\x7F]*$/.test(value[key])) {
            throw new Error('Only ASCII characters are allowed in metadata values');
          }
        }
        return true;
      }),
    body('test_clock_id')
      .optional()
      .isString(),
    body('facilitator_fee')
      .optional()
      .matches(/^\d+\.\d{2}$/)
      .withMessage('Facilitator fee must be a decimal with two digits of precision')
  ]),
  createTransfer
);

// Protected Routes (require authentication)
protectedRouter.post('/link/token/create', authMiddleware, createLinkToken);
protectedRouter.post('/item/public_token/exchange', authMiddleware, exchangePublicToken);
protectedRouter.post('/asset_report/create', authMiddleware, createAssetReport);
protectedRouter.post('/item/get',
  authMiddleware,
  validate([
    body('access_token')
      .notEmpty()
      .withMessage('Access token is required')
  ]),
  getItem
);
protectedRouter.post('/item/products', authMiddleware, getItemProducts);

export { publicRouter, protectedRouter };

