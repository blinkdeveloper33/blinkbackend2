import { Response } from 'express';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

type TimeFrame = 'WTD' | 'MTD' | 'QTD' | 'YTD';

interface CashFlowSegment {
  period: string;
  inflow: number;
  outflow: number;
}

interface CashFlowAnalysis {
  timeframe: TimeFrame;
  totalInflow: number;
  totalOutflow: number;
  segments: CashFlowSegment[];
}

const calculateDateRange = (timeFrame: TimeFrame): { startDate: Date; endDate: Date } => {
  const endDate = new Date();
  let startDate = new Date();

  switch (timeFrame) {
    case 'WTD':
      const day = endDate.getDay();
      startDate.setDate(endDate.getDate() - day + (day === 0 ? -6 : 1)); // Adjust for Sunday
      break;
    case 'MTD':
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      break;
    case 'QTD':
      const quarterStartMonth = Math.floor(endDate.getMonth() / 3) * 3;
      startDate = new Date(endDate.getFullYear(), quarterStartMonth, 1);
      break;
    case 'YTD':
      startDate = new Date(endDate.getFullYear(), 0, 1); // January 1st of current year
      break;
  }

  return { startDate, endDate };
};

const segmentTransactions = (transactions: any[], timeFrame: TimeFrame): CashFlowSegment[] => {
  const segments: CashFlowSegment[] = [];
  const { startDate, endDate } = calculateDateRange(timeFrame);

  switch (timeFrame) {
    case 'WTD':
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        segments.push({
          period: date.toISOString().split('T')[0],
          inflow: 0,
          outflow: 0
        });
      }
      break;
    case 'MTD':
      const weeksInMonth = Math.ceil((endDate.getDate() - startDate.getDate() + 1) / 7);
      for (let i = 0; i < weeksInMonth; i++) {
        segments.push({
          period: `Week ${i + 1}`,
          inflow: 0,
          outflow: 0
        });
      }
      break;
    case 'QTD':
      for (let i = 0; i < 3; i++) {
        const monthDate = new Date(startDate);
        monthDate.setMonth(monthDate.getMonth() + i);
        segments.push({
          period: monthDate.toLocaleString('default', { month: 'long' }),
          inflow: 0,
          outflow: 0
        });
      }
      break;
    case 'YTD':
      for (let i = 0; i < 12; i++) {
        const monthDate = new Date(startDate.getFullYear(), i, 1);
        segments.push({
          period: monthDate.toLocaleString('default', { month: 'long' }),
          inflow: 0,
          outflow: 0
        });
      }
      break;
  }

  transactions.forEach(transaction => {
    const transactionDate = new Date(transaction.date);
    let segmentIndex: number;

    switch (timeFrame) {
      case 'WTD':
        segmentIndex = (transactionDate.getDay() - startDate.getDay() + 7) % 7;
        break;
      case 'MTD':
        segmentIndex = Math.floor((transactionDate.getDate() - 1) / 7);
        break;
      case 'QTD':
        segmentIndex = transactionDate.getMonth() - startDate.getMonth();
        break;
      case 'YTD':
        segmentIndex = transactionDate.getMonth();
        break;
    }

    if (segmentIndex >= 0 && segmentIndex < segments.length) {
      if (transaction.amount < 0) {
        segments[segmentIndex].inflow += Math.abs(transaction.amount);
      } else {
        segments[segmentIndex].outflow += transaction.amount;
      }
    }
  });

  return segments;
};

export const getCashFlowAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as TimeFrame;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  if (!['WTD', 'MTD', 'QTD', 'YTD'].includes(timeFrame)) {
    res.status(400).json({
      success: false,
      error: 'Invalid time frame. Must be WTD, MTD, QTD, or YTD.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) {
      throw new Error('Error fetching transactions: ' + error.message);
    }

    const segments = segmentTransactions(data, timeFrame);

    const totalInflow = segments.reduce((sum, segment) => sum + segment.inflow, 0);
    const totalOutflow = segments.reduce((sum, segment) => sum + segment.outflow, 0);

    const analysis: CashFlowAnalysis = {
      timeframe: timeFrame,
      totalInflow: Number(totalInflow.toFixed(2)),
      totalOutflow: Number(totalOutflow.toFixed(2)),
      segments: segments.map(segment => ({
        ...segment,
        inflow: Number(segment.inflow.toFixed(2)),
        outflow: Number(segment.outflow.toFixed(2))
      }))
    };

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    logger.error('Get Cash Flow Analysis Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cash flow analysis.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
