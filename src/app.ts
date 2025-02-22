import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config';

// Import Routes
import { publicUserRoutes, protectedUserRoutes } from './routes/userRoutes';
import { publicRouter as publicPlaidRoutes, protectedRouter as protectedPlaidRoutes } from './routes/plaidRoutes';
import cashFlowRoutes from './routes/cashFlowRoutes';
import bankAccountRoutes from './routes/bankAccountRoutes';
import blinkAdvanceRoutes from './routes/blinkAdvanceRoutes';
import assetReportRoutes from './routes/assetReportRoutes';

// Import Logger
import logger from './services/logger';

// Import Scheduler
import { scheduleCleanupExpiredSessions, scheduleBalanceSync } from './services/scheduler';

// Import authMiddleware
import authMiddleware from './middleware/authMiddleware';

// Import notification service
import { notificationService } from './services/notificationService';

const app: Application = express();

// Initialize Firebase Admin SDK for notifications
try {
  notificationService.initialize();
  logger.info('Firebase Admin SDK initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Firebase Admin SDK:', error);
  // Continue running the app even if notifications fail to initialize
}

// Debug logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Request received: ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'https://1f33-12-162-124-34.ngrok-free.app', 'exp://*'],
  credentials: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logging using Winston
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.'
    });
  },
  skip: (req: Request) => req.url === '/api/plaid/webhook', // Exclude webhook from rate limiting
});
app.use(limiter);

// Public Routes
app.use('/api/users', publicUserRoutes);
app.use('/api/plaid', publicPlaidRoutes);

// Root Endpoint (public)
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ 
    success: true,
    message: 'BlinkBackend2 is running' 
  });
});

// Health Check Endpoint (public)
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Server is healthy' });
});

// Bank Account Routes (Protected)
app.use('/api/bank-accounts', authMiddleware, bankAccountRoutes);

// Protected Routes
app.use('/api/users', authMiddleware, protectedUserRoutes);
app.use('/api/plaid', authMiddleware, protectedPlaidRoutes);
app.use('/api/cash-flow', authMiddleware, cashFlowRoutes);
app.use('/api/blink-advances', authMiddleware, blinkAdvanceRoutes);

// Add asset report routes (protected)
app.use('/api/asset-report', authMiddleware, assetReportRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handling Middleware
app.use(
  (err: Error, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    logger.error('Unhandled Error in Global Middleware:', err.stack);
    res.status(500).json({ 
      success: false,
      error: 'Something went wrong!' 
    });
  }
);

// Start Server
app.listen(config.PORT, () => {
  logger.info(`Server is running on port ${config.PORT}`);

  // Start scheduled tasks
  scheduleCleanupExpiredSessions();
  scheduleBalanceSync();
});

export default app; 