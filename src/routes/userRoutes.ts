// src/routes/userRoutes.ts

import express from 'express';
import { body } from 'express-validator';
import { registerUser, loginUser, fetchUserProfile } from '../controllers/userController';
import authMiddleware from '../middleware/authMiddleware';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../services/logger';

const router = express.Router();

/**
 * Custom validation middleware
 */
const validate = (validations: any[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
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
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Input validation schemas
 */
const registrationValidation = [
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

/**
 * Public routes
 */
router.post('/register', validate(registrationValidation), registerUser);
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
