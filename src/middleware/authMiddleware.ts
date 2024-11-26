// src/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../services/logger';

/**
 * Interface for authenticated requests
 */
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

/**
 * Authentication Middleware
 */
const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      id: string;
      email: string;
      iat: number;
      exp: number;
    };

    // Attach user information to the request
    (req as AuthenticatedRequest).user = {
      id: decoded.id,
      email: decoded.email,
    };

    next();
  } catch (error: any) {
    logger.warn('Invalid JWT token:', error.message);
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized: Token has expired' });
    } else {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  }
};

export default authMiddleware;
