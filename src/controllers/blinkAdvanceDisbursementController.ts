import { Request, Response } from 'express';
import { Configuration, PlaidApi, PlaidEnvironments, TransferAuthorizationCreateRequest, TransferCreateRequest, TransferType, TransferNetwork, ACHClass } from 'plaid';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import config from '../config';

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments[config.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': config.PLAID_CLIENT_ID,
      'PLAID-SECRET': config.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

export const initiateDisbursement = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    // Fetch advance data
    const { data: advance, error: advanceError } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('id', id)
      .single();

    if (advanceError || !advance) {
      logger.error(`Error fetching advance: ${advanceError?.message || 'Advance not found'}`);
      res.status(404).json({ success: false, error: 'Advance not found' });
      return;
    }

    if (advance.status !== 'approved') {
      res.status(400).json({ success: false, error: 'Advance is not in approved status' });
      return;
    }

    // Determine transfer network
    const transferNetwork: TransferNetwork = advance.transfer_speed === 'Instant' ? TransferNetwork.Rtp : TransferNetwork.Ach;

    // Create transfer authorization
    const authorizationRequest: TransferAuthorizationCreateRequest = {
      access_token: advance.plaid_access_token,
      account_id: advance.account_id,
      type: TransferType.Credit,
      network: transferNetwork,
      amount: advance.requested_amount.toString(),
      ach_class: ACHClass.Ppd,
      user: {
        legal_name: `${advance.first_name} ${advance.last_name}`,
      },
    };

    const authorizationResponse = await plaidClient.transferAuthorizationCreate(authorizationRequest);
    const authorization = authorizationResponse.data.authorization;

    if (authorization.decision !== 'approved') {
      logger.warn(`Transfer authorization declined: ${JSON.stringify(authorization.decision_rationale)}`);
      res.status(400).json({ success: false, error: 'Transfer authorization declined', details: authorization.decision_rationale });
      return;
    }

    // Update advance with authorization ID
    const { error: updateError } = await supabase
      .from('blink_advances')
      .update({ 
        plaid_authorization_id: authorization.id,
        status: 'authorized'
      })
      .eq('id', id);

    if (updateError) {
      logger.error(`Error updating advance with authorization ID: ${updateError.message}`);
      res.status(500).json({ success: false, error: 'Failed to update advance' });
      return;
    }

    // Create transfer
    const transferRequest: TransferCreateRequest = {
      access_token: advance.plaid_access_token,
      account_id: advance.account_id,
      authorization_id: authorization.id,
      type: TransferType.Credit,
      network: transferNetwork,
      amount: advance.requested_amount.toString(),
      description: 'Blink Advance Disbursement',
      ach_class: ACHClass.Ppd,
      user: {
        legal_name: `${advance.first_name} ${advance.last_name}`,
      },
    };

    const transferResponse = await plaidClient.transferCreate(transferRequest);
    const transfer = transferResponse.data.transfer;

    // Update advance with transfer ID and status
    const { error: transferUpdateError } = await supabase
      .from('blink_advances')
      .update({ 
        plaid_transfer_id: transfer.id,
        status: 'funding_in_progress'
      })
      .eq('id', id);

    if (transferUpdateError) {
      logger.error(`Error updating advance with transfer ID: ${transferUpdateError.message}`);
      res.status(500).json({ success: false, error: 'Failed to update advance' });
      return;
    }

    res.status(200).json({ success: true, message: 'Disbursement initiated successfully', transferId: transfer.id });
  } catch (error: any) {
    logger.error(`Error initiating disbursement: ${error.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const handleTransferWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { webhook_type, webhook_code, transfer_id, transfer_status } = req.body;

    if (webhook_type !== 'TRANSFER' || webhook_code !== 'TRANSFER_STATUS_UPDATE') {
      res.status(200).json({ success: true, message: 'Webhook received but not processed' });
      return;
    }

    // Fetch the advance associated with this transfer
    const { data: advance, error: advanceError } = await supabase
      .from('blink_advances')
      .select('*')
      .eq('plaid_transfer_id', transfer_id)
      .single();

    if (advanceError || !advance) {
      logger.error(`Error fetching advance for transfer ${transfer_id}: ${advanceError?.message || 'Advance not found'}`);
      res.status(404).json({ success: false, error: 'Advance not found' });
      return;
    }

    let newStatus;
    switch (transfer_status) {
      case 'posted':
        newStatus = 'funded';
        break;
      case 'failed':
        newStatus = 'failed';
        break;
      default:
        newStatus = advance.status; // Keep the current status for other cases
    }

    // Update the advance status
    const { error: updateError } = await supabase
      .from('blink_advances')
      .update({ status: newStatus })
      .eq('id', advance.id);

    if (updateError) {
      logger.error(`Error updating advance status: ${updateError.message}`);
      res.status(500).json({ success: false, error: 'Failed to update advance status' });
      return;
    }

    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    logger.error(`Error processing transfer webhook: ${error.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

