// src/controllers/blinkAdvanceController.ts

import { Request, Response } from 'express';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import { BlinkAdvance } from '../types/types';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

/**
 * Creates a new BlinkAdvance request.
 */
export const createBlinkAdvance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { transferSpeed, repaymentDate, bankAccountId } = req.body;
  
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }
  
  const userId = req.user.id;

  try {
    // Fixed amount of $200
    const amount = 200;

    // Validate transferSpeed
    if (!['Instant', 'Standard'].includes(transferSpeed)) {
      res.status(400).json({
        success: false,
        error: "Transfer speed must be either 'Instant' or 'Standard'.",
      });
      return;
    }

    // Validate repaymentDate is within 31 days from now
    const today = new Date();
    const repayDate = new Date(repaymentDate);
    const maxRepayDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);

    if (repayDate > maxRepayDate) {
      res.status(400).json({
        success: false,
        error: 'Repayment date must be within 31 days from today.',
      });
      return;
    }

    // Calculate base fee based on transfer speed
    const baseFee = transferSpeed === 'Instant' ? 24.99 : 19.99;
    
    // Calculate discount based on repayment date
    // If repayment is within 7 days, apply 10% discount
    const daysUntilRepayment = Math.ceil((repayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const discountApplied = daysUntilRepayment <= 7 ? 0.10 : 0;
    const finalFee = baseFee * (1 - discountApplied);

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

    // Check if user has any active advances
    const { data: activeAdvances, error: activeError } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved', 'disbursed'])
      .limit(1);

    if (activeError) {
      throw activeError;
    }

    if (activeAdvances && activeAdvances.length > 0) {
      res.status(400).json({
        success: false,
        error: 'You already have an active advance. Please repay it before requesting a new one.',
      });
      return;
    }

    // Insert the new BlinkAdvance record
    const { data: newAdvance, error: insertError } = await supabase
      .from('blink_advances')
      .insert([
        {
          user_id: userId,
          bank_account_id: bankAccountId,
          amount: amount,
          transfer_speed: transferSpeed,
          base_fee: baseFee,
          discount_applied: discountApplied,
          final_fee: finalFee,
          repayment_date: repaymentDate,
          status: 'pending',
          is_early_repayment: daysUntilRepayment <= 7
        },
      ])
      .select('*')
      .single();

    if (insertError) {
      throw insertError;
    }

    res.status(201).json({
      success: true,
      message: 'BlinkAdvance request created successfully.',
      advance: newAdvance,
    });
  } catch (error) {
    logger.error('Create BlinkAdvance Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create BlinkAdvance request.',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};

/**
 * Retrieves all BlinkAdvances for the authenticated user.
 */
export const getBlinkAdvances = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  const userId = req.user.id;

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
      advances: data,
    });
  } catch (error) {
    logger.error('Get BlinkAdvances Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve BlinkAdvance records.',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};

/**
 * Retrieves a specific BlinkAdvance by ID.
 */
export const getBlinkAdvanceById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  const userId = req.user.id;
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
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
      advance: data,
    });
  } catch (error) {
    logger.error('Get BlinkAdvance By ID Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve BlinkAdvance record.',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};

/**
 * Updates the status of a BlinkAdvance.
 */
export const updateBlinkAdvanceStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  const userId = req.user.id;
  const { id } = req.params;
  const { status, reference } = req.body;

  const validStatuses = ['approved', 'disbursed', 'repaid', 'defaulted', 'cancelled'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      error: `Status must be one of: ${validStatuses.join(', ')}.`,
    });
    return;
  }

  try {
    // Fetch current advance
    const { data: currentAdvance, error: fetchError } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !currentAdvance) {
      res.status(404).json({
        success: false,
        error: 'BlinkAdvance record not found.',
      });
      return;
    }

    // Define valid status transitions
    const validTransitions: { [key: string]: string[] } = {
      pending: ['approved', 'cancelled'],
      approved: ['disbursed', 'cancelled'],
      disbursed: ['repaid', 'defaulted'],
      repaid: [],
      defaulted: [],
      cancelled: [],
    };

    const allowedTransitions = validTransitions[currentAdvance.status] || [];
    if (!allowedTransitions.includes(status)) {
      res.status(400).json({
        success: false,
        error: `Cannot transition from ${currentAdvance.status} to ${status}.`,
      });
      return;
    }

    // Prepare update data
    const updateData: any = { status };
    
    // Add timestamp based on status
    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString();
      updateData.processing_reference = reference;
    } else if (status === 'disbursed') {
      updateData.disbursed_at = new Date().toISOString();
      updateData.disbursement_reference = reference;
    } else if (status === 'repaid') {
      updateData.repaid_at = new Date().toISOString();
      updateData.repayment_reference = reference;
    }

    // Update the advance
    const { data: updatedAdvance, error: updateError } = await supabase
      .from('blink_advances')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({
      success: true,
      message: 'BlinkAdvance status updated successfully.',
      advance: updatedAdvance,
    });
  } catch (error) {
    logger.error('Update BlinkAdvance Status Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update BlinkAdvance status.',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};

/**
 * Checks if a user has any active advances.
 */
export const checkActiveAdvance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved', 'disbursed'])
      .limit(1);

    if (error) {
      throw error;
    }

    const hasActiveAdvance = data && data.length > 0;

    res.status(200).json({
      success: true,
      hasActiveAdvance,
      activeAdvance: hasActiveAdvance ? data[0] : null,
    });
  } catch (error) {
    logger.error('Check Active Advance Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for active advances.',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
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

