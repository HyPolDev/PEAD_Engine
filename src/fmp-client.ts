import axios from 'axios';
import { config } from './config';

export interface AnalystEstimate {
  symbol: string;
  date: string;
  estimatedRevenueLow: number;
  estimatedRevenueHigh: number;
  estimatedRevenueAvg: number;
  estimatedEpsLow: number;
  estimatedEpsHigh: number;
  estimatedEpsAvg: number;
  estimatedEbitdaLow: number;
  estimatedEbitdaHigh: number;
  estimatedEbitdaAvg: number;
  estimatedSgaExpenseLow: number;
  estimatedSgaExpenseHigh: number;
  estimatedSgaExpenseAvg: number;
  numberAnalystEstimatedRevenue: number;
  numberAnalystsEstimatedEps: number;
}

export class FMPClient {
  private apiKey: string;
  private baseUrl = 'https://financialmodelingprep.com/api/v3';

  constructor() {
    this.apiKey = process.env.FMP_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[FMPClient] Warning: FMP_API_KEY environment variable is not defined.');
    }
  }

  /**
   * Fetches analyst estimates for a given stock symbol.
   */
  async getAnalystEstimates(symbol: string): Promise<AnalystEstimate[]> {
    if (!this.apiKey) {
      throw new Error('FMP_API_KEY is required to fetch analyst estimates.');
    }

    const url = `${this.baseUrl}/analyst-estimates/${symbol.toUpperCase()}?apikey=${this.apiKey}`;
    try {
      console.log(`[FMPClient] Fetching analyst estimates for: ${symbol}`);
      const response = await axios.get<AnalystEstimate[]>(url);
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error: any) {
      console.error(`[FMPClient] Failed to fetch analyst estimates for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aligns and retrieves the analyst estimate closest to, but before, the filing publication date.
   * This aligns the estimate with the corresponding fiscal quarter/year of the filing.
   */
  async getEstimateForFiling(symbol: string, filingDateStr: string): Promise<AnalystEstimate | null> {
    const estimates = await this.getAnalystEstimates(symbol);
    if (estimates.length === 0) return null;

    const filingDate = new Date(filingDateStr);

    // Find all estimates where the period end date is before the filing date
    const priorEstimates = estimates.filter(est => {
      const estDate = new Date(est.date);
      return estDate < filingDate;
    });

    if (priorEstimates.length === 0) {
      // Fallback: If all estimates are in the future (unlikely for historical backtests),
      // just pick the one closest to the filing date
      console.warn(`[FMPClient] No estimates found with date prior to filing date ${filingDateStr}. Using closest estimate.`);
      return estimates.reduce((closest, current) => {
        const closestDiff = Math.abs(new Date(closest.date).getTime() - filingDate.getTime());
        const currentDiff = Math.abs(new Date(current.date).getTime() - filingDate.getTime());
        return currentDiff < closestDiff ? current : closest;
      });
    }

    // Sort descending by date to find the most recent estimate period
    priorEstimates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // The first one is the closest period end date prior to the filing (e.g. Q ends June 30, filed July 28)
    return priorEstimates[0];
  }
}
