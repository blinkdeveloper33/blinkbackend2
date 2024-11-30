// src/services/scheduler.ts

import cron from 'node-cron';
import supabase from './supabaseService';
import logger from './logger';

/**
 * Schedules a daily task to clean up expired registration sessions.
 */
export const scheduleCleanupExpiredSessions = () => {
  // Schedule to run every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting cleanup of expired registration sessions.');

      const { error } = await supabase
        .from('registration_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        throw new Error('Error cleaning up expired sessions: ' + error.message);
      }

      logger.info('Expired registration sessions cleaned up successfully.');
    } catch (error: any) {
      logger.error('Cleanup Task Error:', error.message);
    }
  });
};

import { fetchAndStoreAccountBalances } from '../controllers/plaidController';


 export const scheduleBalanceSync = () => {
  // Schedule to run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Starting scheduled balance synchronization');

      const { data: users, error } = await supabase
        .from('users')
        .select('id');

      if (error) {
        throw new Error('Error fetching users for balance sync: ' + error.message);
      }

      if (users && users.length > 0) {
        for (const user of users) {
          try {
            await fetchAndStoreAccountBalances(user.id);
            logger.info(`Synchronized balances for user ${user.id}`);
          } catch (userError: any) {
            logger.error(`Failed to synchronize balances for user ${user.id}: ${userError.message}`);
          }
        }
      }

      logger.info('Scheduled balance synchronization completed');
    } catch (error: any) {
      logger.error(`Scheduled balance synchronization failed: ${error.message}`);
    }
  });
};

