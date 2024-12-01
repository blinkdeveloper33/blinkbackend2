// src/app.ts

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config';

// Import Routes
import plaidRoutes from './routes/plaidRoutes';
import userRoutes from './routes/userRoutes';

// Import Logger
import logger from './services/logger';

// Import Scheduler
import { scheduleCleanupExpiredSessions, scheduleBalanceSync } from './services/scheduler';

const app: Application = express();

// Middleware
app.use(helmet());

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

// HTTP Request Logging using Winston
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// CORS Configuration
app.use(cors({
  origin: '*',
  credentials: true,
}));

// Body Parser (Using built-in Express middleware)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/plaid', plaidRoutes);
app.use('/api/users', userRoutes);

// Root Endpoint
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ 
    success: true,
    message: 'BlinkBackend2 is running' 
  });
});

// Global Error Handling Middleware
app.use(
  (err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    logger.error('Unhandled Error:', err.stack);
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
  scheduleBalanceSync(); // Ensure to schedule balance synchronization if needed
});

export default app;
