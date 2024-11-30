// src/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../services/logger';

/**
 * Interface for authenticated requests
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Authentication Middleware
 */
const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header missing.' });
    return;
  }

  const token = authHeader.split(' ')[1]; // Expecting format: "Bearer <token>"

  if (!token) {
    res.status(401).json({ error: 'Token missing.' });
    return;
  }

  jwt.verify(token, config.JWT_SECRET, (err, decoded: any) => {
    if (err) {
      logger.warn('Invalid JWT token:', err.message);
      res.status(403).json({ error: 'Invalid token.' });
      return;
    }

    req.userId = decoded.userId;
    next();
  });
};

export default authMiddleware;
