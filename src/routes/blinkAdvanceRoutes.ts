import express, { Router } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';
import { createBlinkAdvance } from '../controllers/blinkAdvanceController';
import authMiddleware from '../middleware/authMiddleware';

const router: Router = express.Router();

/**
 * Custom validation middleware
 */
const validate = (validations: ValidationChain[]) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
  (req, res, next) => {
    // Set fixed amount before validation
    req.body.amount = 200.00;
    next();
  },
  validate([
    body('bankAccountId')
      .isString()
      .notEmpty()
      .withMessage('Bank account ID is required'),
    body('transferSpeed')
      .isIn(['instant', 'standard'])
      .withMessage("Transfer speed must be either 'instant' or 'standard'"),
    body('repaymentTermDays')
      .isIn([7, 15])
      .withMessage('Repayment term must be either 7 or 15 days'),
    body('amount')
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage('Amount must be between 0 and 1000.')
  ]),
  createBlinkAdvance
);

export default router; 