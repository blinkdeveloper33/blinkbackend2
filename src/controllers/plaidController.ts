// src/controllers/plaidController.ts ⭐️⭐️⭐️

import { 
  Configuration, 
  CountryCode, 
  PlaidApi, 
  PlaidEnvironments, 
  Products,
  Transaction as PlaidApiTransaction,
  TransactionsSyncRequest as PlaidTransactionsSyncRequest,
  RemovedTransaction,
  AccountBase
} from 'plaid';
import { Request, Response } from 'express';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import config from '../config';
import crypto from 'crypto';
import {
  CustomAccountBalance,
  PlaidAccount,
  Transaction,
  TransactionsSyncRequest,
  CustomTransactionsSyncResponse
} from '../types/types'; // Updated to match your types file
import { AuthenticatedRequest } from '../middleware/authMiddleware';

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments[config.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': config.PLAID_CLIENT_ID,
      'PLAID-SECRET': config.PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Add this interface at the top of the file with other interfaces
interface SpendingSegment {
  date: string;
  spending: number;
}

// Add these type definitions at the top of the file with other interfaces
type FrequencyType = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

interface RecurringExpense {
  merchant: string;
  frequency: FrequencyType;
  averageAmount: number;
  recentAmount: number;
  hasUnusualChange: boolean;
  amountChangePercent: number;
  lastDate: string;
  nextExpectedDate: string;
  transactionCount: number;
  category: string;
  confidence: number;
  transactions: Array<{
    date: string;
    amount: number;
    description: string;
  }>;
}

// Add these interfaces at the top of the file with other interfaces
interface BankAccountDetails {
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  account_mask: string | null;
}

interface TransactionWithBankAccount {
  id: string;
  transaction_id: string;
  amount: number;
  date: string;
  description: string;
  original_description: string | null;
  category: string | null;
  category_detailed: string | null;
  merchant_name: string | null;
  pending: boolean | null;
  created_at: string;
  account_id: string;
  bank_accounts: BankAccountDetails;
}

/**
 * Handles Plaid webhook events.
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-plaid-signature'] as string;
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', config.PLAID_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid webhook signature');
      res.status(400).json({ 
        success: false,
        error: 'Invalid signature' 
      });
      return;
    }

    const { webhook_type, webhook_code, item_id } = req.body;

    logger.info(`Received webhook: Type=${webhook_type}, Code=${webhook_code}, Item ID=${item_id}`);

    // Handle specific webhook events
    if (webhook_type === 'TRANSACTIONS') {
      if (['SYNC_UPDATES_AVAILABLE', 'RECURRING_TRANSACTIONS_UPDATE'].includes(webhook_code)) {
        // Find the user_id associated with the item_id
        const { data: bankAccount, error: bankError } = await supabase
          .from('bank_accounts')
          .select('user_id')
          .eq('plaid_item_id', item_id)
          .single();

        if (bankError || !bankAccount) {
          logger.error(`Failed to find bank account for item_id: ${item_id}`, bankError?.message);
          res.status(400).json({ 
            success: false,
            error: 'User not found for the provided item_id' 
          });
          return;
        }

        const userId = bankAccount.user_id;

        try {
          const stats = await syncTransactionsForUser(userId);
          // Also fetch and store balances
          await fetchAndStoreAccountBalances(userId);

          logger.info(`Synchronization triggered for userId: ${userId}. Stats: Added=${stats.added}, Modified=${stats.modified}, Removed=${stats.removed}`);
          res.status(200).json({ 
            success: true, 
            message: 'Webhook received and synchronization triggered' 
          });
        } catch (syncError: any) {
          logger.error(`Error synchronizing transactions for userId: ${userId}`, syncError.message);
          res.status(500).json({ 
            success: false, 
            error: 'Failed to synchronize transactions', 
            details: syncError.message 
          });
        }

      } else {
        logger.info(`Unhandled TRANSACTIONS webhook_code: ${webhook_code}`);
        res.status(200).json({ 
          success: true,
          message: 'Webhook received' 
        });
      }
    } else {
      logger.info(`Unhandled webhook_type: ${webhook_type}, webhook_code: ${webhook_code}`);
      res.status(200).json({ 
        success: true,
        message: 'Webhook received' 
      });
    }
  } catch (error: any) {
    logger.error('Webhook Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
};

/**
 * Create a link token
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const createLinkToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    const request = {
      user: { client_user_id: userId },
      client_name: config.CLIENT_NAME || 'Blink',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us], // Fixed: Changed US to Us
      language: 'en',
      webhook: config.PLAID_WEBHOOK_URL,
    };
    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    res.status(200).json({ 
      success: true,
      link_token: createTokenResponse.data.link_token 
    });
  } catch (error: any) {
    logger.error('Error creating link token:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create link token',
      details: error.response?.data || error.message
    });
  }
};

/**
 * Exchange a public token for an access token
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const exchangePublicToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicToken, userId } = req.body;

    if (!publicToken || !userId) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
      return;
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Fetch accounts using the access token
    const accountsResponse = await plaidClient.accountsGet({ 
      access_token: accessToken 
    });

    // Prepare accounts data for database insertion
    const bankAccountsToInsert = accountsResponse.data.accounts.map((account: AccountBase) => ({
      user_id: userId,
      plaid_access_token: accessToken,
      plaid_item_id: itemId,
      account_id: account.account_id,
      account_name: account.name,
      account_type: account.type,
      account_subtype: account.subtype ?? 'unknown',
      account_mask: account.mask ?? '', // Use nullish coalescing
      cursor: null,
      created_at: new Date().toISOString(),
      available_balance: account.balances.available ?? 0,
      current_balance: account.balances.current ?? 0,
      currency: account.balances.iso_currency_code ?? 'USD',
    }))

    // Upsert accounts to the database
    const { data, error: upsertError } = await supabase
      .from('bank_accounts')
      .upsert(bankAccountsToInsert, { onConflict: 'account_id' })
      .select();

    if (upsertError) {
      throw upsertError;
    }

    // Format response accounts for the frontend
    const responseAccounts = data.map((account: any) => ({
      id: account.id,
      user_id: account.user_id,
      account_id: account.account_id,
      name: account.account_name,
      type: account.account_type,
      subtype: account.account_subtype,
      available_balance: account.available_balance,
      current_balance: account.current_balance,
      currency: account.currency,
    }));

    res.status(200).json({
      success: true,
      message: 'Bank accounts connected successfully',
      accounts: responseAccounts,
    });

  } catch (error: any) {
    logger.error('Error exchanging public token:', {
      error: error.message,
      userId: req.body.userId,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to exchange public token',
      details: error.response?.data || error.message,
    });
  }
};

/**
 * Synchronizes transactions for a given user.
 * @param userId - The ID of the user whose transactions are to be synchronized
 * @returns An object containing the count of added, modified, and removed transactions
 */
export const syncTransactionsForUser = async (userId: string): Promise<{ added: number, modified: number, removed: number }> => {
  try {
    const { data: bankAccounts, error: bankError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId);
    if (bankError) throw new Error('Error fetching bank accounts: ' + bankError.message);
    if (!bankAccounts || bankAccounts.length === 0) throw new Error('No bank accounts found for user');
    
    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    // Process each bank account in parallel
    await Promise.all(bankAccounts.map(async (account) => {
      try {
        let hasMore = true;
        let currentCursor = account.cursor || null;
        while (hasMore) {
          const syncRequest: TransactionsSyncRequest = {
            access_token: account.plaid_access_token,
            cursor: currentCursor || undefined,
            options: {
              include_personal_finance_category: true,
              include_original_description: true
            }
          };
          const response = await plaidClient.transactionsSync(syncRequest);
          const syncResponse = response.data as CustomTransactionsSyncResponse;
          const { added, modified, removed, next_cursor, has_more } = syncResponse;
          const transactionsToUpsert: Partial<Transaction>[] = [...added, ...modified].map((txn: PlaidApiTransaction) => ({
            transaction_id: txn.transaction_id,
            user_id: userId,
            bank_account_id: account.id,
            account_id: txn.account_id,
            amount: txn.amount,
            date: txn.date,
            description: txn.name,
            original_description: txn.original_description || '',
            category: txn.category ? txn.category[0] : 'Uncategorized',
            category_detailed: txn.category ? txn.category.join(', ') : null,
            merchant_name: txn.merchant_name || null,
            pending: txn.pending || false,
            created_at: new Date().toISOString()
          }));
          if (transactionsToUpsert.length > 0) {
            const { error: upsertError } = await supabase
              .from('transactions')
              .upsert(transactionsToUpsert, { onConflict: 'transaction_id' });
            if (upsertError) throw new Error('Error upserting transactions: ' + upsertError.message);
            totalAdded += added.length;
            totalModified += modified.length;
          }
          if (removed.length > 0) {
            const { error: deleteError } = await supabase
              .from('transactions')
              .delete()
              .in('transaction_id', removed.map(t => t.transaction_id));
            if (deleteError) throw new Error('Error deleting transactions: ' + deleteError.message);
            totalRemoved += removed.length;
          }
          currentCursor = next_cursor;
          hasMore = has_more;
        }
        const { error: updateError } = await supabase
          .from('bank_accounts')
          .update({ cursor: currentCursor })
          .eq('id', account.id);
        if (updateError) throw new Error('Error updating cursor: ' + updateError.message);
      } catch (accountError: any) {
        logger.error(`Sync Error for account ${account.id}:`, accountError.message);
        // Continue with other accounts even if one fails
      }
    }));

    return { added: totalAdded, modified: totalModified, removed: totalRemoved };
  } catch (error: any) {
    logger.error('Sync Error:', error.message);
    throw error;
  }
};

/**
 * Transactions sync handler
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const transactionsSyncHandler = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;
  try {
    const stats = await syncTransactionsForUser(userId);
    res.status(200).json({
      success: true,
      stats: {
        added: stats.added,
        modified: stats.modified,
        removed: stats.removed
      }
    });
  } catch (error: any) {
    logger.error('Sync Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to sync transactions', 
      details: error.message 
    });
  }
};

/**
 * Fetches and stores account balances for a user
 * @param userId - The ID of the user
 */
export const fetchAndStoreAccountBalances = async (userId: string): Promise<void> => {
  try {
    const { data: bankAccounts, error: bankError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId);

    if (bankError) throw new Error('Error fetching bank accounts: ' + bankError.message);
    if (!bankAccounts || bankAccounts.length === 0) throw new Error('No bank accounts found for user');

    for (const account of bankAccounts) {
      const response = await plaidClient.accountsGet({
        access_token: account.plaid_access_token,
      });
      
      const accounts = response.data.accounts;
      const plaidAccount = accounts.find((acc: AccountBase) => acc.account_id === account.account_id);

      if (!plaidAccount) {
        logger.warn(`Account ID ${account.account_id} not found in Plaid response.`);
        continue;
      }

      const balanceData = {
        available_balance: plaidAccount.balances.available ?? 0,
        current_balance: plaidAccount.balances.current ?? 0,
        currency: plaidAccount.balances.iso_currency_code ?? 'USD',
      };

      const { error: updateError } = await supabase
        .from('bank_accounts')
        .update(balanceData)
        .eq('id', account.id);

      if (updateError) {
        throw new Error(`Error updating balance for account ${account.id}: ${updateError.message}`);
      }

      logger.info(`Updated balance for account ${account.account_id}`);
    }
  } catch (error: any) {
    logger.error(`Error in fetchAndStoreAccountBalances: ${error.message}`);
    throw error;
  }
};

/**
 * Sync balances handler
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const syncBalancesHandler = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;
  try {
    await fetchAndStoreAccountBalances(userId);
    res.status(200).json({ 
      success: true, 
      message: 'Account balances synchronized successfully' 
    });
  } catch (error: any) {
    logger.error('Balance Sync Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to synchronize account balances', 
      details: error.message 
    });
  }
};

/**
 * Get transactions for a user
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, bankAccountId, startDate, endDate } = req.body;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    // If bankAccountId is not 'all', filter by the specific bank account
    if (bankAccountId !== 'all') {
      query = query.eq('bank_account_id', bankAccountId);
    }

    const { data: transactions, error } = await query;

    if (error) throw new Error('Error fetching transactions: ' + error.message);
    res.status(200).json({
      success: true,
      page,
      limit,
      transactions,
    });
  } catch (error: any) {
    logger.error('Get Transactions Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve transactions', 
      details: error.message 
    });
  }
};

/**
 * Get the last 5 transactions for a user
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getRecentTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.params.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User ID not provided.',
    });
    return;
  }

  try {
    // Fetch only the last 7 transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(7);  // Limit to 7 transactions

    if (error) throw new Error('Error fetching transactions: ' + error.message);

    // Transform transactions for frontend display
    const transformedTransactions = transactions.map(tx => ({
      ...tx,
      // Convert amount for frontend display:
      // - Positive amounts (expenses) should be negative in frontend
      // - Negative amounts (income) should be positive in frontend
      amount: tx.amount > 0 ? -tx.amount : Math.abs(tx.amount)
    }));

    res.status(200).json({
      success: true,
      transactions: transformedTransactions
    });

  } catch (error: any) {
    logger.error('Get Recent Transactions Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent transactions.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get current balances for all bank accounts of the authenticated user
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getCurrentBalances = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id; // Assuming the user ID is attached to the request by the auth middleware

    const { data: bankAccounts, error } = await supabase
      .from('bank_accounts')
      .select('id, account_name, current_balance, available_balance, currency')
      .eq('user_id', userId);

    if (error) throw new Error('Error fetching bank accounts: ' + error.message);

    if (!bankAccounts || bankAccounts.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No bank accounts found for the user',
        totalBalance: 0,
        accounts: []
      });
      return;
    }

    const accounts = bankAccounts.map(account => ({
      id: account.id,
      name: account.account_name,
      currentBalance: account.current_balance,
      availableBalance: account.available_balance,
      currency: account.currency
    }));

    const totalBalance = accounts.reduce((sum, account) => sum + account.currentBalance, 0);

    res.status(200).json({
      success: true,
      totalBalance,
      accounts
    });
  } catch (error: any) {
    logger.error('Get Current Balances Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve current balances', 
      details: error.message 
    });
  }
};

/**
 * Get all transactions for the authenticated user
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getAllTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
    const offset = (page - 1) * pageSize;

    // Fetch transactions with pagination
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error('Error fetching transactions: ' + error.message);
    }

    // Transform transactions for frontend display
    const transformedTransactions = transactions.map(tx => ({
      ...tx,
      // Convert amount for frontend display:
      // - Positive amounts (expenses) should be negative in frontend
      // - Negative amounts (income) should be positive in frontend
      amount: tx.amount > 0 ? -tx.amount : Math.abs(tx.amount)
    }));

    res.status(200).json({
      success: true,
      data: {
        transactions: transformedTransactions,
        pagination: {
          page,
          pageSize,
          totalPages: Math.ceil((transactions.length || 0) / pageSize),
          totalCount: transactions.length
        }
      }
    });
  } catch (error: any) {
    logger.error('Get All Transactions Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve transactions'
    });
  }
};

/**
 * Retrieves daily transaction summaries for the last 15 days
 */
export const getDailyTransactionSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    // Fetch the most recent transactions first
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(50); // Get the last 50 transactions to ensure we have enough data

    if (error) {
      throw new Error('Error fetching transactions: ' + error.message);
    }

    if (!transactions || transactions.length === 0) {
      res.status(200).json({
        success: true,
        data: [],
      });
      return;
    }

    // Group transactions by date and calculate summaries
    // Convert amounts: positive in DB (outflow) becomes negative, negative in DB (inflow) becomes positive
    const dailySummaries = transactions.reduce((acc: any, transaction: any) => {
      const date = transaction.date;
      if (!acc[date]) {
        acc[date] = { totalAmount: 0, transactionCount: 0 };
      }
      // Invert the amount: outflows (positive in DB) become negative, inflows (negative in DB) become positive
      acc[date].totalAmount += transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
      acc[date].transactionCount += 1;
      return acc;
    }, {});

    // Convert to array and format
    const formattedSummaries = Object.entries(dailySummaries).map(([date, summary]: [string, any]) => ({
      date,
      totalAmount: Number(summary.totalAmount.toFixed(2)),
      transactionCount: summary.transactionCount,
    }));

    // Sort by date descending
    formattedSummaries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Take only the first 15 days of data
    const limitedSummaries = formattedSummaries.slice(0, 15);

    res.status(200).json({
      success: true,
      data: limitedSummaries,
    });
  } catch (error: any) {
    logger.error('Get Daily Transaction Summary Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve daily transaction summary.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
* Get spending summary for a specified time frame
* @param req - Express Request object
* @param res - Express Response object
*/
export const getSpendingSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as string;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  if (!['LAST_WEEK', 'LAST_MONTH', 'LAST_QUARTER', 'LAST_YEAR'].includes(timeFrame)) {
    res.status(400).json({
      success: false,
      error: 'Invalid time frame. Must be LAST_WEEK, LAST_MONTH, LAST_QUARTER, or LAST_YEAR.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, category, date')
      .eq('user_id', userId)
      .gt('amount', 0) // Spending transactions are positive
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    if (error) {
      throw new Error('Error fetching transactions: ' + error.message);
    }

    const categorySummary = data.reduce((acc: any, transaction: any) => {
      const category = transaction.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = { totalSpent: 0, transactionCount: 0 };
      }
      acc[category].totalSpent += transaction.amount;
      acc[category].transactionCount += 1;
      return acc;
    }, {});

    // Format the response
    const formattedCategories = Object.entries(categorySummary).map(([category, summary]: [string, any]) => ({
      category,
      totalSpent: Number(summary.totalSpent.toFixed(2)),
      transactionCount: summary.transactionCount,
    }));

    // Sort by total spent descending
    formattedCategories.sort((a: any, b: any) => b.totalSpent - a.totalSpent);

    res.status(200).json({
      success: true,
      data: {
        timeFrame,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        categories: formattedCategories,
      },
    });
  } catch (error: any) {
    logger.error('Get Spending Summary Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve spending summary.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
* Get transaction category analysis
* GET /api/plaid/transaction-category-analysis?timeFrame=LAST_WEEK|LAST_MONTH|LAST_QUARTER|LAST_YEAR
*/
export const getTransactionCategoryAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as string;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  if (!['LAST_WEEK', 'LAST_MONTH', 'LAST_QUARTER', 'LAST_YEAR'].includes(timeFrame)) {
    res.status(400).json({
      success: false,
      error: 'Invalid time frame. Must be LAST_WEEK, LAST_MONTH, LAST_QUARTER, or LAST_YEAR.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, category, date')
      .eq('user_id', userId)
      .gt('amount', 0) // Only consider positive amounts (expenses)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    if (error) {
      throw new Error('Error fetching transactions: ' + error.message);
    }

    const categorySummary = (data as { amount: number; category: string | null; date: string }[]).reduce((acc: Record<string, { totalSpent: number; transactionCount: number }>, transaction) => {
      const category = transaction.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = { totalSpent: 0, transactionCount: 0 };
      }
      acc[category].totalSpent += transaction.amount;
      acc[category].transactionCount += 1;
      return acc;
    }, {});

    // Format the response
    const formattedCategories = Object.entries(categorySummary).map(([category, summary]) => ({
      category,
      totalSpent: Number(summary.totalSpent.toFixed(2)),
      transactionCount: summary.transactionCount,
    }));

    // Sort by total spent descending
    formattedCategories.sort((a, b) => b.totalSpent - a.totalSpent);

    res.status(200).json({
      success: true,
      data: {
        timeFrame,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        categories: formattedCategories,
      },
    });
  } catch (error: any) {
    logger.error('Get Transaction Category Analysis Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction category analysis.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Helper function to calculate date range based on timeFrame
 */
function calculateDateRange(timeFrame: string): { startDate: Date; endDate: Date } {
  // Get current date in local timezone and set to start of day
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Set end date to end of current day
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);
  
  // Initialize start date with current date
  const startDate = new Date(now);

  switch (timeFrame) {
    case 'LAST_WEEK':
      startDate.setDate(startDate.getDate() - 7); // Last 7 days
      break;

    case 'LAST_MONTH':
      startDate.setDate(startDate.getDate() - 28); // Last 4 weeks
      break;

    case 'LAST_QUARTER':
      startDate.setMonth(startDate.getMonth() - 3); // Last 3 months
      break;

    case 'LAST_YEAR':
      startDate.setFullYear(startDate.getFullYear() - 1); // Last 12 months
      break;

    default:
      throw new Error(`Invalid timeFrame: ${timeFrame}`);
  }

  logger.debug(`Date range calculated for ${timeFrame}:`, {
    timeFrame,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    explanation: `Showing data from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
  });

  return { startDate, endDate };
}

/**
 * Get detailed information about a specific transaction
 * GET /api/plaid/transactions/:transactionId
 */
export const getTransactionDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const transactionId = req.params.transactionId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.'
    });
    return;
  }

  try {
    // Fetch detailed transaction information with bank account details
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        id,
        transaction_id,
        amount,
        date,
        description,
        original_description,
        category,
        category_detailed,
        merchant_name,
        pending,
        created_at,
        account_id,
        bank_accounts!inner (
          account_name,
          account_type,
          account_subtype,
          account_mask
        )
      `)
      .eq('id', transactionId)
      .eq('user_id', userId)
      .single() as { data: TransactionWithBankAccount | null, error: any };

    if (error) {
      throw new Error('Error fetching transaction details: ' + error.message);
    }

    if (!transaction) {
      res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
      return;
    }

    // Get the bank account details
    const bankAccount = transaction.bank_accounts;

    // Format the response
    const formattedTransaction = {
      id: transaction.id,
      transactionId: transaction.transaction_id,
      amount: transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount), // Convert for frontend display
      date: transaction.date,
      description: transaction.description,
      originalDescription: transaction.original_description || null,
      category: transaction.category || 'Uncategorized',
      categoryDetailed: transaction.category_detailed || null,
      merchantName: transaction.merchant_name || null,
      pending: transaction.pending || false,
      accountDetails: {
        id: transaction.account_id,
        name: bankAccount.account_name,
        type: bankAccount.account_type,
        subtype: bankAccount.account_subtype || null,
        mask: bankAccount.account_mask || null
      },
      createdAt: transaction.created_at
    };

    res.status(200).json({
      success: true,
      data: formattedTransaction
    });
  } catch (error: any) {
    logger.error('Get Transaction Details Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Helper function to standardize category names to match frontend expectations
 */
function standardizeCategory(category: string): string {
  // Map to match frontend's expected category names exactly
  const categoryMap: { [key: string]: string } = {
    // Food & Dining
    'FOOD_AND_DRINK': 'Food & Dining',
    'FOOD_AND_BEVERAGE': 'Food & Dining',
    'RESTAURANTS': 'Food & Dining',
    'DINING': 'Food & Dining',
    'GROCERIES': 'Food & Dining',
    'COFFEE': 'Food & Dining',
    
    // Shopping
    'SHOPPING': 'Shopping',
    'GENERAL_MERCHANDISE': 'Shopping',
    'CLOTHING': 'Shopping',
    'ELECTRONICS': 'Shopping',
    'RETAIL': 'Shopping',
    
    // Transportation
    'TRANSPORTATION': 'Transportation',
    'TAXI': 'Transportation',
    'UBER': 'Transportation',
    'LYFT': 'Transportation',
    'PUBLIC_TRANSPORTATION': 'Transportation',
    'PARKING': 'Transportation',
    'GAS': 'Transportation',
    'AUTOMOTIVE': 'Transportation',
    
    // Travel
    'TRAVEL': 'Travel',
    'AIRLINES': 'Travel',
    'HOTELS': 'Travel',
    'RENTAL_CAR': 'Travel',
    'VACATION': 'Travel',
    
    // Utilities
    'UTILITIES': 'Utilities',
    'RENT': 'Utilities',
    'MORTGAGE': 'Utilities',
    'ELECTRICITY': 'Utilities',
    'GAS_AND_ELECTRIC': 'Utilities',
    'WATER': 'Utilities',
    'INTERNET': 'Utilities',
    'PHONE': 'Utilities',
    
    // Entertainment
    'ENTERTAINMENT': 'Entertainment',
    'MOVIES': 'Entertainment',
    'MUSIC': 'Entertainment',
    'GAMES': 'Entertainment',
    'SPORTS': 'Entertainment',
    'STREAMING': 'Entertainment',
    
    // Health
    'HEALTH': 'Health',
    'MEDICAL': 'Health',
    'PHARMACY': 'Health',
    'FITNESS': 'Health',
    'HEALTHCARE': 'Health',
    'INSURANCE_MEDICAL': 'Health',
    
    // Others (will be used as fallback)
    'OTHER': 'Others',
    'MISCELLANEOUS': 'Others',
    'UNCATEGORIZED': 'Others'
  };

  // Convert to uppercase and remove spaces/special chars for matching
  const normalizedCategory = category?.toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'UNCATEGORIZED';
  
  // Return mapped category or Others as default
  return categoryMap[normalizedCategory] || 'Others';
}

/**
 * Get spending analysis for the Expense Breakdown widget
 * GET /api/plaid/spending-analysis?timeFrame=LAST_WEEK|LAST_MONTH|LAST_QUARTER|LAST_YEAR
 */
export const getSpendingAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const timeFrame = (req.query.timeFrame as string) || 'LAST_MONTH';

    logger.debug(`Starting spending analysis for timeFrame: ${timeFrame}`, {
      userId,
      timeFrame
    });

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found'
      });
      return;
    }

    // Validate timeFrame
    if (!['LAST_WEEK', 'LAST_MONTH', 'LAST_QUARTER', 'LAST_YEAR'].includes(timeFrame)) {
      res.status(400).json({
        success: false,
        error: 'Invalid timeFrame. Must be one of: LAST_WEEK, LAST_MONTH, LAST_QUARTER, LAST_YEAR'
      });
      return;
    }

    // Calculate date range based on selected time period
    const { startDate, endDate } = calculateDateRange(timeFrame);

    logger.debug('Date range for analysis:', {
      timeFrame,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // Fetch transactions for the specified period with a single optimized query
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select(`
        amount,
        category,
        date
      `)
      .eq('user_id', userId)
      .gt('amount', 0) // Only get expenses (positive amounts)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (txError) {
      logger.error('Error fetching transactions:', txError);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transactions'
      });
      return;
    }

    logger.debug('Transactions fetched:', {
      count: transactions?.length || 0,
      dateRange: `${startDate.toISOString()} to ${endDate.toISOString()}`
    });

    // Initialize category map for aggregating spending
    const categoryMap = new Map<string, { amount: number; count: number }>();
    let totalSpending = 0;

    // Process transactions and aggregate by category
    transactions?.forEach(tx => {
      const amount = Math.abs(tx.amount);
      const category = standardizeCategory(tx.category || 'Shopping');
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { amount: 0, count: 0 });
      }
      const categoryData = categoryMap.get(category)!;
      categoryData.amount += amount;
      categoryData.count += 1;
      totalSpending += amount;
    });

    // Format categories with percentages and ensure proper sorting
    const categories = Array.from(categoryMap.entries())
      .map(([name, data]) => ({
        name,
        amount: Number(data.amount.toFixed(2)),
        percentage: totalSpending > 0 
          ? Number(((data.amount / totalSpending) * 100).toFixed(1))
          : 0,
        transactionCount: data.count
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate spending segments for the time period
    const segments = calculateSpendingSegments(
      transactions || [],
      timeFrame,
      startDate,
      endDate
    );

    // Get historical spending data
    const historicalSpending = await calculateHistoricalSpending(userId);

    // Format the response to match the widget's expectations exactly
    const response = {
      success: true,
      data: {
        timeFrame,
        totalSpending: Number(totalSpending.toFixed(2)),
        categories,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          label: getPeriodLabel(timeFrame, startDate, endDate)
        },
        segments,
        historicalSpending
      }
    };

    logger.debug('Spending analysis response:', {
      timeFrame,
      totalSpending,
      categoriesCount: categories.length,
      segmentsCount: segments.length
    });

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Spending Analysis Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate spending analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Helper function to get a human-readable period label
 */
function getPeriodLabel(timeFrame: string, startDate: Date, endDate: Date): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  };

  const start = startDate.toLocaleDateString('en-US', formatOptions);
  const end = endDate.toLocaleDateString('en-US', formatOptions);
  
  switch (timeFrame) {
    case 'LAST_WEEK':
      return `Last 7 Days (${start} - ${end})`;
    case 'LAST_MONTH':
      return `Last 4 Weeks (${start} - ${end})`;
    case 'LAST_QUARTER':
      return `Last 3 Months (${start} - ${end})`;
    case 'LAST_YEAR':
      return `Last 12 Months (${start} - ${end})`;
    default:
      return `${start} - ${end}`;
  }
}

/**
 * Helper function to calculate spending segments for trends
 */
function calculateSpendingSegments(
  transactions: any[],
  timeFrame: string,
  startDate: Date,
  endDate: Date
): Array<SpendingSegment> {
  const segments: SpendingSegment[] = [];
  const segmentMap = new Map<string, number>();

  // Initialize segments based on timeFrame
  let currentDate = new Date(startDate);
  const numSegments = getNumberOfSegments(timeFrame);
  
  // Create segments with proper dates
  switch (timeFrame) {
    case 'LAST_WEEK':
    case 'LAST_MONTH':
      // Daily segments
      while (currentDate <= endDate && segments.length < numSegments) {
        const segmentDate = currentDate.toISOString().split('T')[0];
        segmentMap.set(segmentDate, 0);
        segments.push({ date: segmentDate, spending: 0 });
        currentDate.setDate(currentDate.getDate() + 1);
      }
      break;
    
    case 'LAST_QUARTER':
      // Weekly segments
      while (segments.length < numSegments) {
        const segmentDate = currentDate.toISOString().split('T')[0];
        segmentMap.set(segmentDate, 0);
        segments.push({ date: segmentDate, spending: 0 });
        currentDate.setDate(currentDate.getDate() + 7);
      }
      break;
    
    case 'LAST_YEAR':
      // Monthly segments
      while (segments.length < numSegments) {
        const segmentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
          .toISOString().split('T')[0];
        segmentMap.set(segmentDate, 0);
        segments.push({ date: segmentDate, spending: 0 });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      break;
  }

  // Aggregate transactions into segments
  transactions.forEach(tx => {
    const amount = Math.abs(tx.amount);
    if (amount <= 0) return; // Skip non-expenses

    const txDate = new Date(tx.date);
    let segmentDate = txDate.toISOString().split('T')[0]; // Initialize with transaction date

    if (timeFrame === 'LAST_QUARTER') {
      // Find the closest weekly segment
      let matchingSegment = segments.find(segment => {
        const segmentStart = new Date(segment.date);
        const segmentEnd = new Date(segmentStart);
        segmentEnd.setDate(segmentEnd.getDate() + 7);
        return txDate >= segmentStart && txDate < segmentEnd;
      });

      if (!matchingSegment) return;
      segmentDate = matchingSegment.date;
    } else if (timeFrame === 'LAST_YEAR') {
      // First day of the month
      segmentDate = new Date(txDate.getFullYear(), txDate.getMonth(), 1)
        .toISOString().split('T')[0];
    }

    if (segmentMap.has(segmentDate)) {
      segmentMap.set(segmentDate, (segmentMap.get(segmentDate) || 0) + amount);
    }
  });

  // Update segments with aggregated values and ensure proper formatting
  return segments.map(segment => ({
    date: segment.date,
    spending: Number(segmentMap.get(segment.date)?.toFixed(2) || 0)
  }));
}

function getNumberOfSegments(timeFrame: string): number {
  switch (timeFrame) {
    case 'LAST_WEEK': return 7;  // Daily for week
    case 'LAST_MONTH': return 31; // Daily for month
    case 'LAST_QUARTER': return 13; // Weekly for quarter
    case 'LAST_YEAR': return 12; // Monthly for year
    default: return 7;
  }
}

function getSegmentInterval(timeFrame: string): { unit: 'day' | 'week' | 'month'; value: number } {
  switch (timeFrame) {
    case 'LAST_WEEK':
    case 'LAST_MONTH':
      return { unit: 'day', value: 1 };
    case 'LAST_QUARTER':
      return { unit: 'week', value: 1 };
    case 'LAST_YEAR':
      return { unit: 'month', value: 1 };
    default:
      return { unit: 'day', value: 1 };
  }
}

function addToDate(date: Date, interval: { unit: 'day' | 'week' | 'month'; value: number }): Date {
  const newDate = new Date(date);
  switch (interval.unit) {
    case 'day':
      newDate.setDate(date.getDate() + interval.value);
        break;
    case 'week':
      newDate.setDate(date.getDate() + (interval.value * 7));
      break;
    case 'month':
      newDate.setMonth(date.getMonth() + interval.value);
      break;
  }
  return newDate;
}

function getSegmentDate(date: Date, timeFrame: string): string {
  const newDate = new Date(date);
  switch (timeFrame) {
    case 'LAST_WEEK':
    case 'LAST_MONTH':
      return newDate.toISOString().split('T')[0];
    case 'LAST_QUARTER':
      // Set to start of week
      newDate.setDate(date.getDate() - date.getDay() + 1);
      return newDate.toISOString().split('T')[0];
    case 'LAST_YEAR':
      // Set to first of month
      newDate.setDate(1);
      return newDate.toISOString().split('T')[0];
    default:
      return newDate.toISOString().split('T')[0];
  }
}

/**
 * Helper function to calculate historical spending data
 */
async function calculateHistoricalSpending(userId: string) {
  const now = new Date();
  
  // Calculate date ranges
  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 7);
  
  const lastMonthStart = new Date(now);
  lastMonthStart.setMonth(now.getMonth() - 1);
  
  const lastQuarterStart = new Date(now);
  lastQuarterStart.setMonth(now.getMonth() - 3);
  
  const lastYearStart = new Date(now);
  lastYearStart.setFullYear(now.getFullYear() - 1);

  // Fetch transactions for the last year (which covers all periods)
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('amount, date')
    .eq('user_id', userId)
    .gt('amount', 0)
    .gte('date', lastYearStart.toISOString().split('T')[0])
    .lte('date', now.toISOString().split('T')[0])
    .order('date', { ascending: false });

  if (error) throw new Error('Error fetching historical transactions: ' + error.message);

  const spending = {
    lastWeek: { 
      start: lastWeekStart.toISOString().split('T')[0], 
      end: now.toISOString().split('T')[0], 
      totalSpending: 0,
      label: 'Last 7 Days'
    },
    lastMonth: { 
      start: lastMonthStart.toISOString().split('T')[0], 
      end: now.toISOString().split('T')[0], 
      totalSpending: 0,
      label: 'Last 30 Days'
    },
    lastQuarter: { 
      start: lastQuarterStart.toISOString().split('T')[0], 
      end: now.toISOString().split('T')[0], 
      totalSpending: 0,
      label: 'Last 90 Days'
    },
    lastYear: { 
      start: lastYearStart.toISOString().split('T')[0], 
      end: now.toISOString().split('T')[0], 
      totalSpending: 0,
      label: 'Last 365 Days'
    }
  };

  if (!transactions) return spending;

  transactions.forEach(tx => {
    const txDate = new Date(tx.date);
    const amount = Math.abs(tx.amount);

    if (txDate >= lastWeekStart) spending.lastWeek.totalSpending += amount;
    if (txDate >= lastMonthStart) spending.lastMonth.totalSpending += amount;
    if (txDate >= lastQuarterStart) spending.lastQuarter.totalSpending += amount;
    spending.lastYear.totalSpending += amount;
  });

  // Round all totals to 2 decimal places
  Object.values(spending).forEach(period => {
    period.totalSpending = Number(period.totalSpending.toFixed(2));
  });

  return spending;
}

/**
 * Get historical spending totals for different time periods
 * GET /api/plaid/historical-spending
 */
export const getHistoricalSpending = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found.'
      });
      return;
    }

    // Calculate date ranges
    const now = new Date();
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 7);
    
    const lastMonthStart = new Date(now);
    lastMonthStart.setMonth(now.getMonth() - 1);
    
    const lastQuarterStart = new Date(now);
    lastQuarterStart.setMonth(now.getMonth() - 3);
    
    const lastYearStart = new Date(now);
    lastYearStart.setFullYear(now.getFullYear() - 1);

    // Fetch transactions for the last year (which covers all periods)
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .gt('amount', 0) // Only get expenses (positive amounts)
      .gte('date', lastYearStart.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (txError) throw new Error('Error fetching transactions: ' + txError.message);

    // Initialize spending totals
    const spending = {
      lastWeek: 0,
      lastMonth: 0,
      lastQuarter: 0,
      lastYear: 0
    };

    // Calculate totals for each period
    transactions.forEach(tx => {
      const txDate = new Date(tx.date);
      const amount = Math.max(0, tx.amount); // Ensure positive amount

      // Add to relevant period totals
      if (txDate >= lastWeekStart) {
        spending.lastWeek += amount;
      }
      if (txDate >= lastMonthStart) {
        spending.lastMonth += amount;
      }
      if (txDate >= lastQuarterStart) {
        spending.lastQuarter += amount;
      }
      spending.lastYear += amount;
    });

    // Format response with rounded numbers
    const response = {
      success: true,
      data: {
        periods: {
          lastWeek: {
            start: lastWeekStart.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0],
            totalSpending: Number(spending.lastWeek.toFixed(2))
          },
          lastMonth: {
            start: lastMonthStart.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0],
            totalSpending: Number(spending.lastMonth.toFixed(2))
          },
          lastQuarter: {
            start: lastQuarterStart.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0],
            totalSpending: Number(spending.lastQuarter.toFixed(2))
          },
          lastYear: {
            start: lastYearStart.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0],
            totalSpending: Number(spending.lastYear.toFixed(2))
          }
        }
      }
    };

    res.status(200).json(response);
    return;
  } catch (error: any) {
    logger.error('Get Historical Spending Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve historical spending.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      data: {
        periods: {
          lastWeek: { start: '', end: '', totalSpending: 0 },
          lastMonth: { start: '', end: '', totalSpending: 0 },
          lastQuarter: { start: '', end: '', totalSpending: 0 },
          lastYear: { start: '', end: '', totalSpending: 0 }
        }
      }
    });
    return;
  }
};

/**
 * Get comprehensive financial insights
 * GET /api/plaid/financial-insights
 */
export const getFinancialInsights = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const timeFrame = (req.query.timeFrame as string) || 'MTD';

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found'
      });
      return;
    }

    // Validate timeFrame
    if (!['WTD', 'MTD', 'QTD', 'YTD'].includes(timeFrame)) {
      res.status(400).json({
        success: false,
        error: 'Invalid timeFrame. Must be one of: WTD, MTD, QTD, YTD'
      });
      return;
    }

    // Calculate date range based on selected time period
    const { startDate, endDate } = calculateDateRange(timeFrame);

    // Fetch all necessary data in parallel
    const [transactions, accountBalances, historicalSpending] = await Promise.all([
      // Get transactions for the period
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false }),
      
      // Get current account balances
      supabase
        .from('bank_accounts')
        .select('current_balance, available_balance')
        .eq('user_id', userId),

      // Calculate historical spending
      calculateHistoricalSpending(userId)
    ]);

    if (transactions.error) throw new Error('Error fetching transactions: ' + transactions.error.message);
    if (accountBalances.error) throw new Error('Error fetching account balances: ' + accountBalances.error.message);

    // Process transactions for category analysis
    const categoryMap = new Map<string, { amount: number; count: number }>();
    let totalSpending = 0;
    let totalInflow = 0;
    let totalOutflow = 0;
    let biggestExpense = 0;
    let transactionCount = 0;

    transactions.data.forEach(tx => {
      const amount = Math.abs(tx.amount);
      
      if (tx.amount > 0) { // Expense
        const category = standardizeCategory(tx.category || 'Other');
        
        if (!categoryMap.has(category)) {
          categoryMap.set(category, { amount: 0, count: 0 });
        }
        const categoryData = categoryMap.get(category)!;
        categoryData.amount += amount;
        categoryData.count += 1;
        
        totalSpending += amount;
        totalOutflow += amount;
        biggestExpense = Math.max(biggestExpense, amount);
        transactionCount += 1;
      } else { // Income
        totalInflow += amount;
      }
    });

    // Format categories with percentages
    const categories = Array.from(categoryMap.entries())
      .map(([name, data]) => ({
        name,
        amount: Number(data.amount.toFixed(2)),
        percentage: totalSpending > 0 
          ? Number(((data.amount / totalSpending) * 100).toFixed(1))
          : 0,
        transactionCount: data.count
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate top insights
    const topCategory = categories[0]?.name || 'No spending';
    const mostFrequentCategory = [...categories].sort((a, b) => b.transactionCount - a.transactionCount)[0]?.name || 'No transactions';
    const averageTransaction = transactionCount > 0 ? Number((totalSpending / transactionCount).toFixed(2)) : 0;

    // Calculate cash flow metrics
    const currentBalance = accountBalances.data.reduce((sum: number, account: any) => sum + (account.current_balance || 0), 0);
    const availableBalance = accountBalances.data.reduce((sum: number, account: any) => sum + (account.available_balance || 0), 0);
    
    // Calculate spending segments
    const segments = calculateSpendingSegments(
      transactions.data,
      timeFrame,
      startDate,
      endDate
    );

    // Calculate cash flow segments
    const cashFlowSegments = calculateCashFlowSegments(
      transactions.data,
      timeFrame,
      startDate,
      endDate
    );

    // Prepare the response
    const response = {
      success: true,
      data: {
        categoryAnalysis: {
          timeFrame,
          period: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          },
          totalSpending,
          categories,
          segments,
          topCategory,
          mostFrequentCategory,
          biggestExpense,
          averageTransaction,
          historicalSpending
        },
        cashFlowAnalysis: {
          totalInflow,
          totalOutflow,
          netFlow: totalInflow - totalOutflow,
          currentBalance,
          availableBalance,
          segments: cashFlowSegments,
          healthScore: calculateHealthScore(totalInflow, totalOutflow, currentBalance)
        }
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Financial Insights Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate financial insights',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Calculate cash flow segments
 */
function calculateCashFlowSegments(
  transactions: any[],
  timeFrame: string,
  startDate: Date,
  endDate: Date
): Array<SpendingSegment> {
  const segments: SpendingSegment[] = [];
  const segmentMap = new Map<string, number>();

  // Initialize segments based on timeFrame
  let currentDate = new Date(startDate);
  const numSegments = getNumberOfSegments(timeFrame);
  
  // Create segments with proper dates
  switch (timeFrame) {
    case 'LAST_WEEK':
    case 'LAST_MONTH':
      // Daily segments
      while (currentDate <= endDate && segments.length < numSegments) {
        const segmentDate = currentDate.toISOString().split('T')[0];
        segmentMap.set(segmentDate, 0);
        segments.push({ date: segmentDate, spending: 0 });
        currentDate.setDate(currentDate.getDate() + 1);
      }
      break;
    
    case 'LAST_QUARTER':
      // Weekly segments
      while (segments.length < numSegments) {
        const segmentDate = currentDate.toISOString().split('T')[0];
        segmentMap.set(segmentDate, 0);
        segments.push({ date: segmentDate, spending: 0 });
        currentDate.setDate(currentDate.getDate() + 7);
      }
      break;
    
    case 'LAST_YEAR':
      // Monthly segments
      while (segments.length < numSegments) {
        const segmentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
          .toISOString().split('T')[0];
        segmentMap.set(segmentDate, 0);
        segments.push({ date: segmentDate, spending: 0 });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      break;
  }

  // Aggregate transactions into segments
  transactions.forEach(tx => {
    if (tx.amount <= 0) return; // Skip non-expenses

    const txDate = new Date(tx.date);
    let segmentDate = txDate.toISOString().split('T')[0]; // Initialize with transaction date

    if (timeFrame === 'LAST_QUARTER') {
      // Find the closest weekly segment
      let matchingSegment = segments.find(segment => {
        const segmentStart = new Date(segment.date);
        const segmentEnd = new Date(segmentStart);
        segmentEnd.setDate(segmentEnd.getDate() + 7);
        return txDate >= segmentStart && txDate < segmentEnd;
      });

      if (!matchingSegment) return;
      segmentDate = matchingSegment.date;
    } else if (timeFrame === 'LAST_YEAR') {
      // First day of the month
      segmentDate = new Date(txDate.getFullYear(), txDate.getMonth(), 1)
        .toISOString().split('T')[0];
    }

    if (segmentMap.has(segmentDate)) {
      segmentMap.set(segmentDate, (segmentMap.get(segmentDate) || 0) + Math.abs(tx.amount));
    }
  });

  // Update segments with aggregated values and ensure proper formatting
  return segments.map(segment => ({
    date: segment.date,
    spending: Number(segmentMap.get(segment.date)?.toFixed(2) || 0)
  }));
}

/**
 * Calculate a simple financial health score (0-100)
 */
function calculateHealthScore(totalInflow: number, totalOutflow: number, currentBalance: number): number {
  let score = 50; // Start with a baseline score

  // Factor 1: Income vs Expenses ratio (up to 30 points)
  if (totalOutflow > 0) {
    const ratio = totalInflow / totalOutflow;
    score += Math.min(30, Math.max(-30, (ratio - 1) * 30));
  }

  // Factor 2: Current Balance health (up to 20 points)
  if (totalOutflow > 0) {
    const monthsOfExpenses = currentBalance / (totalOutflow / 30); // Rough monthly expense rate
    score += Math.min(20, Math.max(0, monthsOfExpenses * 5)); // 4 months of expenses = full points
  }

  // Ensure score stays within 0-100 range
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Get recurring expenses analysis
 * GET /api/plaid/recurring-expenses?timeFrame=LAST_WEEK|LAST_MONTH|LAST_QUARTER|LAST_YEAR
 */
export const getRecurringExpenses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const timeFrame = (req.query.timeFrame as string) || 'LAST_MONTH';

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not found.'
      });
      return;
    }

    // Validate timeFrame
    if (!['LAST_WEEK', 'LAST_MONTH', 'LAST_QUARTER', 'LAST_YEAR'].includes(timeFrame)) {
      res.status(400).json({
        success: false,
        error: 'Invalid timeFrame. Must be one of: LAST_WEEK, LAST_MONTH, LAST_QUARTER, LAST_YEAR'
      });
      return;
    }

    // Calculate date range based on selected time period
    const { startDate, endDate } = calculateDateRange(timeFrame);

    logger.debug('Date range for recurring expenses analysis:', {
      timeFrame,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // Fetch transactions for the specified period
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw new Error('Error fetching transactions: ' + error.message);

    // Group transactions by merchant and amount
    const merchantGroups = new Map<string, any[]>();
    transactions.forEach(tx => {
      const key = `${tx.merchant_name || tx.description}_${tx.amount}`;
      if (!merchantGroups.has(key)) {
        merchantGroups.set(key, []);
      }
      merchantGroups.get(key)?.push(tx);
    });

    // Analyze recurring patterns
    const recurringExpenses = [];
    for (const [key, txs] of merchantGroups) {
      if (txs.length < 2) continue; // Skip one-time transactions

      // Sort transactions by date
      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate average days between transactions
      const intervals = [];
      for (let i = 1; i < txs.length; i++) {
        const days = Math.round((new Date(txs[i].date).getTime() - new Date(txs[i-1].date).getTime()) / (1000 * 60 * 60 * 24));
        intervals.push(days);
      }

      const avgInterval = intervals.reduce((sum, days) => sum + days, 0) / intervals.length;
      const stdDev = Math.sqrt(intervals.reduce((sum, days) => sum + Math.pow(days - avgInterval, 2), 0) / intervals.length);

      // Determine if it's a recurring expense based on the time frame
      const isRecurring = timeFrame === 'LAST_WEEK' ? stdDev <= 1 :
                         timeFrame === 'LAST_MONTH' ? stdDev <= 3 :
                         timeFrame === 'LAST_QUARTER' ? stdDev <= 5 :
                         stdDev <= 10;

      if (isRecurring) {
        // Determine frequency based on time frame
        let frequency: FrequencyType;
        if (timeFrame === 'LAST_WEEK') {
          frequency = avgInterval <= 2 ? 'WEEKLY' : 'BI_WEEKLY';
        } else if (timeFrame === 'LAST_MONTH') {
          frequency = avgInterval <= 7 ? 'WEEKLY' : 
                     avgInterval <= 14 ? 'BI_WEEKLY' : 'MONTHLY';
        } else if (timeFrame === 'LAST_QUARTER') {
          frequency = avgInterval <= 7 ? 'WEEKLY' :
                     avgInterval <= 14 ? 'BI_WEEKLY' :
                     avgInterval <= 31 ? 'MONTHLY' : 'QUARTERLY';
        } else {
          frequency = avgInterval <= 7 ? 'WEEKLY' :
                     avgInterval <= 14 ? 'BI_WEEKLY' :
                     avgInterval <= 31 ? 'MONTHLY' :
                     avgInterval <= 92 ? 'QUARTERLY' : 'ANNUAL';
        }

        // Calculate next expected date
        const lastDate = new Date(txs[txs.length - 1].date);
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + Math.round(avgInterval));

        // Check for amount changes
        const amounts = txs.map(tx => tx.amount);
        const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
        const recentAmount = amounts[amounts.length - 1];
        const amountChange = Math.abs((recentAmount - avgAmount) / avgAmount) * 100;
        const hasUnusualChange = amountChange > 10;

        recurringExpenses.push({
          merchant: txs[0].merchant_name || txs[0].description,
          frequency,
          averageAmount: Number(avgAmount.toFixed(2)),
          recentAmount: Number(recentAmount.toFixed(2)),
          hasUnusualChange,
          amountChangePercent: Number(amountChange.toFixed(1)),
          lastDate: txs[txs.length - 1].date,
          nextExpectedDate: nextDate.toISOString().split('T')[0],
          transactionCount: txs.length,
          category: txs[0].category,
          confidence: Number((100 - (stdDev * 5)).toFixed(1)),
          transactions: txs.map(tx => ({
            date: tx.date,
            amount: tx.amount,
            description: tx.description
          }))
        });
      }
    }

    // Sort by frequency and amount
    const freqOrder: Record<FrequencyType, number> = {
      WEEKLY: 0,
      BI_WEEKLY: 1,
      MONTHLY: 2,
      QUARTERLY: 3,
      ANNUAL: 4
    };

    recurringExpenses.sort((a, b) => {
      const freqA = freqOrder[a.frequency];
      const freqB = freqOrder[b.frequency];
      if (freqA !== freqB) {
        return freqA - freqB;
      }
      return b.averageAmount - a.averageAmount;
    });

    // Group by frequency
    const groupedByFrequency = {
      weekly: recurringExpenses.filter(exp => exp.frequency === 'WEEKLY'),
      biWeekly: recurringExpenses.filter(exp => exp.frequency === 'BI_WEEKLY'),
      monthly: recurringExpenses.filter(exp => exp.frequency === 'MONTHLY'),
      quarterly: recurringExpenses.filter(exp => exp.frequency === 'QUARTERLY'),
      annual: recurringExpenses.filter(exp => exp.frequency === 'ANNUAL')
    };

    // Calculate totals
    const calculateTotal = (expenses: any[]) => 
      expenses.reduce((sum, exp) => sum + exp.averageAmount, 0);

    const totals = {
      weekly: Number(calculateTotal(groupedByFrequency.weekly).toFixed(2)),
      biWeekly: Number(calculateTotal(groupedByFrequency.biWeekly).toFixed(2)),
      monthly: Number(calculateTotal(groupedByFrequency.monthly).toFixed(2)),
      quarterly: Number(calculateTotal(groupedByFrequency.quarterly).toFixed(2)),
      annual: Number(calculateTotal(groupedByFrequency.annual).toFixed(2))
    };

    // Calculate total monthly commitment based on frequency
    const totalMonthlyCommitment = Number((
      totals.monthly +
      (totals.weekly * 4) +
      (totals.biWeekly * 2) +
      (totals.quarterly / 3) +
      (totals.annual / 12)
    ).toFixed(2));

    res.status(200).json({
      success: true,
      data: {
        timeFrame,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalRecurringExpenses: recurringExpenses.length,
          totalMonthlyCommitment,
          unusualChanges: recurringExpenses.filter(exp => exp.hasUnusualChange).length
        },
        frequencyGroups: groupedByFrequency,
        totals,
        upcomingExpenses: recurringExpenses
          .filter(exp => new Date(exp.nextExpectedDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
          .sort((a, b) => new Date(a.nextExpectedDate).getTime() - new Date(b.nextExpectedDate).getTime())
      }
    });

  } catch (error: any) {
    logger.error('Recurring Expenses Analysis Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze recurring expenses',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


