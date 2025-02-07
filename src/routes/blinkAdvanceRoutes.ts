// src/routes/blinkAdvanceRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, param, ValidationChain, validationResult } from 'express-validator';
import {
  createBlinkAdvance,
  getBlinkAdvances,
  getBlinkAdvanceById,
  updateBlinkAdvanceStatus,
  checkActiveAdvance,
  getBlinkAdvanceApprovalStatus
} from '../controllers/blinkAdvanceController';
import authMiddleware from '../middleware/authMiddleware';

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
 * Get Blink Advance Approval Status
 * GET /api/blink-advances/approval-status
 * Returns whether the user is approved for Blink Advances
 */
router.get(
  '/approval-status',
  authMiddleware,
  getBlinkAdvanceApprovalStatus
);

/**
 * Check Active Advance
 * GET /api/blink-advances/active
 */
router.get(
  '/active',
  authMiddleware,
  checkActiveAdvance
);

/**
 * Create BlinkAdvance Endpoint
 * POST /api/blink-advances
 * Note: 
 * - Amount is fixed at $200
 * - Base fee depends on transfer speed:
 *   - Instant: $24.99
 *   - Standard: $19.99
 * - 10% discount on fee if repayment is within 7 days
 */
router.post(
  '/',
  authMiddleware,
  validate([
    body('transferSpeed')
      .isIn(['Instant', 'Standard'])
      .withMessage("Transfer speed must be either 'Instant' or 'Standard'."),
    body('repaymentDate')
      .isISO8601()
      .withMessage('Repayment date must be a valid ISO 8601 date.')
      .custom((repaymentDate) => {
        const repayDate = new Date(repaymentDate);
        const today = new Date();
        const maxRepayDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
        if (repayDate > maxRepayDate) {
          throw new Error('Repayment date must be within 31 days from today.');
        }
        return true;
      }),
    body('bankAccountId')
      .isString()
      .notEmpty()
      .withMessage('Bank Account ID is required.'),
  ]),
  createBlinkAdvance
);

/**
 * Get All BlinkAdvances for User
 * GET /api/blink-advances
 */
router.get(
  '/',
  authMiddleware,
  getBlinkAdvances
);

/**
 * Get Single BlinkAdvance by ID
 * GET /api/blink-advances/:id
 */
router.get(
  '/:id',
  authMiddleware,
  validate([
    param('id')
      .isUUID()
      .withMessage('BlinkAdvance ID must be a valid UUID.'),
  ]),
  getBlinkAdvanceById
);

/**
 * Update BlinkAdvance Status
 * PATCH /api/blink-advances/:id/status
 */
router.patch(
  '/:id/status',
  authMiddleware,
  validate([
    param('id')
      .isUUID()
      .withMessage('BlinkAdvance ID must be a valid UUID.'),
    body('status')
      .isIn(['approved', 'disbursed', 'repaid', 'defaulted', 'cancelled'])
      .withMessage("Status must be one of: 'approved', 'disbursed', 'repaid', 'defaulted', 'cancelled'."),
    body('reference')
      .optional()
      .isString()
      .notEmpty()
      .withMessage('Reference must be a non-empty string if provided.'),
  ]),
  updateBlinkAdvanceStatus
);

export default router;

