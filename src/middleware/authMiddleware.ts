// src/middleware/authMiddleware.ts ⭐️⭐️⭐️

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

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ 
      success: false,
      error: 'Unauthorized: No token provided.' 
    });
    return;
  }

  const token = authHeader.split(' ')[1]; // Expecting format: "Bearer <token>"

  if (!token) {
    res.status(401).json({ 
      success: false,
      error: 'Unauthorized: Token missing.' 
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string };

    // Fetch user from Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name') // Select necessary fields
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      res.status(401).json({ 
        success: false,
        error: 'Unauthorized: User not found.' 
      });
      return;
    }

    // Attach user to the request object
    req.user = user;
    next();
  } catch (err: any) {
    logger.warn('Invalid JWT token:', err.message);
    res.status(403).json({ 
      success: false,
      error: 'Forbidden: Invalid token.' 
    });
  }
};

export default authMiddleware;
