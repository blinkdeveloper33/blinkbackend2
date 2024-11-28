// src/routes/userRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';
import {
  registerInitial,
  registerComplete,
  loginUser,
  fetchUserProfile,
  verifyOTP,
  resendOTP
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
          status: 'error',
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
const initialRegistrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
];

const completeRegistrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 6 characters and contain uppercase, lowercase, and numbers'),
  body('first_name')
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('last_name')
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('state')
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 2 })
    .isUppercase()
    .withMessage('State must be a valid 2-letter US state code'),
  body('zipcode')
    .trim()
    .isPostalCode('US')
    .withMessage('Valid US zipcode is required')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const otpVerificationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be a 6-digit code')
    .matches(/^\d{6}$/)
    .withMessage('OTP must contain only digits'),
];

const resendOTPValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
];

/**
 * Public routes
 */
router.post('/register-initial', validate(initialRegistrationValidation), registerInitial);
router.post('/verify-otp', validate(otpVerificationValidation), verifyOTP);
router.post('/register-complete', validate(completeRegistrationValidation), registerComplete);
router.post('/resend-otp', validate(resendOTPValidation), resendOTP);
router.post('/login', validate(loginValidation), loginUser);

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
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default router;
