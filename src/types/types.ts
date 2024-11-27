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
  email_verified: boolean; // New field
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
}

/**
 * Transaction Interface
 */
export interface Transaction {
  id: string;
  bank_account_id: string;
  transaction_id: string;
  amount: number;
  date: string; // 'YYYY-MM-DD'
  description: string;
  original_description?: string | null;
  category: string;
  category_detailed?: string | null; // Now allowed to be null
  merchant_name?: string | null;
  pending?: boolean;
  account_id: string;
  created_at: string;
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
      user_otps: {
        Row: UserOTP;
        Insert: Partial<UserOTP>;
        Update: Partial<UserOTP>;
      };
      // Define other tables here
    };
  };
}
