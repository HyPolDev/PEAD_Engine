import * as fs from 'fs';
import * as path from 'path';
import { SECClient } from './sec-client';
import { config } from './config';

interface TickerExchangeData {
  name: string;
  ticker: string;
  exchange: string;
}

interface SECTickerExchangePayload {
  fields: string[];
  data: [number, string, string, string][];
}

export class TickerMapper {
  private client: SECClient;
  private cachePath: string;
  private tickersUrl = 'https://www.sec.gov/files/company_tickers_exchange.json';
  private mapping: Map<string, TickerExchangeData> = new Map();
  // 24 hours in milliseconds
  private cacheExpiryMs = 24 * 60 * 60 * 1000;

  constructor(customCachePath?: string) {
    this.client = new SECClient(config.secUserAgent);
    this.cachePath = customCachePath || path.resolve(process.cwd(), 'data/company_tickers_exchange.json');
  }

  /**
   * Initializes the mapping by loading from cache or downloading from SEC.
   */
  async initialize(): Promise<void> {
    let dataStr = '';
    let loadedFromCache = false;

    // Check if local cache exists and is fresh
    if (fs.existsSync(this.cachePath)) {
      try {
        const stats = fs.statSync(this.cachePath);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs < this.cacheExpiryMs) {
          console.log(`[TickerMapper] Loading exchange mapping from fresh cache (age: ${Math.round(ageMs / (60 * 1000))} minutes).`);
          dataStr = fs.readFileSync(this.cachePath, 'utf8');
          loadedFromCache = true;
        } else {
          console.log('[TickerMapper] Cache is older than 24 hours. Refreshing...');
        }
      } catch (err: any) {
        console.warn(`[TickerMapper] Failed to read cache file stats: ${err.message}. Fetching fresh.`);
      }
    }

    // Fetch from SEC if cache is missing, stale, or failed to read
    if (!loadedFromCache) {
      try {
        console.log(`[TickerMapper] Downloading tickers mapping from SEC: ${this.tickersUrl}`);
        dataStr = await this.client.fetchFeed(this.tickersUrl);
        
        // Ensure parent directory exists before writing cache
        const parentDir = path.dirname(this.cachePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        // Save to cache
        fs.writeFileSync(this.cachePath, dataStr, 'utf8');
        console.log(`[TickerMapper] Successfully saved tickers exchange cache to: ${this.cachePath}`);
      } catch (err: any) {
        // Fallback: If network fetch fails, attempt to load stale cache if available
        if (fs.existsSync(this.cachePath)) {
          console.warn(`[TickerMapper] Failed to fetch fresh tickers exchange data: ${err.message}. Falling back to stale cache.`);
          dataStr = fs.readFileSync(this.cachePath, 'utf8');
        } else {
          console.error('[TickerMapper] Critical error: Ticker exchange cache missing and SEC fetch failed.');
          throw err;
        }
      }
    }

    // Parse data
    this.parsePayload(dataStr);
  }

  /**
   * Parses the raw JSON response payload and indexes it.
   */
  private parsePayload(payloadStr: string): void {
    try {
      const payload = JSON.parse(payloadStr) as SECTickerExchangePayload;
      if (!payload || !payload.data || !Array.isArray(payload.data)) {
        throw new Error('Invalid SEC tickers exchange JSON payload format.');
      }

      this.mapping.clear();
      for (const row of payload.data) {
        const [cikNum, name, ticker, exchange] = row;
        // SEC CIK is a number; standard 10-digit pad
        const cik = String(cikNum).padStart(10, '0');
        
        const safeName = (name || '').trim();
        const safeTicker = (ticker || '').trim().toUpperCase();
        const safeExchange = (exchange || '').trim();

        this.mapping.set(cik, {
          name: safeName,
          ticker: safeTicker,
          exchange: safeExchange,
        });
      }

      console.log(`[TickerMapper] Successfully indexed ${this.mapping.size} tickers mapping entries.`);
    } catch (err: any) {
      console.error(`[TickerMapper] Error parsing ticker exchange JSON: ${err.message}`);
      throw err;
    }
  }

  /**
   * Returns ticker and exchange info if the company is listed on NYSE or Nasdaq.
   * Returns null if not found or listed on another exchange (e.g. OTC, BATS).
   */
  getTradableInfo(cik: string): { ticker: string; exchange: string } | null {
    // Pad input CIK just in case it is passed as a standard 10-digit or unpadded CIK
    const paddedCik = cik.padStart(10, '0');
    const info = this.mapping.get(paddedCik);

    if (!info) {
      return null;
    }

    const exchangeLower = info.exchange.toLowerCase();
    // Verify if it trades on NYSE or Nasdaq
    if (exchangeLower === 'nyse' || exchangeLower === 'nasdaq') {
      return {
        ticker: info.ticker,
        exchange: info.exchange,
      };
    }

    return null;
  }
}
