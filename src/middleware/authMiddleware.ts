// src/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import supabase from '../services/supabaseService';
import logger from '../services/logger';

/**
 * Interface for authenticated requests
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    // Add other user properties as needed
  };
}

/**
 * Authentication Middleware
 */
const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];

  logger.info(`Auth Middleware invoked for ${req.method} ${req.originalUrl}`);
  logger.debug('Auth Header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Unauthorized access attempt to ${req.originalUrl}: No token provided.`);
    res.status(401).json({ 
      success: false,
      error: 'Unauthorized: No token provided.' 
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  logger.debug('Token:', token);

  if (!token) {
    logger.warn(`Unauthorized access attempt to ${req.originalUrl}: Token missing.`);
    res.status(401).json({ 
      success: false,
      error: 'Unauthorized: Token missing.' 
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { id: string };
    logger.debug('Decoded token:', decoded);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('id', decoded.id)
      .single();

    logger.debug('Supabase user result:', { user, error });

    if (error || !user) {
      logger.warn(`Unauthorized access attempt: User not found for ID ${decoded.id}`);
      res.status(401).json({ 
        success: false,
        error: 'Unauthorized: User not found.' 
      });
      return;
    }

    req.user = user;
    logger.info(`User authenticated: ${user.email}`);
    next();
  } catch (err: any) {
    logger.warn(`Forbidden access attempt to ${req.originalUrl}: Invalid token.`, err);
    res.status(403).json({ 
      success: false,
      error: 'Forbidden: Invalid token.' 
    });
  }
};

export default authMiddleware;
