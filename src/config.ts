// src/config.ts

import dotenv from 'dotenv';

dotenv.config();

interface Config {
  PORT: number;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  PLAID_WEBHOOK_URL: string;
  PLAID_WEBHOOK_SECRET: string;
  LOG_LEVEL: string;
}

const config: Config = {
  PORT: parseInt(process.env.PORT as string, 10) || 5000,
  SUPABASE_URL: process.env.SUPABASE_URL as string,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID as string,
  PLAID_SECRET: process.env.PLAID_SECRET as string,
  PLAID_ENV: process.env.PLAID_ENV as string || 'sandbox', // Default to 'sandbox' if not set
  JWT_SECRET: process.env.JWT_SECRET as string,
  CORS_ORIGIN: process.env.CORS_ORIGIN as string || 'http://localhost:3000',
  PLAID_WEBHOOK_URL: process.env.PLAID_WEBHOOK_URL as string || 'https://your-webhook-url.com',
  PLAID_WEBHOOK_SECRET: process.env.PLAID_WEBHOOK_SECRET as string || 'your_webhook_secret',
  LOG_LEVEL: process.env.LOG_LEVEL as string || 'info',
};

// Debugging: Log loaded environment variables (Avoid logging sensitive data in production)
if (process.env.NODE_ENV !== 'production') {
  console.log('Loaded Environment Variables:', {
    SUPABASE_URL: config.SUPABASE_URL ? '✔️' : '❌',
    SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY ? '✔️' : '❌',
    PLAID_CLIENT_ID: config.PLAID_CLIENT_ID ? '✔️' : '❌',
    PLAID_SECRET: config.PLAID_SECRET ? '✔️' : '❌',
    PLAID_ENV: config.PLAID_ENV ? '✔️' : '❌',
    JWT_SECRET: config.JWT_SECRET ? '✔️' : '❌',
    CORS_ORIGIN: config.CORS_ORIGIN ? '✔️' : '❌',
    PLAID_WEBHOOK_URL: config.PLAID_WEBHOOK_URL ? '✔️' : '❌',
    PLAID_WEBHOOK_SECRET: config.PLAID_WEBHOOK_SECRET ? '✔️' : '❌',
    LOG_LEVEL: config.LOG_LEVEL ? '✔️' : '❌',
  });
}

// Validate all required environment variables
for (const [key, value] of Object.entries(config)) {
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
}

export default config;
