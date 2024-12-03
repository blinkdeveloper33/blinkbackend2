// src/controllers/userController.ts ⭐️⭐️⭐️

import { Request, Response, NextFunction } from 'express';
import supabase from '../services/supabaseService';
import bcrypt from 'bcrypt';
import logger from '../services/logger';
import { sendOTPEmail } from '../services/emailService';
import { generateOTP } from '../utils/otpGenerator';
import jwt from 'jsonwebtoken';
import config from '../config';
import { User, RegistrationSession } from '../types/types';

/**
 * Generates a JWT token for the user.
 * @param userId - The user's unique identifier.
 * @returns A signed JWT token.
 */
const generateJWT = (userId: string): string => {
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: '1h' });
};

/**
 * Registers the user's email and sends an OTP.
 * This initializes a registration session.
 */
export const registerInitial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email } = req.body;

  try {
    // Check if user already exists
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('id, email_verified')
      .eq('email', email)
      .single();

    if (userError && userError.code !== 'PGRST116') { // PGRST116: Row not found
      throw new Error('Error checking existing user: ' + userError.message);
    }

    if (existingUser) {
      if (existingUser.email_verified) {
        res.status(400).json({ 
          success: false,
          error: 'User already exists and is verified.' 
        });
        return;
      } else {
        // Resend OTP if user exists but not verified
        await resendOtpInternal(email);
        res.status(200).json({ 
          success: true,
          message: 'OTP has been resent to your email.' 
        });
        return;
      }
    }

    // Generate OTP and expiration time
    const otpCode = generateOTP();
    const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Create or update registration session
    const { error: upsertError } = await supabase
      .from('registration_sessions')
      .upsert({
        email,
        otp_code: otpCode,
        expires_at: otpExpiration.toISOString(),
        is_verified: false,
        created_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (upsertError) {
      throw new Error('Failed to create or update registration session: ' + upsertError.message);
    }

    // Send OTP via email
    await sendOTPEmail(email, otpCode);

    res.status(200).json({
      success: true,
      message: 'OTP has been sent to your email address.',
    });
  } catch (error: any) {
    logger.error('Initial Registration Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
};

/**
 * Verifies the OTP entered by the user.
 */
export const verifyOTP = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email, otp } = req.body;

  try {
    // Fetch the registration session by email
    const { data: session, error } = await supabase
      .from('registration_sessions')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new Error('Error fetching registration session: ' + error.message);
    }

    if (!session) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid email or OTP.' 
      });
      return;
    }

    // Check if OTP is valid and not expired
    if (session.otp_code !== otp) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid OTP.' 
      });
      return;
    }

    if (new Date(session.expires_at) < new Date()) {
      res.status(400).json({ 
        success: false,
        error: 'OTP has expired.' 
      });
      return;
    }

    // Update is_verified to true
    const { error: updateError } = await supabase
      .from('registration_sessions')
      .update({ is_verified: true })
      .eq('email', email);

    if (updateError) {
      throw new Error('Failed to verify OTP: ' + updateError.message);
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. Proceed to complete registration.',
    });
  } catch (error: any) {
    logger.error('OTP Verification Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
};

/**
 * Resends a new OTP to the user's email.
 */
export const resendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email } = req.body;

  try {
    await resendOtpInternal(email);
    res.status(200).json({
      success: true,
      message: 'A new OTP has been sent to your email address.',
    });
  } catch (error: any) {
    logger.error('Resend OTP Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
};

/**
 * Internal function to resend OTP.
 * @param email - The user's email address.
 */
const resendOtpInternal = async (email: string): Promise<void> => {
  // Fetch the registration session by email
  const { data: session, error } = await supabase
    .from('registration_sessions')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw new Error('Error fetching registration session: ' + error.message);
  }

  if (!session) {
    throw new Error('No registration session found for this email.');
  }

  // Generate new OTP and expiration time
  const otpCode = generateOTP();
  const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  // Update the registration session with new OTP
  const { error: updateError } = await supabase
    .from('registration_sessions')
    .update({
      otp_code: otpCode,
      expires_at: otpExpiration.toISOString(),
      is_verified: false,
    })
    .eq('email', email);

  if (updateError) {
    throw new Error('Failed to update registration session: ' + updateError.message);
  }

  // Resend OTP via email
  await sendOTPEmail(email, otpCode);
};

/**
 * Completes user registration by storing profile details and password.
 */
export const registerComplete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email, password, first_name, last_name, state, zipcode } = req.body;

  try {
    // Fetch the registration session
    const { data: session, error: sessionError } = await supabase
      .from('registration_sessions')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (sessionError) {
      throw new Error('Error fetching registration session: ' + sessionError.message);
    }

    if (!session) {
      res.status(400).json({ 
        success: false,
        error: 'No registration session found. Please initiate registration first.' 
      });
      return;
    }

    if (!session.is_verified) {
      res.status(400).json({ 
        success: false,
        error: 'Email has not been verified. Please verify your email first.' 
      });
      return;
    }

    // Check if user already exists
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError && userError.code !== 'PGRST116') { // PGRST116: No rows found
      throw new Error('Error checking existing user: ' + userError.message);
    }

    if (existingUser) {
      res.status(400).json({ 
        success: false,
        error: 'User already exists.' 
      });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user record
    const { error: insertError } = await supabase
      .from('users')
      .insert([
        {
          email,
          password: hashedPassword,
          first_name,
          last_name,
          state,
          zipcode,
          email_verified: true,
        }
      ]);

    if (insertError) {
      throw new Error('Failed to create user: ' + insertError.message);
    }

    // Delete the registration session
    const { error: deleteError } = await supabase
      .from('registration_sessions')
      .delete()
      .eq('email', email);

    if (deleteError) {
      throw new Error('Failed to delete registration session: ' + deleteError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Registration completed successfully.',
    });
  } catch (error: any) {
    logger.error('Complete Registration Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
};

/**
 * Logs in the user and retrieves a JWT token.
 */
export const loginUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email, password } = req.body;

  try {
    // Fetch the user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        res.status(400).json({ 
          success: false,
          error: 'Invalid email or password.' 
        });
      } else {
        throw new Error('Error fetching user: ' + error.message);
      }
      return;
    }

    // Check if email is verified
    if (!user.email_verified) {
      res.status(400).json({ 
        success: false,
        error: 'Please verify your email before logging in.' 
      });
      return;
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid email or password.' 
      });
      return;
    }

    // Generate JWT token
    const token = generateJWT(user.id);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      userId: user.id, // Included userId for frontend
    });
  } catch (error: any) {
    logger.error('Login Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
};

/**
 * Fetches the authenticated user's profile information.
 */
export const fetchUserProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Assuming authMiddleware has set req.user
  const user = (req as any).user;

  try {
    if (!user) {
      res.status(401).json({ 
        success: false,
        error: 'Unauthorized: User not found.' 
      });
      return;
    }

    // Exclude sensitive fields like password
    const { password, ...userProfile } = user;

    res.status(200).json({
      success: true,
      data: userProfile,
    });
  } catch (error: any) {
    logger.error('Fetch Profile Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
};

/**
 * Checks if a user has a connected bank account.
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getUserStatus = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  try {
    // Check if the user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    // Check if the user has any connected bank accounts
    const { data: bankAccounts, error: bankError } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (bankError) {
      throw new Error('Error checking bank accounts: ' + bankError.message);
    }

    const hasBankAccount = bankAccounts && bankAccounts.length > 0;

    res.status(200).json({
      success: true,
      hasBankAccount
    });
  } catch (error: any) {
    logger.error('Get User Status Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

