import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import config from '../config';

// Validate required configuration
if (!config.PLAID_CLIENT_ID || !config.PLAID_SECRET) {
  throw new Error('Missing required Plaid credentials');
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[config.PLAID_ENV as keyof typeof PlaidEnvironments] 
    || PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': config.PLAID_CLIENT_ID,
      'PLAID-SECRET': config.PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
      'Content-Type': 'application/json'
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Prevent modifications to the client after creation
Object.freeze(plaidClient);

export default plaidClient;