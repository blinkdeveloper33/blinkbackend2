import * as admin from 'firebase-admin';
import logger from './logger';
import supabase from './supabaseService';

class NotificationService {
    private static instance: NotificationService;
    private initialized: boolean = false;

    private constructor() {
        // Private constructor to enforce singleton pattern
    }

    public static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    public initialize() {
        if (this.initialized) {
            return;
        }

        try {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                // You can also use a service account file:
                // credential: admin.credential.cert(serviceAccountPath),
            });
            this.initialized = true;
            logger.info('Firebase Admin SDK initialized successfully');
        } catch (error) {
            logger.error('Error initializing Firebase Admin SDK:', error);
            throw error;
        }
    }

    public async sendNotification(
        token: string,
        title: string,
        body: string,
        data?: Record<string, string>
    ): Promise<string> {
        if (!this.initialized) {
            throw new Error('Firebase Admin SDK not initialized');
        }

        const message: admin.messaging.Message = {
            notification: {
                title,
                body,
            },
            data,
            token,
        };

        try {
            const response = await admin.messaging().send(message);
            logger.info('Successfully sent notification:', response);
            return response;
        } catch (error) {
            logger.error('Error sending notification:', error);
            throw error;
        }
    }
}

export const notificationService = NotificationService.getInstance(); 