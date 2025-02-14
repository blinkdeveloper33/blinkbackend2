import { Response } from 'express';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

/**
 * Get detailed bank account information for the authenticated user
 * GET /api/bank-accounts/details
 */
export const getBankAccountDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Received request for bank account details');
    const userId = req.user?.id;

    if (!userId) {
      logger.debug('No user ID found in request');
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found.'
      });
      return;
    }

    logger.debug(`Fetching bank accounts for user: ${userId}`);
    // Fetch all bank accounts for the user
    const { data: bankAccounts, error } = await supabase
      .from('bank_accounts')
      .select(`
        id,
        user_id,
        account_id,
        account_name,
        account_type,
        account_subtype,
        account_mask,
        created_at,
        available_balance,
        current_balance,
        currency
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Error fetching bank accounts: ' + error.message);
    }

    // Transform the data to format balances and add additional information
    const formattedBankAccounts = bankAccounts.map(account => ({
      id: account.id,
      accountId: account.account_id,
      name: account.account_name,
      type: account.account_type,
      subtype: account.account_subtype,
      mask: account.account_mask,
      balances: {
        available: account.available_balance ? Number(account.available_balance) : null,
        current: account.current_balance ? Number(account.current_balance) : null,
        currency: account.currency || 'USD'
      },
      createdAt: account.created_at,
      isActive: true,
      metadata: {
        lastUpdated: new Date().toISOString(),
        isVerified: true
      }
    }));

    // Calculate some summary statistics
    const summary = {
      totalAccounts: formattedBankAccounts.length,
      accountTypes: formattedBankAccounts.reduce((acc, account) => {
        acc[account.type] = (acc[account.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalBalance: formattedBankAccounts.reduce((sum, account) => 
        sum + (account.balances.current || 0), 0
      ),
      oldestAccount: formattedBankAccounts.length > 0 
        ? formattedBankAccounts[formattedBankAccounts.length - 1].createdAt 
        : null,
      newestAccount: formattedBankAccounts.length > 0 
        ? formattedBankAccounts[0].createdAt 
        : null
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        accounts: formattedBankAccounts
      }
    });

  } catch (error: any) {
    logger.error('Get Bank Account Details Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bank account information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 