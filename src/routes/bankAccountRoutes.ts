import express, { Router } from 'express';
import { param, ValidationChain, validationResult } from 'express-validator';
import { getBankAccountDetails } from '../controllers/bankAccountController';
import authMiddleware from '../middleware/authMiddleware';
import logger from '../services/logger';

const router: Router = express.Router();

/**
 * Custom validation middleware
 */
const validate = (validations: ValidationChain[]) => {
  return async (req: any, res: any, next: any) => {
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

// Debug middleware
router.use((req, res, next) => {
  logger.debug(`Bank Account Route accessed: ${req.method} ${req.path}`);
  next();
});

/**
 * Get Bank Account Details
 * GET /api/bank-accounts/details
 */
router.get(
  '/details',
  getBankAccountDetails
);

export default router; 