import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';

/**
 * A rate-limiting utility to ensure we stay well below the SEC's limit of 10 requests per second.
 */
class RateLimiter {
  private lastRequestTime = 0;
  private minIntervalMs: number;

  constructor(maxRequestsPerSecond = 5) {
    // 5 requests per second is a safe threshold (200ms per request)
    this.minIntervalMs = Math.ceil(1000 / maxRequestsPerSecond);
  }

  /**
   * Resolves when it is safe to execute the next request.
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }
}

/**
 * Client for interacting with the SEC EDGAR API.
 * Designed to handle compliance, rate limits, and network errors.
 */
export class SECClient {
  private axiosInstance: AxiosInstance;
  private limiter: RateLimiter;

  constructor(userAgent: string, timeoutMs = 15000) {
    this.limiter = new RateLimiter();
    this.axiosInstance = axios.create({
      timeout: timeoutMs,
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate', // SEC prefers compressed payloads
      },
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    });
  }

  /**
   * Fetches raw string data from a given SEC URL (e.g., the Atom feed).
   * Respects rate limiting and handles basic errors.
   */
  async fetchFeed(url: string): Promise<string> {
    await this.limiter.acquire();

    try {
      console.log(`[SECClient] Fetching feed from: ${url}`);
      const response = await this.axiosInstance.get(url);
      const data = response.data;
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error: any) {
      if (error.response) {
        // The request was made and the server responded with a status code outside the 2xx range
        const status = error.response.status;
        if (status === 429) {
          console.error('[SECClient] Rate limit hit (HTTP 429). SEC has throttled our requests.');
        } else {
          console.error(`[SECClient] SEC server responded with status code: ${status}`);
        }
      } else if (error.request) {
        // The request was made but no response was received
        console.error('[SECClient] No response received from SEC server. Network issue?');
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error(`[SECClient] Request error: ${error.message}`);
      }
      throw error;
    }
  }
}
