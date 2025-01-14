import { Response } from 'express';
import supabase from '../services/supabaseService';
import logger from '../services/logger';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

type TimeFrame = 'LAST_WEEK' | 'LAST_MONTH' | 'LAST_QUARTER' | 'LAST_YEAR';

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

interface CashFlowTrend {
  timeFrame: TimeFrame;
  netCashFlow: number;
  cashFlowRatio: number;
  growthRate: number;
  volatility: number;
  trends: {
    date: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    runningBalance: number;
  }[];
}

interface FinancialHealthMetrics {
  timeFrame: TimeFrame;
  healthScore: number;
  metrics: {
    incomeStability: number;
    expenseCoverage: number;
    savingsRate: number;
    cashBuffer: number;
    debtToIncomeRatio: number;
  };
  recommendations: string[];
}

interface IncomeAnalysis {
  timeFrame: TimeFrame;
  primaryIncome: number;
  secondaryIncome: number;
  incomeSourceDiversity: number;
  incomeStability: number;
  yearOverYearGrowth: number;
  sources: {
    name: string;
    amount: number;
    frequency: string;
    percentage: number;
  }[];
}

interface ExpenseAnalysis {
  timeFrame: TimeFrame;
  fixedExpenses: number;
  variableExpenses: number;
  expenseToIncomeRatio: number;
  essentialExpenses: number;
  discretionaryExpenses: number;
  monthlyVariation: number;
  categories: {
    name: string;
    amount: number;
    percentage: number;
    isEssential: boolean;
  }[];
}

interface CashFlowForecast {
  timeFrame: TimeFrame;
  predictedInflow: number;
  predictedOutflow: number;
  predictedNetPosition: number;
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  predictions: {
    date: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    confidence: number;
  }[];
}

interface Transaction {
  amount: number;
  date: string;
  description?: string;
  merchant_name?: string;
  category?: string;
}

interface TrendData {
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  runningBalance: number;
}

interface ExpenseCategory {
  name: string;
  amount: number;
  percentage: number;
  isEssential: boolean;
}

interface IncomeSource {
  name: string;
  amount: number;
  frequency: string;
  percentage: number;
}

interface ExpenseSummary {
  total: number;
  categories: ExpenseCategory[];
}

interface HealthMetrics {
  incomeStability: number;
  expenseCoverage: number;
  savingsRate: number;
  cashBuffer: number;
  debtToIncomeRatio: number;
}

interface CashFlowForecastData {
  totalInflow: number;
  totalOutflow: number;
  predictions: Array<{
    date: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    confidence: number;
  }>;
}

const calculateDateRange = (timeFrame: TimeFrame): { startDate: Date; endDate: Date } => {
  // Get current date in local timezone and set to start of day
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Set end date to end of current day
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);
  
  // Initialize start date with current date
  const startDate = new Date(now);

  switch (timeFrame) {
    case 'LAST_WEEK':
      startDate.setDate(startDate.getDate() - 7); // Last 7 days
      break;

    case 'LAST_MONTH':
      startDate.setDate(startDate.getDate() - 28); // Last 4 weeks
      break;

    case 'LAST_QUARTER':
      startDate.setMonth(startDate.getMonth() - 3); // Last 3 months
      break;

    case 'LAST_YEAR':
      startDate.setFullYear(startDate.getFullYear() - 1); // Last 12 months
      break;

    default:
      throw new Error(`Invalid timeFrame: ${timeFrame}`);
  }

  logger.debug(`Date range calculated for ${timeFrame}:`, {
    timeFrame,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    explanation: `Showing data from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
  });

  return { startDate, endDate };
};

const segmentTransactions = (transactions: any[], timeFrame: TimeFrame): CashFlowSegment[] => {
  const segments: CashFlowSegment[] = [];
  const { startDate, endDate } = calculateDateRange(timeFrame);

  switch (timeFrame) {
    case 'LAST_WEEK':
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
    case 'LAST_MONTH':
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + (i * 7));
        segments.push({
          period: `Week ${i + 1}`,
          inflow: 0,
          outflow: 0
        });
      }
      break;
    case 'LAST_QUARTER':
      for (let i = 0; i < 3; i++) {
        const monthDate = new Date(startDate);
        monthDate.setMonth(monthDate.getMonth() + i);
        segments.push({
          period: `${monthDate.toLocaleString('default', { month: 'long' })} ${monthDate.getFullYear()}`,
          inflow: 0,
          outflow: 0
        });
      }
      break;
    case 'LAST_YEAR':
      for (let i = 0; i < 12; i++) {
        const monthDate = new Date(startDate);
        monthDate.setMonth(monthDate.getMonth() + i);
        segments.push({
          period: `${monthDate.toLocaleString('default', { month: 'long' })} ${monthDate.getFullYear()}`,
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
      case 'LAST_WEEK':
        segmentIndex = Math.floor((transactionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        break;
      case 'LAST_MONTH':
        segmentIndex = Math.floor((transactionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
        break;
      case 'LAST_QUARTER':
        segmentIndex = Math.floor((transactionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        break;
      case 'LAST_YEAR':
        const monthDiff = (transactionDate.getFullYear() - startDate.getFullYear()) * 12 + 
                         (transactionDate.getMonth() - startDate.getMonth());
        segmentIndex = monthDiff;
        break;
    }

    if (segmentIndex >= 0 && segmentIndex < segments.length) {
      if (transaction.amount > 0) {
        segments[segmentIndex].outflow += transaction.amount;
      } else {
        segments[segmentIndex].inflow += Math.abs(transaction.amount);
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

  if (!['LAST_WEEK', 'LAST_MONTH', 'LAST_QUARTER', 'LAST_YEAR'].includes(timeFrame)) {
    res.status(400).json({
      success: false,
      error: 'Invalid time frame. Must be LAST_WEEK, LAST_MONTH, LAST_QUARTER, or LAST_YEAR.',
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

export const getCashFlowTrends = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as TimeFrame;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    // Fetch transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw new Error('Error fetching transactions: ' + error.message);

    // Calculate trends
    const trends = calculateTrends(transactions, startDate, endDate);
    
    // Calculate growth rate and volatility
    const growthRate = calculateGrowthRate(trends);
    const volatility = calculateVolatility(trends);
    
    // Calculate cash flow ratio
    const totalInflow = trends.reduce((sum, t) => sum + t.inflow, 0);
    const totalOutflow = trends.reduce((sum, t) => sum + t.outflow, 0);
    const cashFlowRatio = totalOutflow > 0 ? totalInflow / totalOutflow : 1;

    const response: CashFlowTrend = {
      timeFrame,
      netCashFlow: totalInflow - totalOutflow,
      cashFlowRatio,
      growthRate,
      volatility,
      trends
    };

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error: any) {
    logger.error('Cash Flow Trends Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze cash flow trends',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getFinancialHealthScore = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as TimeFrame;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    // Fetch transactions and account balances in parallel
    const [transactionsResponse, balancesResponse] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, date')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]),
      supabase
        .from('bank_accounts')
        .select('current_balance, available_balance')
        .eq('user_id', userId)
    ]);

    if (transactionsResponse.error) throw new Error('Error fetching transactions');
    if (balancesResponse.error) throw new Error('Error fetching balances');

    const transactions = transactionsResponse.data;
    const balances = balancesResponse.data;

    // Calculate metrics
    const metrics = calculateHealthMetrics(transactions, balances);
    
    // Generate recommendations
    const recommendations = generateRecommendations(metrics);

    const response: FinancialHealthMetrics = {
      timeFrame,
      healthScore: calculateOverallHealthScore(metrics),
      metrics,
      recommendations
    };

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error: any) {
    logger.error('Financial Health Score Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate financial health score',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getIncomeSourceAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as TimeFrame;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    // Fetch transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, date, description, merchant_name')
      .eq('user_id', userId)
      .lt('amount', 0) // Income transactions are negative
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    if (error) throw new Error('Error fetching transactions: ' + error.message);

    // Analyze income sources
    const sources = analyzeIncomeSources(transactions);
    
    // Calculate metrics
    const totalIncome = sources.reduce((sum, s) => sum + s.amount, 0);
    const primaryIncome = sources[0]?.amount || 0;
    const secondaryIncome = totalIncome - primaryIncome;
    
    const response: IncomeAnalysis = {
      timeFrame,
      primaryIncome,
      secondaryIncome,
      incomeSourceDiversity: calculateSourceDiversity(sources),
      incomeStability: calculateIncomeStability(transactions),
      yearOverYearGrowth: calculateYearOverYearGrowth(transactions),
      sources: sources.map(s => ({
        ...s,
        percentage: (s.amount / totalIncome) * 100
      }))
    };

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error: any) {
    logger.error('Income Source Analysis Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze income sources',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getExpenseToIncomeAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as TimeFrame;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    // Fetch transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, date, category')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    if (error) throw new Error('Error fetching transactions: ' + error.message);

    // Analyze expenses
    const { fixed, variable, essential, discretionary } = categorizeExpenses(transactions);
    const totalIncome = Math.abs(transactions.reduce((sum, t) => t.amount < 0 ? sum + t.amount : sum, 0));
    const totalExpenses = transactions.reduce((sum, t) => t.amount > 0 ? sum + t.amount : sum, 0);

    const response: ExpenseAnalysis = {
      timeFrame,
      fixedExpenses: fixed.total,
      variableExpenses: variable.total,
      expenseToIncomeRatio: totalExpenses / totalIncome,
      essentialExpenses: essential.total,
      discretionaryExpenses: discretionary.total,
      monthlyVariation: calculateMonthlyVariation(transactions),
      categories: [...fixed.categories, ...variable.categories].map(c => ({
        ...c,
        percentage: (c.amount / totalExpenses) * 100
      }))
    };

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error: any) {
    logger.error('Expense to Income Analysis Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze expense to income ratio',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getCashFlowForecast = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const timeFrame = req.query.timeFrame as TimeFrame;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: User not found.',
    });
    return;
  }

  try {
    const { startDate, endDate } = calculateDateRange(timeFrame);

    // Fetch historical transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    if (error) throw new Error('Error fetching transactions: ' + error.message);

    // Generate forecast
    const forecast = generateCashFlowForecast(transactions, timeFrame);
    
    // Calculate confidence score and risk level
    const confidenceScore = calculateForecastConfidence(forecast);
    const riskLevel = determineRiskLevel(forecast);

    const response: CashFlowForecast = {
      timeFrame,
      predictedInflow: forecast.totalInflow,
      predictedOutflow: forecast.totalOutflow,
      predictedNetPosition: forecast.totalInflow - forecast.totalOutflow,
      confidenceScore,
      riskLevel,
      predictions: forecast.predictions
    };

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error: any) {
    logger.error('Cash Flow Forecast Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate cash flow forecast',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper functions for calculations
function calculateTrends(transactions: Transaction[], startDate: Date, endDate: Date): TrendData[] {
  const trends: TrendData[] = [];
  let runningBalance = 0;
  
  // Group transactions by date
  const transactionsByDate = new Map<string, Transaction[]>();
  transactions.forEach(tx => {
    const date = tx.date.split('T')[0];
    if (!transactionsByDate.has(date)) {
      transactionsByDate.set(date, []);
    }
    transactionsByDate.get(date)?.push(tx);
  });

  // Calculate daily trends
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const date = currentDate.toISOString().split('T')[0];
    const dayTransactions = transactionsByDate.get(date) || [];
    
    const inflow = Math.abs(dayTransactions.reduce((sum, tx) => sum + (tx.amount < 0 ? tx.amount : 0), 0));
    const outflow = dayTransactions.reduce((sum, tx) => sum + (tx.amount > 0 ? tx.amount : 0), 0);
    const netFlow = inflow - outflow;
    runningBalance += netFlow;

    trends.push({
      date,
      inflow,
      outflow,
      netFlow,
      runningBalance
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return trends;
}

function calculateGrowthRate(trends: TrendData[]): number {
  if (trends.length < 2) return 0;
  
  const firstValue = trends[0].netFlow;
  const lastValue = trends[trends.length - 1].netFlow;
  
  if (firstValue === 0) return 0;
  
  return ((lastValue - firstValue) / Math.abs(firstValue)) * 100;
}

function calculateVolatility(trends: TrendData[]): number {
  if (trends.length < 2) return 0;
  
  const netFlows = trends.map(t => t.netFlow);
  const mean = netFlows.reduce((sum, val) => sum + val, 0) / netFlows.length;
  
  const squaredDiffs = netFlows.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
  
  return Math.sqrt(variance);
}

function calculateHealthMetrics(transactions: Transaction[], balances: Array<{ current_balance: number; available_balance: number }>): HealthMetrics {
  const totalInflow = Math.abs(transactions.reduce((sum, tx) => sum + (tx.amount < 0 ? tx.amount : 0), 0));
  const totalOutflow = transactions.reduce((sum, tx) => sum + (tx.amount > 0 ? tx.amount : 0), 0);
  const totalBalance = balances.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);
  const monthlyExpenses = totalOutflow / 3; // Assuming 3 months of data

  return {
    incomeStability: calculateIncomeStability(transactions),
    expenseCoverage: totalBalance / (monthlyExpenses || 1),
    savingsRate: ((totalInflow - totalOutflow) / totalInflow) * 100,
    cashBuffer: totalBalance / (monthlyExpenses || 1),
    debtToIncomeRatio: totalOutflow / (totalInflow || 1)
  };
}

function generateRecommendations(metrics: HealthMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.savingsRate < 20) {
    recommendations.push('Consider increasing your savings rate to at least 20% of your income.');
  }

  if (metrics.cashBuffer < 3) {
    recommendations.push('Work on building an emergency fund to cover at least 3 months of expenses.');
  }

  if (metrics.debtToIncomeRatio > 0.43) {
    recommendations.push('Your debt-to-income ratio is high. Consider debt consolidation or reduction strategies.');
  }

  if (metrics.expenseCoverage < 6) {
    recommendations.push('Aim to increase your expense coverage ratio to ensure better financial stability.');
  }

  return recommendations;
}

function calculateOverallHealthScore(metrics: HealthMetrics): number {
  const weights = {
    incomeStability: 0.25,
    expenseCoverage: 0.2,
    savingsRate: 0.25,
    cashBuffer: 0.2,
    debtToIncomeRatio: 0.1
  };

  const scores = {
    incomeStability: Math.min(100, metrics.incomeStability * 100),
    expenseCoverage: Math.min(100, metrics.expenseCoverage * 20),
    savingsRate: Math.min(100, metrics.savingsRate * 2),
    cashBuffer: Math.min(100, metrics.cashBuffer * 25),
    debtToIncomeRatio: Math.min(100, (1 - metrics.debtToIncomeRatio) * 100)
  };

  return Object.entries(weights).reduce((score, [metric, weight]) => {
    return score + (scores[metric as keyof typeof scores] * weight);
  }, 0);
}

function calculateSourceDiversity(sources: IncomeSource[]): number {
  if (sources.length === 0) return 0;
  
  const totalIncome = sources.reduce((sum, src) => sum + src.amount, 0);
  const diversityScore = sources.reduce((score, src) => {
    const percentage = src.amount / totalIncome;
    return score - (percentage * Math.log2(percentage));
  }, 0);

  return Math.min(100, diversityScore * 50);
}

function calculateIncomeStability(transactions: Transaction[]): number {
  if (transactions.length < 2) return 0;

  const monthlyIncomes = new Map<string, number>();
  transactions.forEach(tx => {
    if (tx.amount < 0) {
      const month = tx.date.substring(0, 7); // YYYY-MM
      monthlyIncomes.set(month, (monthlyIncomes.get(month) || 0) + Math.abs(tx.amount));
    }
  });

  const incomes = Array.from(monthlyIncomes.values());
  if (incomes.length < 2) return 0;

  const mean = incomes.reduce((sum, val) => sum + val, 0) / incomes.length;
  const variance = incomes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / incomes.length;
  const stdDev = Math.sqrt(variance);

  return Math.max(0, Math.min(1, 1 - (stdDev / mean)));
}

function calculateYearOverYearGrowth(transactions: Transaction[]): number {
  const yearlyIncomes = new Map<number, number>();
  
  transactions.forEach(tx => {
    if (tx.amount < 0) {
      const year = new Date(tx.date).getFullYear();
      yearlyIncomes.set(year, (yearlyIncomes.get(year) || 0) + Math.abs(tx.amount));
    }
  });

  const years = Array.from(yearlyIncomes.keys()).sort();
  if (years.length < 2) return 0;

  const oldestYear = years[0];
  const latestYear = years[years.length - 1];
  const oldestIncome = yearlyIncomes.get(oldestYear) || 0;
  const latestIncome = yearlyIncomes.get(latestYear) || 0;

  if (oldestIncome === 0) return 0;
  return ((latestIncome - oldestIncome) / oldestIncome) * 100;
}

function calculateMonthlyVariation(transactions: Transaction[]): number {
  const monthlyTotals = new Map<string, number>();
  
  transactions.forEach(tx => {
    if (tx.amount > 0) {
      const month = tx.date.substring(0, 7); // YYYY-MM
      monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + tx.amount);
    }
  });

  const totals = Array.from(monthlyTotals.values());
  if (totals.length < 2) return 0;

  const mean = totals.reduce((sum, val) => sum + val, 0) / totals.length;
  const variance = totals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / totals.length;
  const stdDev = Math.sqrt(variance);

  return (stdDev / mean) * 100;
}

function generateCashFlowForecast(transactions: Transaction[], timeFrame: TimeFrame): CashFlowForecastData {
  const monthlyPatterns = analyzeMonthlyPatterns(transactions);
  const predictions = generatePredictions(monthlyPatterns, timeFrame);
  
  return {
    totalInflow: predictions.reduce((sum, p) => sum + p.inflow, 0),
    totalOutflow: predictions.reduce((sum, p) => sum + p.outflow, 0),
    predictions
  };
}

function analyzeMonthlyPatterns(transactions: Transaction[]): Map<string, { inflow: number; outflow: number }> {
  const patterns = new Map<string, { inflow: number; outflow: number }>();
  
  transactions.forEach(tx => {
    const dayOfMonth = new Date(tx.date).getDate().toString();
    if (!patterns.has(dayOfMonth)) {
      patterns.set(dayOfMonth, { inflow: 0, outflow: 0 });
    }
    const pattern = patterns.get(dayOfMonth)!;
    
    if (tx.amount < 0) {
      pattern.inflow += Math.abs(tx.amount);
    } else {
      pattern.outflow += tx.amount;
    }
  });

  return patterns;
}

function generatePredictions(patterns: Map<string, { inflow: number; outflow: number }>, timeFrame: TimeFrame): Array<{
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  confidence: number;
}> {
  const predictions: Array<{
    date: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    confidence: number;
  }> = [];

  // Implementation here...

  return predictions;
}

function calculateForecastConfidence(forecast: CashFlowForecastData): number {
  // Implementation here...
  return 75; // Example confidence score
}

function determineRiskLevel(forecast: CashFlowForecastData): 'LOW' | 'MEDIUM' | 'HIGH' {
  const netPosition = forecast.totalInflow - forecast.totalOutflow;
  const ratio = forecast.totalInflow / (forecast.totalOutflow || 1);
  
  if (netPosition > 0 && ratio > 1.5) return 'LOW';
  if (netPosition < 0 || ratio < 0.8) return 'HIGH';
  return 'MEDIUM';
}

function analyzeIncomeSources(transactions: Transaction[]): IncomeSource[] {
  const sourceMap = new Map<string, { amount: number; frequency: string }>();
  
  transactions.forEach(tx => {
    if (tx.amount < 0) {
      const sourceName = tx.merchant_name || tx.description || 'Unknown Source';
      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, { amount: 0, frequency: 'MONTHLY' });
      }
      const source = sourceMap.get(sourceName)!;
      source.amount += Math.abs(tx.amount);
    }
  });

  const totalIncome = Array.from(sourceMap.values()).reduce((sum: number, src) => sum + src.amount, 0);
  
  return Array.from(sourceMap.entries())
    .map(([name, data]) => ({
      name,
      amount: data.amount,
      frequency: data.frequency,
      percentage: (data.amount / totalIncome) * 100
    }))
    .sort((a, b) => b.amount - a.amount);
}

function categorizeExpenses(transactions: Transaction[]): {
  fixed: ExpenseSummary;
  variable: ExpenseSummary;
  essential: ExpenseSummary;
  discretionary: ExpenseSummary;
} {
  const result = {
    fixed: { total: 0, categories: [] as ExpenseCategory[] },
    variable: { total: 0, categories: [] as ExpenseCategory[] },
    essential: { total: 0, categories: [] as ExpenseCategory[] },
    discretionary: { total: 0, categories: [] as ExpenseCategory[] }
  };

  const categoryMap = new Map<string, {
    total: number;
    isFixed: boolean;
    isEssential: boolean;
  }>();

  transactions.forEach(tx => {
    if (tx.amount > 0) {
      const category = tx.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          total: 0,
          isFixed: isFixedExpense(category),
          isEssential: isEssentialExpense(category)
        });
      }
      const catData = categoryMap.get(category)!;
      catData.total += tx.amount;
    }
  });

  categoryMap.forEach((data, category) => {
    const expenseCategory: ExpenseCategory = {
      name: category,
      amount: data.total,
      percentage: 0, // Will be calculated below
      isEssential: data.isEssential
    };

    if (data.isFixed) {
      result.fixed.total += data.total;
      result.fixed.categories.push(expenseCategory);
    } else {
      result.variable.total += data.total;
      result.variable.categories.push(expenseCategory);
    }

    if (data.isEssential) {
      result.essential.total += data.total;
      result.essential.categories.push(expenseCategory);
    } else {
      result.discretionary.total += data.total;
      result.discretionary.categories.push(expenseCategory);
    }
  });

  // Calculate percentages
  [result.fixed, result.variable, result.essential, result.discretionary].forEach(summary => {
    summary.categories.forEach(category => {
      category.percentage = (category.amount / summary.total) * 100;
    });
  });

  return result;
}

function isFixedExpense(category: string): boolean {
  const fixedCategories = [
    'Rent',
    'Mortgage',
    'Insurance',
    'Utilities',
    'Loan Payment',
    'Subscription'
  ];
  return fixedCategories.includes(category);
}

function isEssentialExpense(category: string): boolean {
  const essentialCategories = [
    'Rent',
    'Mortgage',
    'Insurance',
    'Utilities',
    'Groceries',
    'Healthcare',
    'Transportation'
  ];
  return essentialCategories.includes(category);
}

