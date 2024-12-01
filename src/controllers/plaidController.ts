// src/controllers/plaidController.ts

import { 
  Configuration, 
  CountryCode, 
  PlaidApi, 
  PlaidEnvironments, 
  Products,
  SandboxPublicTokenCreateRequest,
  AccountBase,
  AccountBalance,
  Transaction as PlaidApiTransaction,
  TransactionsSyncRequest as PlaidTransactionsSyncRequest,
  TransactionsSyncResponse as PlaidApiTransactionsSyncResponse,
  RemovedTransaction,
  AccountType,
  AccountSubtype
} from 'plaid';
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import logger from '../services/logger';
import config from '../config';

// Initialize clients
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
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

// Type definitions
interface CustomAccountBalance extends AccountBalance {
  available: number | null;
  current: number | null;
  iso_currency_code: string | null;
  limit: number | null;
  unofficial_currency_code: string | null;
}

interface PlaidAccount extends Omit<AccountBase, 'balances' | 'type' | 'subtype'> {
  account_id: string;
  name: string;
  type: AccountType; // Ensure compatibility by using AccountType
  subtype: AccountSubtype | null; // Ensure compatibility by using AccountSubtype
  mask: string;
  balances: CustomAccountBalance; // Extend balances with CustomAccountBalance
}

interface Transaction {
  transaction_id: string;
  bank_account_id: string;
  account_id: string;
  amount: number;
  date: string;
  description: string;
  original_description: string | null;
  category: string;
  category_detailed: string | null;
  merchant_name: string | null;
  pending: boolean;
  created_at: string;
}

interface TransactionsSyncRequest extends PlaidTransactionsSyncRequest {
  options: {
    include_personal_finance_category: boolean;
    include_original_description: boolean;
  };
}

interface CustomTransactionsSyncResponse {
  added: PlaidApiTransaction[];
  modified: PlaidApiTransaction[];
  removed: RemovedTransaction[];
  next_cursor: string;
  has_more: boolean;
}

// Generate a sandbox public token
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

// Create a link token
export const createLinkToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    const request = {
      user: { client_user_id: userId },
      client_name: config.PLAID_CLIENT_ID || 'Your App Name',
      products: ['transactions' as Products],
      country_codes: ['US' as CountryCode],
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

// Exchange a public token for an access token
export const exchangePublicToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicToken, userId } = req.body;
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const bankAccountsToInsert = accountsResponse.data.accounts.map((account: AccountBase) => ({
      user_id: userId,
      plaid_access_token: accessToken,
      plaid_item_id: itemId,
      account_id: account.account_id,
      account_name: account.name,
      account_type: account.type,
      account_subtype: account.subtype || 'unknown',
      account_mask: account.mask || '',
      cursor: null,
      created_at: new Date().toISOString(),
      available_balance: account.balances.available || 0,
      current_balance: account.balances.current || 0,
      currency: account.balances.iso_currency_code || 'USD',
    }));
    const { data, error: upsertError } = await supabase
      .from('bank_accounts')
      .upsert(bankAccountsToInsert, { onConflict: 'account_id' })
      .select();
    if (upsertError) throw upsertError;
    const responseAccounts = data.map((account: any) => ({
      id: account.id,
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
      accounts: responseAccounts
    });
  } catch (error: any) {
    logger.error(`Error exchanging public token: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to exchange public token',
      details: error.response?.data || error.message
    });
  }
};

// Sync transactions for a user
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
    for (const account of bankAccounts) {
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
    }
    return { added: totalAdded, modified: totalModified, removed: totalRemoved };
  } catch (error: any) {
    logger.error('Sync Error:', error.message);
    throw error;
  }
};

// Transactions sync handler
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

// Fetch and store account balances
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
        available_balance: plaidAccount.balances.available || 0,
        current_balance: plaidAccount.balances.current || 0,
        currency: plaidAccount.balances.iso_currency_code || 'USD',
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

// Sync balances handler
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

// Get transactions for a user
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, bankAccountId, startDate, endDate, page = 1, limit = 50 } = req.body;
    const offset = (page - 1) * limit;
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('bank_account_id', bankAccountId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);
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
