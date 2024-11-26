// src/controllers/userController.ts

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import supabase from '../services/supabaseService';
import config from '../config';
import { User } from '../types/types';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../services/logger';

/**
 * Registration Controller
 */
export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email, password, first_name, last_name, state, zipcode } = req.body;

  try {
    // Check if user already exists
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!selectError && existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          email,
          password: hashedPassword,
          first_name,
          last_name,
          state,
          zipcode,
          cursor: null, // Initialize cursor as null
        },
      ])
      .select()
      .single();

    if (insertError || !newUser) {
      throw new Error('Failed to register user');
    }

    // Create JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({ message: 'User registered successfully', token });
  } catch (error: any) {
    logger.error('Registration Error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Login Controller
 */
export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email, password } = req.body;

  try {
    // Fetch user by email
    const { data: user, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (selectError || !user) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({ message: 'Login successful', token });
  } catch (error: any) {
    logger.error('Login Error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Fetch Profile Controller
 */
export const fetchUserProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = req.user;

  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !userData) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password, ...userProfile } = userData;
    res.status(200).json({ profile: userProfile });
  } catch (error: any) {
    logger.error('Profile Fetch Error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
