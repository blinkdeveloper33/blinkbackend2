// src/routes/blinkAdvanceRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, param, ValidationChain, validationResult } from 'express-validator';
import {
  createBlinkAdvance,
  getBlinkAdvances,
  getBlinkAdvanceById,
  updateBlinkAdvanceStatus
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
 * Create BlinkAdvance Endpoint
 * POST /api/blink-advances
 */
router.post(
  '/',
  authMiddleware,
  validate([
    body('requestedAmount')
      .isFloat({ min: 100, max: 300 })
      .withMessage('Requested amount must be between $100 and $300.'),
    body('transferSpeed')
      .isIn(['Instant', 'Normal'])
      .withMessage("Transfer speed must be either 'Instant' or 'Normal'."),
    body('repayDate')
      .isISO8601()
      .withMessage('Repay date must be a valid ISO 8601 date.')
      .custom((repayDate) => {
        const repay = new Date(repayDate);
        const today = new Date();
        const maxRepayDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
        if (repay > maxRepayDate) {
          throw new Error('Repay date must be within 31 days from today.');
        }
        return true;
      }),
    body('bankAccountId')
      .isUUID()
      .withMessage('Bank Account ID must be a valid UUID.'),
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
      .isIn(['approved', 'funded', 'repaid', 'canceled'])
      .withMessage("Status must be one of: 'approved', 'funded', 'repaid', 'canceled'."),
  ]),
  updateBlinkAdvanceStatus
);

export default router;
