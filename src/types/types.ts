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
  amount: number;
  transfer_speed: 'instant' | 'standard';
  fee_amount: number;
  total_repayment_amount: number;
  repayment_date: string;
  repayment_term_days: 7 | 15;
  fee_discount_applied: boolean;
  discount_percentage: number | null;
  status: 'pending' | 'processing' | 'active' | 'completed' | 'overdue' | 'cancelled';
  processed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  original_fee_amount: number;
  funds_disbursed: boolean;
  disbursement_date: string | null;
  repayment_received: boolean;
  repayment_received_date: string | null;
  metadata: Record<string, any> | null;
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
 * BankAccountDetailed Interface
 */
export interface BankAccountDetailed extends BankAccountSummary {
  account_subtype: string;
  account_mask: string;
  available_balance: number;
  current_balance: number;
  created_at: string;
  cursor: string | null;
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

// Transfer Authorization Types
export interface TransferAuthorizationUser {
  legal_name: string;
  phone_number?: string;
  email_address?: string;
  address?: {
    street?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface TransferAuthorizationRequest {
  access_token: string;
  account_id: string;
  type: 'debit' | 'credit';
  network: 'ach' | 'same-day-ach' | 'rtp' | 'wire';
  amount: string;
  ach_class?: 'ccd' | 'ppd' | 'tel' | 'web';
  user: TransferAuthorizationUser;
  device?: {
    ip_address?: string;
    user_agent?: string;
  };
  wire_details?: {
    message_to_beneficiary?: string;
  };
  iso_currency_code?: string;
  idempotency_key?: string;
  user_present?: boolean;
}

export interface TransferAuthorizationDecisionRationale {
  code: 'NSF' | 'RISK' | 'TRANSFER_LIMIT_REACHED' | 'MANUALLY_VERIFIED_ITEM' | 'ITEM_LOGIN_REQUIRED' | 'PAYMENT_PROFILE_LOGIN_REQUIRED' | 'ERROR' | 'MIGRATED_ACCOUNT_ITEM' | null;
  description: string;
}

export interface TransferAuthorization {
  id: string;
  created: string;
  decision: 'approved' | 'declined' | 'user_action_required';
  decision_rationale: TransferAuthorizationDecisionRationale | null;
  proposed_transfer: {
    ach_class?: string;
    account_id: string;
    funding_account_id?: string;
    type: 'debit' | 'credit';
    user: TransferAuthorizationUser;
    amount: string;
    network: string;
    iso_currency_code: string;
    originator_client_id?: string;
  };
}

export interface TransferCreateRequest {
  access_token: string;
  account_id: string;
  authorization_id: string;
  amount?: string;
  description: string;
  metadata?: Record<string, string>;
  test_clock_id?: string;
  facilitator_fee?: string;
}

export interface Transfer {
  id: string;
  authorization_id: string;
  ach_class: 'ccd' | 'ppd' | 'tel' | 'web';
  account_id: string;
  funding_account_id: string | null;
  ledger_id: string | null;
  type: 'debit' | 'credit';
  user: TransferAuthorizationUser;
  amount: string;
  description: string;
  created: string;
  status: 'pending' | 'posted' | 'settled' | 'funds_available' | 'cancelled' | 'failed' | 'returned';
  sweep_status: 'unswept' | 'swept' | 'swept_settled' | 'return_swept' | 'funds_available' | null;
  network: 'ach' | 'same-day-ach' | 'rtp' | 'wire';
  wire_details?: {
    message_to_beneficiary?: string;
  } | null;
  cancellable: boolean;
  failure_reason: {
    failure_code: string | null;
    description: string;
  } | null;
  metadata?: Record<string, string>;
  iso_currency_code: string;
  standard_return_window: string | null;
  unauthorized_return_window: string | null;
  expected_settlement_date: string | null;
  originator_client_id: string | null;
  refunds: Array<{
    id: string;
    transfer_id: string;
    amount: string;
    status: 'pending' | 'posted' | 'cancelled' | 'failed' | 'settled' | 'returned';
    failure_reason: {
      failure_code: string | null;
      description: string;
    } | null;
    ledger_id: string | null;
    created: string;
  }>;
  recurring_transfer_id: string | null;
  expected_sweep_settlement_schedule?: Array<{
    sweep_settlement_date: string;
    swept_settled_amount: string;
  }>;
  facilitator_fee?: string;
  network_trace_id: string | null;
}
