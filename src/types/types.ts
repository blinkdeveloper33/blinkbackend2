// src/types/types.ts ⭐️⭐️⭐️

import { 
  AccountBase, 
  AccountBalance, 
  Transaction as PlaidApiTransaction, 
  RemovedTransaction, 
  AccountType, 
  AccountSubtype, 
  TransactionsSyncRequest as PlaidTransactionsSyncRequest 
} from 'plaid';

/**
 * User Interface
 */
export interface User {
  id: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  state: string;
  zipcode: string;
  email_verified: boolean; // Indicates if the user's email is verified
  cursor?: string; // For transactions sync per user (if needed)
  created_at?: string;
}

/**
 * UserOTP Interface
 */
export interface UserOTP {
  id: string;
  user_id: string;
  otp_code: string;
  expires_at: string; // ISO string
  created_at: string;
  is_verified: boolean;
}

/**
 * BankAccount Interface
 */
export interface BankAccount {
  id: string;
  user_id: string;
  plaid_access_token: string;
  plaid_item_id: string;
  account_id: string;
  account_name: string;
  account_type: string;
  account_subtype: string;
  account_mask: string;
  cursor?: string; // For transactions sync per account
  created_at?: string;
  available_balance: number;
  current_balance: number;
  currency: string;
}

/**
 * Transaction Interface
 */
export interface Transaction {
  id: string;
  user_id: string; // Associates the transaction with a user
  bank_account_id: string;
  transaction_id: string;
  amount: number;
  date: string; // 'YYYY-MM-DD'
  description: string;
  original_description?: string | null;
  category: string;
  category_detailed?: string | null;
  merchant_name?: string | null;
  pending?: boolean;
  account_id: string;
  created_at: string;
}

/**
 * RegistrationSession Interface
 */
export interface RegistrationSession {
  email: string;
  otp_code: string;
  expires_at: string; // ISO string
  is_verified: boolean;
  created_at: string;
}

/**
 * BlinkAdvance Interface
 */
export interface BlinkAdvance {
  id: string;
  user_id: string;
  bank_account_id: string;
  requested_amount: number;
  transfer_speed: 'Instant' | 'Normal';
  fee: number;
  repay_date: string; // 'YYYY-MM-DD'
  status: 'requested' | 'approved' | 'funded' | 'repaid' | 'canceled';
  created_at: string;
  updated_at?: string | null;
}

/**
 * BankAccountSummary Interface
 * Used for selecting specific fields from the bank_accounts table
 */
export interface BankAccountSummary {
  id: string;
  account_name: string;
  account_type: string;
  currency: string;
}

/**
 * Database Interface for Supabase
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Partial<User>;
        Update: Partial<User>;
      };
      user_otps: {
        Row: UserOTP;
        Insert: Partial<UserOTP>;
        Update: Partial<UserOTP>;
      };
      bank_accounts: {
        Row: BankAccount;
        Insert: Partial<BankAccount>;
        Update: Partial<BankAccount>;
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction>;
        Update: Partial<Transaction>;
      };
      registration_sessions: {
        Row: RegistrationSession;
        Insert: Partial<RegistrationSession>;
        Update: Partial<RegistrationSession>;
      };
      sessions: { // Added if using sessions
        Row: {
          id: string;
          user_id: string;
          token: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Partial<{
          id: string;
          user_id: string;
          token: string;
          expires_at: string;
          created_at: string;
        }>;
        Update: Partial<{
          user_id: string;
          token: string;
          expires_at: string;
          created_at: string;
        }>;
      };
      blink_advances: { // Newly added BlinkAdvance table
        Row: BlinkAdvance;
        Insert: Partial<BlinkAdvance>;
        Update: Partial<BlinkAdvance>;
      };
      // Define other tables here
    };
  };
}

/**
 * CustomAccountBalance Interface
 */
export interface CustomAccountBalance extends AccountBalance {
  available: number | null;
  current: number | null;
  iso_currency_code: string | null;
  limit: number | null;
  unofficial_currency_code: string | null;
}

/**
 * PlaidAccount Interface
 */
export interface PlaidAccount extends Omit<AccountBase, 'balances' | 'type' | 'subtype'> {
  account_id: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype | null;
  mask: string;
  balances: CustomAccountBalance;
}

/**
 * TransactionsSyncRequest Interface
 */
export interface TransactionsSyncRequest extends PlaidTransactionsSyncRequest {
  options: {
    include_personal_finance_category: boolean;
    include_original_description: boolean;
  };
}

/**
 * CustomTransactionsSyncResponse Interface
 */
export interface CustomTransactionsSyncResponse {
  added: PlaidApiTransaction[];
  modified: PlaidApiTransaction[];
  removed: RemovedTransaction[];
  next_cursor: string;
  has_more: boolean;
}
