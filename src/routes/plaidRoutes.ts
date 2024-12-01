// src/routes/plaidRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';
import {
  createLinkToken,
  exchangePublicToken,
  getTransactions,
  transactionsSyncHandler,
  generateSandboxPublicToken,
  syncTransactionsForUser,
  syncBalancesHandler,
  fetchAndStoreAccountBalances
} from '../controllers/plaidController';
import authMiddleware from '../middleware/authMiddleware';
import logger from '../services/logger';
import supabase from '../services/supabaseService';
import crypto from 'crypto';
import config from '../config';

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
 * Webhook handler
 * No authentication, as it's from Plaid
 */
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-plaid-signature'] as string;
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', config.PLAID_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid webhook signature');
      res.status(400).json({ 
        success: false,
        error: 'Invalid signature' 
      });
      return;
    }

    const { webhook_type, webhook_code, item_id } = req.body;

    logger.info(`Received webhook: Type=${webhook_type}, Code=${webhook_code}, Item ID=${item_id}`);

    // Handle specific webhook events
    if (webhook_type === 'TRANSACTIONS') {
      if (['SYNC_UPDATES_AVAILABLE', 'RECURRING_TRANSACTIONS_UPDATE'].includes(webhook_code)) {
        // Find the user_id associated with the item_id
        const { data: bankAccount, error: bankError } = await supabase
          .from('bank_accounts')
          .select('user_id')
          .eq('plaid_item_id', item_id)
          .single();

        if (bankError || !bankAccount) {
          logger.error(`Failed to find bank account for item_id: ${item_id}`, bankError?.message);
          res.status(400).json({ 
            success: false,
            error: 'User not found for the provided item_id' 
          });
          return;
        }

        const userId = bankAccount.user_id;

        try {
          const stats = await syncTransactionsForUser(userId);
          // Also fetch and store balances
          await fetchAndStoreAccountBalances(userId);

          logger.info(`Synchronization triggered for userId: ${userId}. Stats: Added=${stats.added}, Modified=${stats.modified}, Removed=${stats.removed}`);
          res.status(200).json({ 
            success: true, 
            message: 'Webhook received and synchronization triggered' 
          });
        } catch (syncError: any) {
          logger.error(`Error synchronizing transactions for userId: ${userId}`, syncError.message);
          res.status(500).json({ 
            success: false, 
            error: 'Failed to synchronize transactions', 
            details: syncError.message 
          });
        }

      } else {
        logger.info(`Unhandled TRANSACTIONS webhook_code: ${webhook_code}`);
        res.status(200).json({ 
          success: true,
          message: 'Webhook received' 
        });
      }
    } else {
      logger.info(`Unhandled webhook_type: ${webhook_type}, webhook_code: ${webhook_code}`);
      res.status(200).json({ 
        success: true,
        message: 'Webhook received' 
      });
    }
  } catch (error: any) {
    logger.error('Webhook Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

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
      })
  ]),
  getTransactions
);

/**
 * Sandbox Public Token Generation Endpoint
 */
router.post(
  '/sandbox/public_token/create',
  validate([
    body('institution_id')
      .optional()
      .isString()
      .withMessage('Institution ID must be a string'),
    body('initial_products')
      .optional()
      .isArray()
      .withMessage('Initial Products must be an array of strings'),
    body('webhook')
      .optional()
      .isURL()
      .withMessage('Webhook must be a valid URL'),
  ]),
  generateSandboxPublicToken
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

export default router;
