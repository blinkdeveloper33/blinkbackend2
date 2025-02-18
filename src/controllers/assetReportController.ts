import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/types';
import { Products, AssetReportAddOns } from 'plaid';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import config from '../config';
import plaidClient from '../services/plaidService';

interface AssetReportUserOptions {
  client_user_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ssn?: string;
  phone_number?: string;
  email?: string;
}

interface AssetReportOptions {
  client_report_id?: string;
  webhook?: string;
  add_ons?: AssetReportAddOns[];
  user?: AssetReportUserOptions;
  require_all_items?: boolean;
}

interface CreateAssetReportRequest {
  access_tokens: string[];
  days_requested: number;
  options?: AssetReportOptions;
}

// Helper function to check if an item has the assets product enabled
const checkItemStatus = async (access_token: string): Promise<boolean> => {
  try {
    const response = await plaidClient.itemGet({
      access_token
    });
    
    const availableProducts = response.data.item.available_products || [];
    const billedProducts = response.data.item.billed_products || [];
    const allProducts = [...availableProducts, ...billedProducts];
    
    logger.debug('Item products:', {
      available: availableProducts,
      billed: billedProducts,
      itemId: response.data.item.item_id
    });
    
    return allProducts.includes(Products.Assets);
  } catch (error: any) {
    logger.error('Error checking item status:', {
      error: error.message,
      plaidError: error.response?.data
    });
    return false;
  }
};

export const createAssetReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { access_tokens, days_requested, options } = req.body;

    // Enhanced request validation logging
    logger.debug('Asset Report Request:', {
      accessTokensPresent: !!access_tokens,
      accessTokensLength: access_tokens?.length,
      daysRequested: days_requested,
      optionsPresent: !!options,
      environment: config.PLAID_ENV,
      plaidClientId: config.PLAID_CLIENT_ID ? '✓' : '✗',
      plaidSecret: config.PLAID_SECRET ? '✓' : '✗'
    });

    // Validate access_tokens
    if (!Array.isArray(access_tokens) || access_tokens.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Failed to create asset report',
        details: {
          error_type: 'INVALID_INPUT',
          error_code: 'MISSING_ACCESS_TOKENS',
          error_message: 'At least one access token is required'
        }
      });
      return;
    }

    // Validate days_requested
    if (!days_requested || days_requested < 0 || days_requested > 731) {
      res.status(400).json({
        success: false,
        error: 'Failed to create asset report',
        details: {
          error_type: 'INVALID_INPUT',
          error_code: 'INVALID_DAYS_REQUESTED',
          error_message: 'days_requested must be between 0 and 731'
        }
      });
      return;
    }

    // Check if all items have the assets product enabled
    logger.debug('Checking item status for all access tokens...');
    const itemStatuses = await Promise.all(
      access_tokens.map(async (token) => {
        try {
          const response = await plaidClient.itemGet({
            access_token: token
          });
          
          const availableProducts = response.data.item.available_products || [];
          const billedProducts = response.data.item.billed_products || [];
          const allProducts = [...availableProducts, ...billedProducts];
          
          logger.debug('Item products:', {
            available: availableProducts,
            billed: billedProducts,
            itemId: response.data.item.item_id,
            hasAssets: allProducts.includes(Products.Assets)
          });
          
          return allProducts.includes(Products.Assets);
        } catch (error: any) {
          logger.error('Error checking item status:', {
            token: token.slice(-4),
            error: error.message,
            plaidError: error.response?.data
          });
          return false;
        }
      })
    );

    if (itemStatuses.some(status => !status)) {
      res.status(400).json({
        success: false,
        error: 'Failed to create asset report',
        details: {
          error_type: 'INVALID_INPUT',
          error_code: 'PRODUCT_NOT_ENABLED',
          error_message: 'One or more items do not have the assets product enabled'
        }
      });
      return;
    }

    // Create the asset report
    logger.debug('Creating asset report with options:', {
      daysRequested: days_requested,
      options: {
        ...options,
        client_report_id: options?.client_report_id || `report-${Date.now()}`
      }
    });

    const assetReportCreateResponse = await plaidClient.assetReportCreate({
      access_tokens,
      days_requested,
      options: {
        ...options,
        client_report_id: options?.client_report_id || `report-${Date.now()}`
      }
    });

    const { asset_report_token, asset_report_id, request_id } = assetReportCreateResponse.data;

    logger.debug('Asset report created successfully:', {
      asset_report_id,
      request_id,
      days_requested
    });

    // Store in database
    const { error: dbError } = await supabase
      .from('asset_reports')
      .insert({
        user_id: req.user?.id,
        asset_report_token,
        asset_report_id,
        status: 'pending',
        days_requested,
        created_at: new Date().toISOString()
      });

    if (dbError) {
      logger.error('Error storing asset report:', dbError);
      throw dbError;
    }

    res.json({
      success: true,
      asset_report_token,
      asset_report_id,
      request_id
    });

  } catch (error: any) {
    logger.error('Asset Report Creation Error:', {
      error: error.message,
      plaidError: error.response?.data,
      stack: error.stack,
      environment: config.PLAID_ENV,
      requestBody: {
        access_tokens: req.body.access_tokens?.map((token: string) => token.slice(-4)),
        days_requested: req.body.days_requested,
        options: {
          ...req.body.options,
          client_report_id: req.body.options?.client_report_id
        }
      }
    });
    
    if (error.response?.data) {
      const plaidError = error.response.data;
      res.status(400).json({
        success: false,
        error: 'Failed to create asset report',
        details: {
          error_type: plaidError.error_type,
          error_code: plaidError.error_code,
          error_message: plaidError.error_message,
          display_message: plaidError.display_message,
          request_id: plaidError.request_id,
          documentation_url: `https://plaid.com/docs/errors/${plaidError.error_type}/#${plaidError.error_code}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create asset report',
        details: {
          error_type: 'INTERNAL_SERVER_ERROR',
          error_code: 'UNKNOWN_ERROR',
          error_message: error.message,
          suggestion: 'Please try with a smaller days_requested value or contact support'
        }
      });
    }
  }
}; 