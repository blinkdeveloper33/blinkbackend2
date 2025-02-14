// src/routes/userRoutes.ts

import express, { Request, Response, NextFunction, Router } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';
import {
  registerInitial,
  verifyOTP,
  resendOtp,
  loginUser,
  fetchUserProfile,
  getUserStatus,
  getUserBankAccounts,
  getUserBankAccountsDetailed,
  getUserAccountData,
  updateProfilePicture,
  getProfilePictureUrl,
  registerCompleteWithLogin,
  updateFcmToken,
} from '../controllers/userController';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../services/logger';
import { param } from 'express-validator';
import { getBankAccountDetails } from '../controllers/bankAccountController';

const publicRouter: Router = express.Router();
const protectedRouter: Router = express.Router();

// Debug logging middleware for public routes
publicRouter.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Public route accessed: ${req.method} ${req.path}`);
  next();
});

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
        errors: errors.array(),
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

const loginValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const fcmTokenValidation: ValidationChain[] = [
  body('fcm_token')
    .notEmpty()
    .withMessage('FCM token is required')
    .isString()
    .withMessage('FCM token must be a string')
];

/**
 * Public routes
 */
publicRouter.post(
  '/register-initial',
  (req: Request, res: Response, next: NextFunction) => {
    logger.debug('Attempting to access /register-initial route');
    next();
  },
  validate(initialRegistrationValidation),
  registerInitial
);

publicRouter.post(
  '/verify-otp',
  (req: Request, res: Response, next: NextFunction) => {
    logger.debug('Attempting to access /verify-otp route');
    next();
  },
  validate(verifyOtpValidation),
  verifyOTP
);

publicRouter.post(
  '/resend-otp',
  (req: Request, res: Response, next: NextFunction) => {
    logger.debug('Attempting to access /resend-otp route');
    next();
  },
  validate(resendOtpValidation),
  resendOtp
);

publicRouter.post(
  '/register-complete-with-login',
  (req: Request, res: Response, next: NextFunction) => {
    logger.debug('Attempting to access /register-complete-with-login route');
    next();
  },
  validate([
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
      .withMessage('A valid US ZIP code is required')
  ]),
  registerCompleteWithLogin
);

publicRouter.post(
  '/login',
  (req: Request, res: Response, next: NextFunction) => {
    logger.debug('Attempting to access /login route');
    next();
  },
  validate(loginValidation),
  loginUser
);

/**
 * Protected routes
 */
protectedRouter.get('/profile', fetchUserProfile);
protectedRouter.get('/status/:userId', getUserStatus);
protectedRouter.get('/bank-accounts', getUserBankAccounts);
protectedRouter.get('/bank-accounts/detailed', getUserBankAccountsDetailed);
protectedRouter.get('/account-data', getUserAccountData);

// Get profile picture URL
protectedRouter.get('/profile-picture', getProfilePictureUrl);

// Update profile picture
protectedRouter.post(
  '/profile-picture',
  validate([
    body('file')
      .notEmpty()
      .withMessage('File is required')
      .isString()
      .withMessage('File must be a base64 string')
  ]),
  updateProfilePicture
);

// Update FCM token
protectedRouter.post(
  '/fcm-token',
  validate(fcmTokenValidation),
  updateFcmToken
);

/**
 * Get User's Bank Accounts
 * GET /api/users/:userId/bank-accounts
 */
protectedRouter.get(
  '/:userId/bank-accounts',
  validate([
    param('userId')
      .isUUID()
      .withMessage('User ID must be a valid UUID.'),
  ]),
  getUserBankAccounts
);

/**
 * Get User's Bank Account Details
 * GET /api/users/:userId/bank-accounts/details
 */
protectedRouter.get(
  '/:userId/bank-accounts/details',
  validate([
    param('userId')
      .isUUID()
      .withMessage('User ID must be a valid UUID.'),
  ]),
  getBankAccountDetails
);

/**
 * Error handling middleware for user routes
 */
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled Error in User Routes:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

publicRouter.use(errorHandler);
protectedRouter.use(errorHandler);

export { publicRouter as publicUserRoutes, protectedRouter as protectedUserRoutes };

