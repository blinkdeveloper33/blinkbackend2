import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import supabase from '../services/supabaseService';
import logger from '../services/logger';

interface CreateBlinkAdvanceRequest {
  bankAccountId: string;
  transferSpeed: 'instant' | 'standard';
  repaymentTermDays: 7 | 15;
  amount?: number; // Optional since we'll set it
}

/**
 * Creates a new BlinkAdvance request.
 */
export const createBlinkAdvance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found.'
      });
      return;
    }

    const userId = req.user.id;
    const { bankAccountId, transferSpeed, repaymentTermDays } = req.body as CreateBlinkAdvanceRequest;

    // Fixed amount - always $200
    const FIXED_AMOUNT = 200.00;
    req.body.amount = FIXED_AMOUNT; // Set the amount in the request body for validation

    // Calculate fees based on transfer speed
    const originalFeeAmount = transferSpeed === 'instant' ? 25.00 : 20.00;

    // Apply discount if repayment term is 7 days
    const discountPercentage = repaymentTermDays === 7 ? 10.00 : null;
    const feeAmount = discountPercentage 
      ? Number((originalFeeAmount * (1 - discountPercentage/100)).toFixed(2))
      : originalFeeAmount;

    // Calculate repayment date
    const repaymentDate = new Date();
    repaymentDate.setDate(repaymentDate.getDate() + repaymentTermDays);

    // Calculate total repayment amount
    const totalRepaymentAmount = Number((FIXED_AMOUNT + feeAmount).toFixed(2));

    // Check if user has any active advances
    const { data: activeAdvances, error: activeError } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing', 'active'])
      .limit(1);

    if (activeError) {
      logger.error('Active advances check error:', activeError);
      throw activeError;
    }

    if (activeAdvances && activeAdvances.length > 0) {
      res.status(400).json({
        success: false,
        error: 'You already have an active advance. Please complete it before requesting a new one.'
      });
      return;
    }

    // Check if the bank account exists and belongs to the user
    const { data: bankAccount, error: bankError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', bankAccountId)
      .eq('user_id', userId)
      .single();

    if (bankError || !bankAccount) {
      res.status(400).json({
        success: false,
        error: 'Bank account not found or does not belong to the user.'
      });
      return;
    }

    // Prepare the blink advance record
    const blinkAdvanceData = {
      user_id: userId,
      bank_account_id: bankAccountId,
      amount: FIXED_AMOUNT,
      transfer_speed: transferSpeed,
      fee_amount: feeAmount,
      total_repayment_amount: totalRepaymentAmount,
      repayment_date: repaymentDate.toISOString(),
      repayment_term_days: repaymentTermDays,
      fee_discount_applied: discountPercentage !== null,
      discount_percentage: discountPercentage,
      status: 'pending',
      original_fee_amount: originalFeeAmount,
      funds_disbursed: false,
      repayment_received: false,
      metadata: {
        request_ip: req.ip,
        user_agent: req.headers['user-agent'],
        created_via: 'api',
        user_selected_options: {
          initial_fee: originalFeeAmount,
          discount_applied: discountPercentage !== null,
          original_repayment_date: repaymentDate.toISOString()
        }
      }
    };

    // Create the blink advance
    const { data: newAdvance, error: insertError } = await supabase
      .from('blink_advances')
      .insert([blinkAdvanceData])
      .select()
      .single();

    if (insertError) {
      logger.error('Insert Error:', insertError);
      throw insertError;
    }

    // Send success response
    res.status(201).json({
      success: true,
      message: 'BlinkAdvance request created successfully.',
      data: newAdvance
    });

  } catch (error: any) {
    logger.error('Create BlinkAdvance Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create BlinkAdvance request.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 