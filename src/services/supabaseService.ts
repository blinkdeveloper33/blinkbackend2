// src/services/supabaseService.ts ⭐️⭐️⭐️

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config';
import { Database } from '../types/types';

/**
 * Initialize the Supabase client using the service role key for admin access.
 */
const supabase: SupabaseClient<Database> = createClient<Database>(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY
);

// Prevent modifications to the client after creation
Object.freeze(supabase);

export default supabase;
