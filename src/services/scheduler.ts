// src/services/scheduler.ts ⭐️⭐️⭐️


import cron from 'node-cron';
import supabase from './supabaseService';
import logger from './logger';
import { fetchAndStoreAccountBalances } from '../controllers/plaidController';

// Define types for database responses
interface RegistrationSession {
  id: string;
  expires_at: string;
}

interface User {
  id: string;
}

// Define Database schema types
interface Database {
  public: {
    Tables: {
      registration_sessions: {
        Row: RegistrationSession;
        Insert: RegistrationSession;
        Update: Partial<RegistrationSession>;
      };
      users: {
        Row: User;
        Insert: User;
        Update: Partial<User>;
      };
    };
  };
}

/**
 * Schedules a daily task to clean up expired registration sessions.
 * Runs every day at 2 AM UTC.
 */
export const scheduleCleanupExpiredSessions = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting cleanup of expired registration sessions.');

      const { data, error } = await supabase
        .from('registration_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select();

      if (error) {
        throw new Error('Error cleaning up expired sessions: ' + error.message);
      }

      const deletedCount = Array.isArray(data) ? data.length : 0;
      logger.info(`Expired registration sessions cleaned up successfully. Records deleted: ${deletedCount}`);
    } catch (error: any) {
      logger.error('Cleanup Task Error:', error.message);
    }
  }, {
    timezone: "UTC"
  });

  logger.info('Scheduled cleanup of expired registration sessions.');
};

/**
 * Schedules a daily task to synchronize account balances.
 * Runs every day at midnight UTC.
 */
export const scheduleBalanceSync = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Starting scheduled balance synchronization.');

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
      } else {
        logger.info('No users found for balance synchronization.');
      }

      logger.info('Scheduled balance synchronization completed.');
    } catch (error: any) {
      logger.error(`Scheduled balance synchronization failed: ${error.message}`);
    }
  }, {
    timezone: "UTC"
  });

  logger.info('Scheduled balance synchronization.');
};