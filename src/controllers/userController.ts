// src/controllers/userController.ts

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import supabase from '../services/supabaseService';
import config from '../config';
import { User, UserOTP } from '../types/types';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../services/logger';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

/**
 * Utility function to generate a 6-digit OTP
 */
const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Utility function to send OTP via email using Supabase SMTP
 */
const sendOTPEmail = async (email: string, otp: string): Promise<void> => {
  // Create a transporter using SMTP
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  // Define email options
  const mailOptions = {
    from: `"${config.SMTP_FROM_NAME}" <${config.SMTP_FROM_EMAIL}>`,
    to: email,
    subject: 'Your OTP Code for BlinkBackend2 Registration',
    text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    html: `<p>Your OTP code is <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
  };

  // Send email
  await transporter.sendMail(mailOptions);
};

/**
 * Registration Controller with OTP
 */
export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email, password, first_name, last_name, state, zipcode } = req.body;

  try {
    // Check if user already exists using .maybeSingle()
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (selectError) {
      logger.error('Error checking for existing user:', selectError.message);
      throw new Error('Error checking for existing user: ' + selectError.message);
    }

    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user with email_verified = false
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
          email_verified: false,
        },
      ])
      .select()
      .single();

    if (insertError || !newUser) {
      logger.error('Failed to register user:', insertError?.message || 'No user data returned');
      throw new Error('Failed to register user: ' + (insertError?.message || 'No user data returned'));
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store OTP in user_otps table
    const { error: otpInsertError } = await supabase
      .from('user_otps')
      .insert([
        {
          user_id: newUser.id,
          otp_code: otpCode,
          expires_at: otpExpiration.toISOString(),
        },
      ]);

    if (otpInsertError) {
      logger.error('Failed to generate OTP:', otpInsertError.message);
      throw new Error('Failed to generate OTP: ' + otpInsertError.message);
    }

    // Send OTP via email
    await sendOTPEmail(email, otpCode);

    // Respond indicating that OTP verification is required
    res.status(201).json({
      message: 'User registered successfully. Please verify your email with the OTP sent.',
    });
  } catch (error: any) {
    logger.error('Registration Error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * OTP Verification Controller
 */
export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email, otp } = req.body;

  try {
    // Fetch the user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (userError) {
      logger.error('Error fetching user:', userError.message);
      throw new Error('Error fetching user: ' + userError.message);
    }

    if (!user) {
      res.status(400).json({ error: 'Invalid email or OTP' });
      return;
    }

    // Check if email is already verified
    if (user.email_verified) {
      res.status(400).json({ error: 'Email is already verified' });
      return;
    }

    // Fetch the latest OTP for the user that is not verified and not expired
    const { data: otpEntry, error: otpError } = await supabase
      .from('user_otps')
      .select('*')
      .eq('user_id', user.id)
      .eq('otp_code', otp)
      .eq('is_verified', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      logger.error('Error fetching OTP:', otpError.message);
      throw new Error('Error fetching OTP: ' + otpError.message);
    }

    if (!otpEntry) {
      res.status(400).json({ error: 'Invalid or expired OTP' });
      return;
    }

    // Mark OTP as verified
    const { error: otpUpdateError } = await supabase
      .from('user_otps')
      .update({ is_verified: true })
      .eq('id', otpEntry.id);

    if (otpUpdateError) {
      logger.error('Failed to verify OTP:', otpUpdateError.message);
      throw new Error('Failed to verify OTP: ' + otpUpdateError.message);
    }

    // Update user's email_verified status
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ email_verified: true })
      .eq('id', user.id);

    if (userUpdateError) {
      logger.error('Failed to update user verification status:', userUpdateError.message);
      throw new Error('Failed to update user verification status: ' + userUpdateError.message);
    }

    // Optionally, generate a JWT token upon successful verification
    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Email verified successfully',
      token,
    });
  } catch (error: any) {
    logger.error('OTP Verification Error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Resend OTP Controller
 */
export const resendOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email } = req.body;

  try {
    // Fetch the user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (userError) {
      logger.error('Error fetching user for OTP resend:', userError.message);
      throw new Error('Error fetching user: ' + userError.message);
    }

    if (!user) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }

    // Check if email is already verified
    if (user.email_verified) {
      res.status(400).json({ error: 'Email is already verified' });
      return;
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store OTP in user_otps table
    const { error: otpInsertError } = await supabase
      .from('user_otps')
      .insert([
        {
          user_id: user.id,
          otp_code: otpCode,
          expires_at: otpExpiration.toISOString(),
        },
      ]);

    if (otpInsertError) {
      logger.error('Failed to generate OTP:', otpInsertError.message);
      throw new Error('Failed to generate OTP: ' + otpInsertError.message);
    }

    // Send OTP via email
    await sendOTPEmail(email, otpCode);

    res.status(200).json({
      message: 'OTP has been resent to your email address.',
    });
  } catch (error: any) {
    logger.error('Resend OTP Error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Login Controller with Email Verification Check
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
      .maybeSingle();

    if (selectError) {
      logger.error('Error fetching user during login:', selectError.message);
      throw new Error('Error fetching user: ' + selectError.message);
    }

    if (!user) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }

    // Check if email is verified
    if (!user.email_verified) {
      res.status(400).json({ error: 'Please verify your email before logging in' });
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
      .maybeSingle();

    if (error) {
      logger.error('Error fetching user profile:', error.message);
      throw new Error('Error fetching user profile: ' + error.message);
    }

    if (!userData) {
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
