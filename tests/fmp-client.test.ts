import axios from 'axios';
import { FMPClient, AnalystEstimate } from '../src/fmp-client';

jest.mock('axios');

describe('FMPClient', () => {
  const mockEstimates: AnalystEstimate[] = [
    {
      symbol: 'AAPL',
      date: '2026-09-30', // Q4
      revenueLow: 100,
      revenueHigh: 120,
      revenueAvg: 110,
      epsLow: 1.0,
      epsHigh: 1.2,
      epsAvg: 1.1,
      ebitdaLow: 40,
      ebitdaHigh: 50,
      ebitdaAvg: 45,
      sgaExpenseLow: 10,
      sgaExpenseHigh: 12,
      sgaExpenseAvg: 11,
      numAnalystsRevenue: 10,
      numAnalystsEps: 10,
    },
    {
      symbol: 'AAPL',
      date: '2026-06-30', // Q3
      revenueLow: 90,
      revenueHigh: 110,
      revenueAvg: 100,
      epsLow: 0.8,
      epsHigh: 1.0,
      epsAvg: 0.9,
      ebitdaLow: 35,
      ebitdaHigh: 45,
      ebitdaAvg: 40,
      sgaExpenseLow: 9,
      sgaExpenseHigh: 11,
      sgaExpenseAvg: 10,
      numAnalystsRevenue: 10,
      numAnalystsEps: 10,
    },
    {
      symbol: 'AAPL',
      date: '2026-03-31', // Q2
      revenueLow: 80,
      revenueHigh: 100,
      revenueAvg: 90,
      epsLow: 0.7,
      epsHigh: 0.9,
      epsAvg: 0.8,
      ebitdaLow: 30,
      ebitdaHigh: 40,
      ebitdaAvg: 35,
      sgaExpenseLow: 8,
      sgaExpenseHigh: 10,
      sgaExpenseAvg: 9,
      numAnalystsRevenue: 10,
      numAnalystsEps: 10,
    },
  ];

  beforeEach(() => {
    process.env.FMP_API_KEY = 'mock-key';
  });

  it('should fetch analyst estimates successfully', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: mockEstimates });

    const client = new FMPClient();
    const estimates = await client.getAnalystEstimates('AAPL', 'quarter');

    expect(estimates).toHaveLength(3);
    expect(estimates[0].symbol).toBe('AAPL');
  });

  it('should correctly select the closest prior estimate date relative to the filing date', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: mockEstimates });

    const client = new FMPClient();
    
    // Filing published on 2026-07-28 (should map to 2026-06-30 Q3 period)
    const estimate = await client.getEstimateForFiling('AAPL', '2026-07-28T14:00:00Z', 'quarter');

    expect(estimate).not.toBeNull();
    expect(estimate!.date).toBe('2026-06-30');
    expect(estimate!.revenueAvg).toBe(100);
    expect(estimate!.epsAvg).toBe(0.9);
  });
});
