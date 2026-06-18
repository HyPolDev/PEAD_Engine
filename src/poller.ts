import * as fs from 'fs';
import { EventEmitter } from 'events';
import { AppConfig, FilingEntry } from './types';
import { SECClient } from './sec-client';
import { FeedParser } from './feed-parser';
import { TickerMapper } from './ticker-mapper';

export class Poller extends EventEmitter {
  private config: AppConfig;
  private client: SECClient;
  private parser: FeedParser;
  private tickerMapper: TickerMapper;
  private seenIds: Set<string> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isPolling = false;

  constructor(config: AppConfig, tickerMapper: TickerMapper) {
    super();
    this.config = config;
    this.client = new SECClient(config.secUserAgent);
    this.parser = new FeedParser();
    this.tickerMapper = tickerMapper;
    this.loadCache();
  }

  /**
   * Loads previously seen filing accession numbers from local cache.
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.config.seenCachePath)) {
        const raw = fs.readFileSync(this.config.seenCachePath, 'utf8');
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          this.seenIds = new Set(ids);
          console.log(`[Poller] Loaded ${this.seenIds.size} seen filing IDs from cache.`);
        }
      }
    } catch (err: any) {
      console.warn(`[Poller] Failed to load seen cache: ${err.message}. Starting fresh.`);
    }
  }

  /**
   * Saves the current set of seen filing IDs to the local cache.
   * Keeps the cache bounded to the latest 5000 items.
   */
  private saveCache(): void {
    try {
      // Limit size to prevent infinite growth
      let idsArray = Array.from(this.seenIds);
      if (idsArray.length > 5000) {
        idsArray = idsArray.slice(idsArray.length - 5000);
        this.seenIds = new Set(idsArray);
      }
      fs.writeFileSync(this.config.seenCachePath, JSON.stringify(idsArray), 'utf8');
    } catch (err: any) {
      console.error(`[Poller] Failed to save seen cache: ${err.message}`);
    }
  }

  /**
   * Starts the polling timer.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Poller] Started SEC EDGAR listener. Polling every ${this.config.pollIntervalMs} ms.`);

    // Perform an immediate poll, then schedule
    this.poll();
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  /**
   * Stops the polling timer.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Poller] Stopped SEC EDGAR listener.');
  }

  /**
   * The core poll cycle. Fetches, parses, filters, deduplicates, and reports.
   */
  private async poll(): Promise<void> {
    if (this.isPolling) {
      console.warn('[Poller] Previous poll cycle is still in progress. Skipping this tick.');
      return;
    }

    this.isPolling = true;
    try {
      const xmlData = await this.client.fetchFeed(this.config.secFeedUrl);
      const parsedFilings = this.parser.parse(xmlData);

      const newFilings: FilingEntry[] = [];
      const isFirstRun = this.seenIds.size === 0;

      for (const filing of parsedFilings) {
        // Deduplicate
        if (this.seenIds.has(filing.id)) {
          continue;
        }

        // Add to seen list
        this.seenIds.add(filing.id);

        // Filter by target forms
        // Checks exact match OR matching amendments (e.g. "8-K/A" matches "8-K")
        const isTargetForm = this.config.formTypes.some(
          targetType =>
            filing.formType === targetType ||
            filing.formType.startsWith(targetType + '/')
        );

        if (isTargetForm) {
          const tradeInfo = this.tickerMapper.getTradableInfo(filing.cik);
          if (tradeInfo) {
            filing.ticker = tradeInfo.ticker;
            filing.exchange = tradeInfo.exchange;
            newFilings.push(filing);
          }
        }
      }

      // If we found new filings and it's not the initial load of a blank cache, trigger events.
      // (If the cache was empty, we avoid dumping 100 historical filings into the CSV at once,
      // but let's log them regardless as the user wants them. Actually, let's write them anyway
      // but log a notification that it is seeding/getting latest).
      if (newFilings.length > 0) {
        if (isFirstRun) {
          console.log(`[Poller] Initializing seen cache. Logging ${newFilings.length} matching recent filings found in the feed.`);
        } else {
          console.log(`[Poller] Found ${newFilings.length} new matching filings.`);
        }
        
        // Emit events so other modules can handle the filings
        this.emit('filings', newFilings);
        this.saveCache();
      } else {
        console.log('[Poller] No new matching filings found in this cycle.');
      }
    } catch (error: any) {
      console.error(`[Poller] Error occurred during poll cycle: ${error.message}`);
    } finally {
      this.isPolling = false;
    }
  }
}
