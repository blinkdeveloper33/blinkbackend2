// src/controllers/blinkAdvanceController.ts

import { Request, Response } from 'express';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import { BlinkAdvance } from '../types/types';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

/**
 * Creates a new BlinkAdvance request.
 */
export const createBlinkAdvance = async (req: Request, res: Response): Promise<void> => {
  const { requestedAmount, transferSpeed, repayDate, bankAccountId } = req.body;
  const userId = (req as any).user.id; // Assuming authMiddleware sets req.user

  try {
    // Validate requestedAmount
    if (requestedAmount < 100 || requestedAmount > 300) {
      res.status(400).json({
        success: false,
        error: 'Requested amount must be between $100 and $300.',
      });
      return;
    }

    // Validate transferSpeed
    if (!['Instant', 'Normal'].includes(transferSpeed)) {
      res.status(400).json({
        success: false,
        error: "Transfer speed must be either 'Instant' or 'Normal'.",
      });
      return;
    }

    // Validate repayDate is within 31 days from now
    const today = new Date();
    const repay = new Date(repayDate);
    const maxRepayDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000); // 31 days from now

    if (repay > maxRepayDate) {
      res.status(400).json({
        success: false,
        error: 'Repay date must be within 31 days from today.',
      });
      return;
    }

    // Check if the user has the specified bank account
    const { data: bankAccount, error: bankError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', bankAccountId)
      .eq('user_id', userId)
      .single();

    if (bankError || !bankAccount) {
      res.status(400).json({
        success: false,
        error: 'Bank account not found or does not belong to the user.',
      });
      return;
    }

    // Insert the new BlinkAdvance record with .select('*') to retrieve the inserted record
    const { data, error } = await supabase
      .from('blink_advances')
      .insert([
        {
          user_id: userId,
          bank_account_id: bankAccountId,
          requested_amount: requestedAmount,
          transfer_speed: transferSpeed,
          repay_date: repayDate,
          // fee is auto-generated via database trigger or default value
          // status defaults to 'requested' via database default
        },
      ])
      .select('*') // Ensures the inserted record is returned
      .single();

    // Log the response from Supabase for debugging purposes
    logger.info(`Supabase Insert Data: ${JSON.stringify(data)}`);
    logger.info(`Supabase Insert Error: ${bankError ? (bankError as unknown as Error).message : 'No error'}`);

    if (error) {
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'BlinkAdvance request created successfully.',
      blinkAdvance: data, // Now correctly populated
    });
  } catch (error) {
    // Type Guard: Check if error is an instance of Error
    if (error instanceof Error) {
      logger.error(`Create BlinkAdvance Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to create BlinkAdvance request.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined, // Avoid exposing error details in production
      });
    } else {
      // Handle non-Error types
      logger.error('Create BlinkAdvance Error: Unknown error occurred.');
      res.status(500).json({
        success: false,
        error: 'Failed to create BlinkAdvance request.',
      });
    }
  }
};

/**
 * Retrieves all BlinkAdvance records for the authenticated user.
 */
export const getBlinkAdvances = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id; // Assuming authMiddleware sets req.user

  try {
    const { data, error } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      blinkAdvances: data,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Get BlinkAdvances Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve BlinkAdvance records.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } else {
      logger.error('Get BlinkAdvances Error: Unknown error occurred.');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve BlinkAdvance records.',
      });
    }
  }
};

/**
 * Retrieves a single BlinkAdvance record by ID for the authenticated user.
 */
export const getBlinkAdvanceById = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        res.status(404).json({
          success: false,
          error: 'BlinkAdvance record not found.',
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      blinkAdvance: data,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Get BlinkAdvance By ID Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve BlinkAdvance record.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } else {
      logger.error('Get BlinkAdvance By ID Error: Unknown error occurred.');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve BlinkAdvance record.',
      });
    }
  }
};

/**
 * Updates the status of a BlinkAdvance record.
 * Only certain status transitions are allowed.
 */
export const updateBlinkAdvanceStatus = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { status } = req.body;

  // Define allowed status transitions
  const allowedStatuses = ['approved', 'funded', 'repaid', 'canceled'];

  if (!allowedStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      error: `Status must be one of: ${allowedStatuses.join(', ')}.`,
    });
    return;
  }

  try {
    // Fetch the existing BlinkAdvance
    const { data: existingAdvance, error: fetchError } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingAdvance) {
      res.status(404).json({
        success: false,
        error: 'BlinkAdvance record not found.',
      });
      return;
    }

    // Define valid transitions
    const validTransitions: { [key: string]: string[] } = {
      requested: ['approved', 'canceled'],
      approved: ['funded', 'canceled'],
      funded: ['repaid', 'canceled'],
      // Other transitions can be added as needed
    };

    const currentStatus = existingAdvance.status;
    const possibleTransitions = validTransitions[currentStatus] || [];

    if (!possibleTransitions.includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status transition from '${currentStatus}' to '${status}'.`,
      });
      return;
    }

    // Update the status with .select('*') to retrieve the updated record
    const { data, error } = await supabase
      .from('blink_advances')
      .update({ status })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*') // Retrieve the updated record
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'BlinkAdvance status updated successfully.',
      blinkAdvance: data,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Update BlinkAdvance Status Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to update BlinkAdvance status.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } else {
      logger.error('Update BlinkAdvance Status Error: Unknown error occurred.');
      res.status(500).json({
        success: false,
        error: 'Failed to update BlinkAdvance status.',
      });
    }
  }
};

/**
 * Retrieves the Blink Advance approval status for the authenticated user.
 */
export const getBlinkAdvanceApprovalStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('blink_advance_approvals')
      .select('is_approved, approved_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No matching row found, user not in approvals table
        res.status(200).json({
          success: true,
          data: {
            isApproved: false,
            approvedAt: null,
            status: 'On Review'
          }
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: {
        isApproved: data.is_approved,
        approvedAt: data.approved_at,
        status: data.is_approved ? 'Approved' : 'On Review'
      }
    });
  } catch (error: any) {
    logger.error('Get Blink Advance Approval Status Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Blink Advance approval status.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Checks if the authenticated user has an active Blink Advance.
 */
export const checkActiveBlinkAdvance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('blink_advances')
      .select('id, requested_amount, transfer_speed, fee, repay_date, disbursed_at')
      .eq('user_id', userId)
      .not('disbursed_at', 'is', null)
      .is('repaid_at', null)
      .order('disbursed_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No active Blink Advance found
        res.status(200).json({
          success: true,
          data: {
            hasActiveAdvance: false
          }
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: {
        hasActiveAdvance: true,
        activeAdvance: {
          id: data.id,
          requestedAmount: data.requested_amount,
          transferSpeed: data.transfer_speed,
          fee: data.fee,
          repayDate: data.repay_date,
          disbursedAt: data.disbursed_at
        }
      }
    });
  } catch (error: any) {
    logger.error('Check Active Blink Advance Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to check for active Blink Advance.',
      details: error.message, // Temporarily include error details
      stack: error.stack // Temporarily include stack trace
    });
  }
};

/**
 * Get all Blink Advance information for a user
 * GET /api/blink-advance/user/:userId
 */
export const getUserBlinkAdvances = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user?.id;

    // Security check: ensure the authenticated user is requesting their own data
    if (requestedUserId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own Blink Advance information.'
      });
      return;
    }

    // Fetch all blink advances for the user with related bank account information
    const { data: advances, error } = await supabase
      .from('blink_advances')
      .select(`
        *,
        bank_accounts (
          id,
          account_name,
          account_type,
          account_subtype,
          account_mask
        ),
        blink_advance_approvals (
          id,
          is_approved,
          approved_at,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', requestedUserId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Error fetching Blink Advances: ' + error.message);
    }

    // Transform the data to include calculated fields and format dates
    const formattedAdvances = advances.map(advance => ({
      id: advance.id,
      requestedAmount: Number(advance.requested_amount),
      transferSpeed: advance.transfer_speed,
      fee: Number(advance.fee),
      totalAmount: Number(advance.requested_amount) + Number(advance.fee),
      repayDate: advance.repay_date,
      status: advance.status,
      dates: {
        created: advance.created_at,
        updated: advance.updated_at,
        approved: advance.approved_at,
        disbursed: advance.disbursed_at,
        repaid: advance.repaid_at
      },
      bankAccount: {
        id: advance.bank_account_id,
        name: advance.bank_accounts?.account_name,
        type: advance.bank_accounts?.account_type,
        subtype: advance.bank_accounts?.account_subtype,
        mask: advance.bank_accounts?.account_mask
      },
      approval: advance.blink_advance_approvals ? {
        id: advance.approval_id,
        isApproved: advance.blink_advance_approvals.is_approved,
        approvedAt: advance.blink_advance_approvals.approved_at
      } : null
    }));

    const now = new Date();

    // Calculate summary statistics
    const summary = {
      overview: {
        totalAdvances: formattedAdvances.length,
        activeAdvances: formattedAdvances.filter(a => 
          a.dates.disbursed && !a.dates.repaid && a.status === 'funded'
        ).length,
        pendingAdvances: formattedAdvances.filter(a => 
          a.status === 'pending' && new Date(a.repayDate) > now
        ).length,
        expiredAdvances: formattedAdvances.filter(a => 
          a.status === 'pending' && new Date(a.repayDate) <= now
        ).length,
        approvedAdvances: formattedAdvances.filter(a => 
          a.status === 'approved'
        ).length,
        completedAdvances: formattedAdvances.filter(a => 
          a.dates.repaid || a.status === 'canceled'
        ).length
      },
      financial: {
        totalAmountBorrowed: formattedAdvances
          .filter(a => a.dates.disbursed)
          .reduce((sum, a) => sum + a.requestedAmount, 0),
        totalFeesPaid: formattedAdvances
          .filter(a => a.dates.disbursed)
          .reduce((sum, a) => sum + a.fee, 0),
        averageAdvanceAmount: formattedAdvances.length > 0 
          ? Math.round((formattedAdvances.reduce((sum, a) => sum + a.requestedAmount, 0) / formattedAdvances.length) * 100) / 100
          : 0,
        pendingAmount: formattedAdvances
          .filter(a => a.status === 'pending' && new Date(a.repayDate) > now)
          .reduce((sum, a) => sum + a.totalAmount, 0)
      },
      dates: {
        firstAdvance: formattedAdvances.length > 0 
          ? formattedAdvances[formattedAdvances.length - 1].dates.created 
          : null,
        lastAdvance: formattedAdvances.length > 0 
          ? formattedAdvances[0].dates.created 
          : null,
        nextRepayment: formattedAdvances
          .filter(a => a.dates.disbursed && !a.dates.repaid)
          .sort((a, b) => new Date(a.repayDate).getTime() - new Date(b.repayDate).getTime())[0]?.repayDate || null
      }
    };

    // Group advances by status with minimal information
    const advancesByStatus = {
      active: formattedAdvances
        .filter(a => a.dates.disbursed && !a.dates.repaid && a.status === 'funded')
        .map(a => ({
          id: a.id,
          amount: a.requestedAmount,
          fee: a.fee,
          totalAmount: a.totalAmount,
          repayDate: a.repayDate,
          disbursedAt: a.dates.disbursed,
          bankAccount: a.bankAccount
        })),
      pending: formattedAdvances
        .filter(a => a.status === 'pending' && new Date(a.repayDate) > now)
        .sort((a, b) => new Date(a.repayDate).getTime() - new Date(b.repayDate).getTime())
        .map(a => ({
          id: a.id,
          amount: a.requestedAmount,
          fee: a.fee,
          totalAmount: a.totalAmount,
          repayDate: a.repayDate,
          createdAt: a.dates.created,
          bankAccount: a.bankAccount,
          daysUntilExpiry: Math.ceil((new Date(a.repayDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        })),
      expired: formattedAdvances
        .filter(a => a.status === 'pending' && new Date(a.repayDate) <= now)
        .sort((a, b) => new Date(b.repayDate).getTime() - new Date(a.repayDate).getTime())
        .map(a => ({
          id: a.id,
          amount: a.requestedAmount,
          fee: a.fee,
          totalAmount: a.totalAmount,
          repayDate: a.repayDate,
          createdAt: a.dates.created,
          bankAccount: a.bankAccount,
          daysExpired: Math.ceil((now.getTime() - new Date(a.repayDate).getTime()) / (1000 * 60 * 60 * 24))
        })),
      approved: formattedAdvances
        .filter(a => a.status === 'approved')
        .map(a => ({
          id: a.id,
          amount: a.requestedAmount,
          fee: a.fee,
          totalAmount: a.totalAmount,
          repayDate: a.repayDate,
          approvedAt: a.dates.approved,
          bankAccount: a.bankAccount
        })),
      completed: formattedAdvances
        .filter(a => a.dates.repaid || a.status === 'canceled')
        .sort((a, b) => new Date(b.dates.repaid || b.dates.updated || '').getTime() - new Date(a.dates.repaid || a.dates.updated || '').getTime())
        .map(a => ({
          id: a.id,
          amount: a.requestedAmount,
          fee: a.fee,
          totalAmount: a.totalAmount,
          repayDate: a.repayDate,
          completedAt: a.dates.repaid || a.dates.updated,
          bankAccount: a.bankAccount,
          status: a.dates.repaid ? 'repaid' : 'canceled'
        }))
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        advances: advancesByStatus
      }
    });

  } catch (error: any) {
    logger.error('Get User Blink Advances Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Blink Advance information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

