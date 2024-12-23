import express from 'express';
import { initiateDisbursement, handleTransferWebhook } from '../controllers/blinkAdvanceDisbursementController';
import authMiddleware from '../middleware/authMiddleware';

const router = express.Router();

router.post('/:id/disburse', authMiddleware, initiateDisbursement);
router.post('/webhook', handleTransferWebhook);

export default router;

