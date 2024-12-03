// src/controllers/plaidController.ts ⭐️⭐️⭐️

import { 
  Configuration, 
  CountryCode, 
  PlaidApi, 
  PlaidEnvironments, 
  Products,
  SandboxPublicTokenCreateRequest,
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
 * Generate a sandbox public token
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const generateSandboxPublicToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { institution_id, initial_products, webhook } = req.body;
    const tokenRequest: SandboxPublicTokenCreateRequest = {
      institution_id: institution_id || 'ins_109508',
      initial_products: initial_products || [Products.Transactions],
      options: { webhook: webhook || config.PLAID_WEBHOOK_URL }
    };
    const response = await plaidClient.sandboxPublicTokenCreate(tokenRequest);
    res.status(200).json({
      success: true,
      public_token: response.data.public_token,
      request_id: response.data.request_id
    });
  } catch (error: any) {
    logger.error('Error generating sandbox public token:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate sandbox public token',
      details: error.response?.data || error.message
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
      client_name: config.CLIENT_NAME || 'Blink Finances',
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
export const getRecentTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        id,
        bank_account_id,
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
        user_id
      `)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(5);

    if (error) throw new Error('Error fetching recent transactions: ' + error.message);

    // Ensure all fields are properly formatted
    const formattedTransactions = transactions.map((t: any) => ({
      ...t,
      amount: Number(t.amount),
      date: t.date || null,
      description: t.description || '',
      original_description: t.original_description || '',
      category: t.category || '',
      category_detailed: t.category_detailed || '',
      merchant_name: t.merchant_name || '',
      pending: Boolean(t.pending),
      created_at: t.created_at || null,
    }));

    res.status(200).json({
      success: true,
      transactions: formattedTransactions,
    });
  } catch (error: any) {
    logger.error('Get Recent Transactions Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve recent transactions', 
      details: error.message 
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
