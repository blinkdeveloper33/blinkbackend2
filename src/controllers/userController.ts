// src/controllers/userController.ts

import { Request, Response, NextFunction } from 'express';
import supabase from '../services/supabaseService';
import bcrypt from 'bcrypt';
import logger from '../services/logger';
import { sendOTPEmail } from '../services/emailService';
import { generateOTP } from '../utils/otpGenerator';
import jwt from 'jsonwebtoken';
import config from '../config';
import { User, RegistrationSession, BankAccount, BankAccountSummary, BankAccountDetailed, Transaction } from '../types/types';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

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
const registerInitial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
const verifyOTP = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
const resendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
const registerComplete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
const loginUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
const fetchUserProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const user = req.user;

  try {
    if (!user) {
      res.status(401).json({ 
        success: false,
        error: 'Unauthorized: User not found.' 
      });
      return;
    }

    // Since 'password' is not part of 'user', we don't need to exclude it
    // If 'user' had more properties to exclude, handle them accordingly

    res.status(200).json({
      success: true,
      data: user, // Directly send the user profile
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
const getUserStatus = async (req: Request, res: Response): Promise<void> => {
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

/**
 * Retrieves all bank account IDs for the authenticated user.
 */
const getUserBankAccounts = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user;

  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User information not found.',
    });
    return;
  }

  try {
    // Fetch bank accounts associated with the user
    const { data: bankAccounts, error } = await supabase
      .from('bank_accounts')
      .select('id, account_name, account_type, currency')
      .eq('user_id', user.id);

    if (error) {
      throw new Error('Error fetching bank accounts: ' + error.message);
    }

    if (!bankAccounts) {
      res.status(200).json({
        success: true,
        bankAccounts: []
      });
      return;
    }

    // Cast the data as BankAccountSummary[]
    const bankAccountsSummary = bankAccounts as BankAccountSummary[];

    // Format the response to include only necessary fields
    const formattedAccounts = bankAccountsSummary.map((account) => ({
      bankAccountId: account.id,
      accountName: account.account_name,
      accountType: account.account_type,
      currency: account.currency,
    }));

    res.status(200).json({
      success: true,
      bankAccounts: formattedAccounts,
    });
  } catch (error: any) {
    logger.error('Get User Bank Accounts Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bank accounts.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Retrieves detailed bank account information for the authenticated user.
 */
const getUserBankAccountsDetailed = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user;

  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User information not found.',
    });
    return;
  }

  try {
    // Fetch detailed bank account information
    const { data: bankAccounts, error } = await supabase
      .from('bank_accounts')
      .select(`
        id, 
        account_name, 
        account_type, 
        account_subtype,
        account_mask,
        available_balance,
        current_balance,
        currency,
        created_at,
        cursor
      `)
      .eq('user_id', user.id);

    if (error) {
      throw new Error('Error fetching bank accounts: ' + error.message);
    }

    if (!bankAccounts) {
      res.status(200).json({
        success: true,
        bankAccounts: []
      });
      return;
    }

    // Cast the data as BankAccountDetailed[]
    const bankAccountsDetailed = bankAccounts as BankAccountDetailed[];

    // Format the response to include only necessary fields and exclude sensitive data
    const formattedAccounts = bankAccountsDetailed.map((account) => ({
      bankAccountId: account.id,
      accountName: account.account_name,
      accountType: account.account_type,
      accountSubtype: account.account_subtype,
      accountMask: account.account_mask,
      availableBalance: account.available_balance,
      currentBalance: account.current_balance,
      currency: account.currency,
      createdAt: account.created_at,
      cursor: account.cursor,
    }));

    res.status(200).json({
      success: true,
      bankAccounts: formattedAccounts,
    });
  } catch (error: any) {
    logger.error('Get Detailed User Bank Accounts Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve detailed bank accounts.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Retrieves all user data required for the AccountScreen.
 */
const getUserAccountData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    // Fetch user profile
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('first_name, last_name, email, created_at')
      .eq('id', userId)
      .single();

    if (userError) throw new Error('Error fetching user profile: ' + userError.message);

    // Fetch bank accounts
    const { data: bankAccounts, error: bankError } = await supabase
      .from('bank_accounts')
      .select('id, account_name, account_type, current_balance, available_balance, currency')
      .eq('user_id', userId);

    if (bankError) throw new Error('Error fetching bank accounts: ' + bankError.message);

    // Calculate total balance
    const totalBalance = bankAccounts.reduce((sum, account) => sum + (account.current_balance || 0), 0);

    // Fetch recent transactions
    const { data: recentTransactions, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(5);

    if (transactionError) throw new Error('Error fetching recent transactions: ' + transactionError.message);

    // Fetch transaction statistics
    const { data: transactionStats, error: statsError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    if (statsError) throw new Error('Error fetching transaction statistics: ' + statsError.message);

    const totalTransactions = transactionStats.length;

    // Calculate average spending (using the last 30 transactions for this example)
    const { data: lastThirtyTransactions, error: avgError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);

    if (avgError) throw new Error('Error fetching transactions for average spending: ' + avgError.message);

    const averageSpending = lastThirtyTransactions.length > 0
      ? lastThirtyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) / lastThirtyTransactions.length
      : 0;

    res.status(200).json({
      success: true,
      data: {
        userProfile: {
          name: `${userProfile.first_name} ${userProfile.last_name}`,
          email: userProfile.email,
          memberSince: userProfile.created_at,
        },
        totalBalance,
        accountStats: {
          totalTransactions,
          averageSpending,
          linkedAccounts: bankAccounts.length,
        },
        linkedAccounts: bankAccounts.map(account => ({
          id: account.id,
          accountName: account.account_name,
          accountType: account.account_type,
          balance: account.current_balance,
          availableBalance: account.available_balance,
          currency: account.currency,
        })),
        recentTransactions: recentTransactions.map(transaction => ({
          id: transaction.id,
          amount: transaction.amount,
          date: transaction.date,
          description: transaction.description,
          category: transaction.category,
        })),
      },
    });
  } catch (error: any) {
    logger.error('Get User Account Data Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user account data.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Updates the user's profile picture.
 */
const updateProfilePicture = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const file = req.body.file;

  try {
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found'
      });
      return;
    }

    if (!file || typeof file !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Invalid file format. Please provide a base64 encoded image.'
      });
      return;
    }

    // Extract the base64 data and file type
    const matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      res.status(400).json({
        success: false,
        error: 'Invalid base64 format'
      });
      return;
    }

    const fileType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Validate file size (5MB limit)
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 5MB.'
      });
      return;
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(fileType)) {
      res.status(400).json({
        success: false,
        error: 'Invalid file type. Only JPEG, JPG and PNG are allowed.'
      });
      return;
    }

    // Generate unique filename with proper extension
    const extension = fileType.split('/')[1];
    const filename = `${userId}-${Date.now()}.${extension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('profile-pictures')
      .upload(filename, buffer, {
        contentType: fileType,
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('profile-pictures')
      .getPublicUrl(filename);

    // Delete old profile picture if exists
    const { data: userData } = await supabase
      .from('users')
      .select('profile_picture_url')
      .eq('id', userId)
      .single();

    if (userData?.profile_picture_url) {
      const oldFilename = userData.profile_picture_url.split('/').pop();
      if (oldFilename) {
        await supabase
          .storage
          .from('profile-pictures')
          .remove([oldFilename]);
      }
    }

    // Update user record with new profile picture URL
    const { error: updateError } = await supabase
      .from('users')
      .update({
        profile_picture_url: filename,
        profile_picture_updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error(`Failed to update user record: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        profilePictureUrl: publicUrl
      }
    });

  } catch (error: any) {
    logger.error('Update Profile Picture Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile picture.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Gets the profile picture URL for the authenticated user.
 */
const getProfilePictureUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
      return;
    }

    // Get the user's profile picture filename from the users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('profile_picture_url')
      .eq('id', userId)
      .single();

    if (userError) {
      throw new Error('Error fetching user profile: ' + userError.message);
    }

    if (!user?.profile_picture_url) {
      res.status(200).json({
        success: true,
        data: {
          url: null
        }
      });
      return;
    }

    // Get the public URL for the profile picture
    const { data: { publicUrl } } = supabase
      .storage
      .from('profile-pictures')
      .getPublicUrl(user.profile_picture_url);

    res.status(200).json({
      success: true,
      data: {
        url: publicUrl
      }
    });
  } catch (error: any) {
    logger.error('Get Profile Picture URL Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile picture URL.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export {
  registerInitial,
  verifyOTP,
  resendOtp,
  registerComplete,
  loginUser,
  fetchUserProfile,
  getUserStatus,
  getUserBankAccounts,
  getUserBankAccountsDetailed,
  getUserAccountData,
  updateProfilePicture,
  getProfilePictureUrl,
};

