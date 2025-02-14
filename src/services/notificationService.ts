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

    public async sendAdvanceApprovalNotification(userId: string): Promise<void> {
        try {
            // Get user's FCM token
            const { data: user, error } = await supabase
                .from('users')
                .select('fcm_token')
                .eq('id', userId)
                .single();

            if (error || !user?.fcm_token) {
                logger.error('Error fetching user FCM token:', error);
                return;
            }

            const message: admin.messaging.Message = {
                notification: {
                    title: 'Advance Approved! 🎉',
                    body: 'Your Blink Advance request has been approved. You can now proceed with the advance.',
                },
                data: {
                    type: 'advance_approval',
                    userId,
                },
                token: user.fcm_token,
            };

            const response = await admin.messaging().send(message);
            logger.info(`Successfully sent notification to user ${userId}:`, response);
        } catch (error) {
            logger.error('Error sending advance approval notification:', error);
            // Don't throw the error as this is not critical for the main flow
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

    public async sendAdvanceRequestedNotification(
        userEmail: string,
        advanceDetails: {
            amount: number;
            repaymentDate: string;
            totalRepaymentAmount: number;
        }
    ): Promise<void> {
        try {
            // Get user's FCM token
            const { data: user, error } = await supabase
                .from('users')
                .select('fcm_token')
                .eq('email', userEmail)
                .single();

            if (error || !user?.fcm_token) {
                logger.error('Error fetching user FCM token:', error);
                return;
            }

            const formattedRepaymentDate = new Date(advanceDetails.repaymentDate).toLocaleDateString();
            const message: admin.messaging.Message = {
                notification: {
                    title: 'Blink Advance Request Received 💫',
                    body: `Your request for $${advanceDetails.amount.toFixed(2)} has been received. Total repayment of $${advanceDetails.totalRepaymentAmount.toFixed(2)} is due by ${formattedRepaymentDate}.`,
                },
                data: {
                    type: 'advance_requested',
                    amount: advanceDetails.amount.toString(),
                    repaymentDate: advanceDetails.repaymentDate,
                    totalRepaymentAmount: advanceDetails.totalRepaymentAmount.toString(),
                },
                token: user.fcm_token,
            };

            const response = await admin.messaging().send(message);
            logger.info(`Successfully sent advance request notification to user ${userEmail}:`, response);
        } catch (error) {
            logger.error('Error sending advance request notification:', error);
            // Don't throw the error as this is not critical for the main flow
        }
    }
}

export const notificationService = NotificationService.getInstance(); 