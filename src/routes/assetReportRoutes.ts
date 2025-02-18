import express, { Router } from 'express';
import { createAssetReport } from '../controllers/assetReportController';
import authMiddleware from '../middleware/authMiddleware';
import { body, ValidationChain } from 'express-validator';
import { validateRequest } from '../middleware/validationMiddleware';

const router: Router = express.Router();

// Validation middleware for create asset report
const validateCreateAssetReport: ValidationChain[] = [
  body('access_tokens').isArray().notEmpty().withMessage('At least one access token is required'),
  body('days_requested').isInt({ min: 0, max: 731 }).withMessage('days_requested must be between 0 and 731'),
  body('options.client_report_id').optional().isString(),
  body('options.webhook').optional().isURL().withMessage('webhook must be a valid URL'),
  body('options.add_ons').optional().isArray(),
  body('options.user.client_user_id').optional().isString(),
  body('options.user.first_name').optional().isString(),
  body('options.user.middle_name').optional().isString(),
  body('options.user.last_name').optional().isString(),
  body('options.user.ssn').optional().matches(/^\d{3}-\d{2}-\d{4}$/).withMessage('Invalid SSN format'),
  body('options.user.phone_number').optional().matches(/^\+\d{10,15}$/).withMessage('Invalid phone number format'),
  body('options.user.email').optional().isEmail().withMessage('Invalid email format'),
  body('options.require_all_items').optional().isBoolean()
];

// Routes
router.post(
  '/create',
  [authMiddleware, ...validateCreateAssetReport, validateRequest],
  createAssetReport
);

export default router; 