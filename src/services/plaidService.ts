// src/services/plaidService.ts ⭐️⭐️⭐️

import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import config from '../config';

/**
 * Initialize the Plaid client
 */
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

export default plaidClient;
