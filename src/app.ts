// src/app.ts

import express, { Application, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config';

// Import Routes
import { publicUserRoutes, protectedUserRoutes } from './routes/userRoutes';
import plaidRoutes from './routes/plaidRoutes';
import blinkAdvanceRoutes from './routes/blinkAdvanceRoutes';
import cashFlowRoutes from './routes/cashFlowRoutes';
import blinkAdvanceDisbursementRoutes from './routes/blinkAdvanceDisbursementRoutes';

// Import Logger
import logger from './services/logger';

// Import Scheduler
import { scheduleCleanupExpiredSessions, scheduleBalanceSync } from './services/scheduler';

// Import authMiddleware
import authMiddleware from './middleware/authMiddleware';

const app: Application = express();

// Debug logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Request received: ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
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
  skip: (req: Request) => req.path === '/api/plaid/webhook', // Exclude webhook from rate limiting
});
app.use(limiter);

// Public Routes
app.use('/api/users', publicUserRoutes);
app.post('/api/plaid/webhook', plaidRoutes);

// Apply authMiddleware to all routes below this line
app.use(authMiddleware);

// Protected Routes
app.use('/api/users', protectedUserRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/cash-flow', cashFlowRoutes);
app.use('/api/blink-advances', blinkAdvanceRoutes);
app.use('/api/blink-advances', blinkAdvanceDisbursementRoutes);


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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handling Middleware
app.use(
  (err: any, req: Request, res: Response, next: NextFunction) => {
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

