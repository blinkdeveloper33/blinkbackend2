// src/controllers/plaidController.ts

import { 
  Products, 
  CountryCode,
  Transaction as PlaidTransaction,
  TransactionsSyncRequest,
  TransactionsSyncResponse
} from 'plaid';
import { Request, Response, NextFunction } from 'express';
import supabase from '../services/supabaseService';
import plaidClient from '../services/plaidService';
import logger from '../services/logger';
import { Transaction } from '../types/types';
import config from '../config';

/**
 * Generates a Sandbox public token using Plaid's /sandbox/public_token/create endpoint.
 */
export const generateSandboxPublicToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { institution_id, initial_products, webhook } = req.body;

    const response = await plaidClient.sandboxPublicTokenCreate({
      institution_id: institution_id || 'ins_109508', // Default to a Plaid sandbox institution
      initial_products: initial_products || ['transactions'], // Default to "transactions" product
      options: {
        webhook: webhook || config.PLAID_WEBHOOK_URL, // Use your configured webhook URL
      },
    });

    res.status(200).json({
      public_token: response.data.public_token,
      request_id: response.data.request_id,
    });
  } catch (error: any) {
    // Enhanced error logging
    if (error.response && error.response.data) {
      logger.error('Error generating sandbox public token:', JSON.stringify(error.response.data));
      res.status(500).json({ error: 'Failed to generate sandbox public token', details: error.response.data });
    } else {
      logger.error('Error generating sandbox public token:', error.message);
      res.status(500).json({ error: 'Failed to generate sandbox public token', details: error.message });
    }
  }
};

/**
 * Creates a Plaid Link Token
 */
export const createLinkToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    const request = {
      user: { client_user_id: userId },
      client_name: 'Your App Name',
      products: ['transactions' as Products],
      country_codes: ['US' as CountryCode],
      language: 'en',
      webhook: config.PLAID_WEBHOOK_URL,
    };

    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    res.json({ linkToken: createTokenResponse.data.link_token });
  } catch (error: any) {
    // Enhanced error logging
    if (error.response && error.response.data) {
      logger.error('Error creating link token:', JSON.stringify(error.response.data));
      res.status(500).json({ error: 'Failed to create link token', details: error.response.data });
    } else {
      logger.error('Error creating link token:', error.message);
      res.status(500).json({ error: 'Failed to create link token', details: error.message });
    }
  }
};

/**
 * Exchanges a public token for an access token
 */
export const exchangePublicToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicToken, userId } = req.body;

    // Exchange public token for access token and item ID
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get institution and account details
    const authResponse = await plaidClient.authGet({ access_token: accessToken });
    const accounts = authResponse.data.accounts;

    // Prepare bank accounts data for upsert
    const bankAccountsToInsert = accounts.map(account => ({
      user_id: userId,
      plaid_access_token: accessToken,
      plaid_item_id: itemId,
      account_id: account.account_id,
      account_name: account.name,
      account_type: account.type,
      account_subtype: account.subtype,
      account_mask: account.mask,
      cursor: null, // Initialize cursor as null
      created_at: new Date().toISOString(),
    }));

    // Use upsert to handle duplicate account_id
    const { data, error: upsertError } = await supabase
      .from('bank_accounts')
      .upsert(bankAccountsToInsert, { onConflict: 'account_id' })
      .select(); // Fetch the upserted rows

    if (upsertError) throw upsertError;

    // Map the upserted bank accounts to return the correct UUID `id`
    const responseAccounts = data.map((account: any) => ({
      id: account.id, // UUID from `bank_accounts` table
      account_id: account.account_id, // Plaid's account_id
      name: account.account_name,
      type: account.account_type,
      subtype: account.account_subtype
    }));

    res.json({ 
      success: true,
      message: 'Bank accounts connected successfully',
      accounts: responseAccounts
    });
  } catch (error: any) {
    // Enhanced error logging with proper message formatting
    logger.error(`Error exchanging public token: ${JSON.stringify(error.response?.data || error.message)}`);
    res.status(500).json({ error: 'Failed to exchange public token', details: error.response?.data || error.message });
  }
};

/**
 * Helper function to synchronize transactions for a user
 */
export const syncTransactionsForUser = async (userId: string): Promise<{ added: number, modified: number, removed: number }> => {
  try {
    const { data: bankAccounts, error: bankError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId);

    if (bankError) {
      throw new Error('Error fetching bank accounts: ' + bankError.message);
    }

    if (!bankAccounts || bankAccounts.length === 0) {
      throw new Error('No bank accounts found for user');
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    for (const account of bankAccounts) {
      let hasMore = true;
      let currentCursor = account.cursor || null;
      let iterations = 0;
      const maxIterations = 5; // Prevent infinite loops

      while (hasMore && iterations < maxIterations) {
        const syncRequest: TransactionsSyncRequest = {
          access_token: account.plaid_access_token,
          cursor: currentCursor || undefined,
          options: {
            include_personal_finance_category: true,
            include_original_description: true
          }
        };

        try {
          // Await the transactionsSync call and extract data
          const response = await plaidClient.transactionsSync(syncRequest);
          const syncResponse: TransactionsSyncResponse = response.data;

          const { added, modified, removed, next_cursor, has_more } = syncResponse;

          const transactionsToUpsert: Partial<Transaction>[] = [...added, ...modified].map((txn: PlaidTransaction) => ({
            transaction_id: txn.transaction_id, // Ensure this is unique
            bank_account_id: account.id,
            account_id: txn.account_id, // Linking transaction to account
            amount: txn.amount,
            date: txn.date,
            description: txn.name,
            original_description: txn.original_description || '', // Ensure string
            category: txn.category ? txn.category[0] : 'Uncategorized',
            category_detailed: txn.category ? txn.category.join(', ') : null, // Now allowed to be null
            merchant_name: txn.merchant_name || null,
            pending: txn.pending || false,
            created_at: new Date().toISOString()
          }));

          if (transactionsToUpsert.length > 0) {
            const { error: upsertError } = await supabase
              .from('transactions')
              .upsert(transactionsToUpsert, { 
                onConflict: 'transaction_id',
                ignoreDuplicates: false
              });

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
          iterations++;
        } catch (syncError: any) {
          logger.error(`Error during transaction sync for account ${account.id}:`, syncError.message);
          throw syncError;
        }
      }

      // Update the cursor in the bank_accounts table
      if (currentCursor) {
        const { error: updateError } = await supabase
          .from('bank_accounts')
          .update({ cursor: currentCursor })
          .eq('id', account.id);

        if (updateError) throw new Error('Error updating cursor: ' + updateError.message);
      }
    }

    return {
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved
    };

  } catch (error: any) {
    logger.error('Sync Error:', error.message);
    throw error;
  }
};

/**
 * Synchronizes transactions from Plaid (Express Handler)
 */
export const transactionsSyncHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { userId } = req.body;

  try {
    const stats = await syncTransactionsForUser(userId);

    res.json({
      success: true,
      stats: {
        added: stats.added,
        modified: stats.modified,
        removed: stats.removed
      }
    });
  } catch (error: any) {
    logger.error('Sync Error:', error.message);
    res.status(500).json({ error: 'Failed to sync transactions', details: error.message });
  }
};

/**
 * Retrieves transactions with pagination and date filtering
 */
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, bankAccountId, startDate, endDate, page = 1, limit = 50 } = req.body;

    // Log the parameters for debugging
    logger.info(`Fetching transactions for User ID: ${userId}, Bank Account ID: ${bankAccountId}, Date Range: ${startDate} to ${endDate}, Page: ${page}, Limit: ${limit}`);

    const offset = (page - 1) * limit;

    const { data: transactions, error, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('bank_account_id', bankAccountId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      transactions,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    // Corrected error logging by concatenating the message
    logger.error(`Error fetching transactions: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};
