import axios from 'axios';
import { FMPClient, AnalystEstimate } from '../src/fmp-client';

jest.mock('axios');

describe('FMPClient', () => {
  const mockEstimates: AnalystEstimate[] = [
    {
      symbol: 'AAPL',
      date: '2026-09-30', // Q4
      estimatedRevenueLow: 100,
      estimatedRevenueHigh: 120,
      estimatedRevenueAvg: 110,
      estimatedEpsLow: 1.0,
      estimatedEpsHigh: 1.2,
      estimatedEpsAvg: 1.1,
      estimatedEbitdaLow: 40,
      estimatedEbitdaHigh: 50,
      estimatedEbitdaAvg: 45,
      estimatedSgaExpenseLow: 10,
      estimatedSgaExpenseHigh: 12,
      estimatedSgaExpenseAvg: 11,
      numberAnalystEstimatedRevenue: 10,
      numberAnalystsEstimatedEps: 10,
    },
    {
      symbol: 'AAPL',
      date: '2026-06-30', // Q3
      estimatedRevenueLow: 90,
      estimatedRevenueHigh: 110,
      estimatedRevenueAvg: 100,
      estimatedEpsLow: 0.8,
      estimatedEpsHigh: 1.0,
      estimatedEpsAvg: 0.9,
      estimatedEbitdaLow: 35,
      estimatedEbitdaHigh: 45,
      estimatedEbitdaAvg: 40,
      estimatedSgaExpenseLow: 9,
      estimatedSgaExpenseHigh: 11,
      estimatedSgaExpenseAvg: 10,
      numberAnalystEstimatedRevenue: 10,
      numberAnalystsEstimatedEps: 10,
    },
    {
      symbol: 'AAPL',
      date: '2026-03-31', // Q2
      estimatedRevenueLow: 80,
      estimatedRevenueHigh: 100,
      estimatedRevenueAvg: 90,
      estimatedEpsLow: 0.7,
      estimatedEpsHigh: 0.9,
      estimatedEpsAvg: 0.8,
      estimatedEbitdaLow: 30,
      estimatedEbitdaHigh: 40,
      estimatedEbitdaAvg: 35,
      estimatedSgaExpenseLow: 8,
      estimatedSgaExpenseHigh: 10,
      estimatedSgaExpenseAvg: 9,
      numberAnalystEstimatedRevenue: 10,
      numberAnalystsEstimatedEps: 10,
    },
  ];

  beforeEach(() => {
    process.env.FMP_API_KEY = 'mock-key';
  });

  it('should fetch analyst estimates successfully', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: mockEstimates });

    const client = new FMPClient();
    const estimates = await client.getAnalystEstimates('AAPL');

    expect(estimates).toHaveLength(3);
    expect(estimates[0].symbol).toBe('AAPL');
  });

  it('should correctly select the closest prior estimate date relative to the filing date', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: mockEstimates });

    const client = new FMPClient();
    
    // Filing published on 2026-07-28 (should map to 2026-06-30 Q3 period)
    const estimate = await client.getEstimateForFiling('AAPL', '2026-07-28T14:00:00Z');

    expect(estimate).not.toBeNull();
    expect(estimate!.date).toBe('2026-06-30');
    expect(estimate!.estimatedRevenueAvg).toBe(100);
    expect(estimate!.estimatedEpsAvg).toBe(0.9);
  });
});
