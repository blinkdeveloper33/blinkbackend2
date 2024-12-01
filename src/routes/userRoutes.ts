// src/routes/userRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';
import {
  registerInitial,
  verifyOTP,
  resendOtp,
  registerComplete,
  loginUser,
  fetchUserProfile,
} from '../controllers/userController';
import authMiddleware from '../middleware/authMiddleware';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../services/logger';

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
 * Input validation schemas
 */
const initialRegistrationValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
];

const verifyOtpValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be a 6-digit code')
    .matches(/^\d{6}$/)
    .withMessage('OTP must contain only digits'),
];

const resendOtpValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
];

const completeRegistrationValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain at least one special character'),
  body('first_name')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('last_name')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('zipcode')
    .trim()
    .isPostalCode('US')
    .withMessage('A valid US ZIP code is required'),
];

const loginValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * Public routes
 */
router.post(
  '/register-initial',
  validate(initialRegistrationValidation),
  registerInitial
);

router.post(
  '/verify-otp',
  validate(verifyOtpValidation),
  verifyOTP
);

router.post(
  '/resend-otp',
  validate(resendOtpValidation),
  resendOtp
);

router.post(
  '/register-complete',
  validate(completeRegistrationValidation),
  registerComplete
);

router.post(
  '/login',
  validate(loginValidation),
  loginUser
);

/**
 * Protected routes
 */
router.use(authMiddleware);

router.get('/profile', (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  fetchUserProfile(authReq, res, next);
});

/**
 * Error handling middleware
 */
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled Error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default router;
