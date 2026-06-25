import * as fs from 'fs';
import { EventEmitter } from 'events';
import { AppConfig, FilingEntry } from './types';
import { SECClient } from './sec-client';
import { FeedParser } from './feed-parser';
import { TickerMapper } from './ticker-mapper';
import { FMPClient } from './fmp-client';
import { LLMEvaluator } from './llm-evaluator';
import * as cheerio from 'cheerio';

export class Poller extends EventEmitter {
  private config: AppConfig;
  private client: SECClient;
  private parser: FeedParser;
  private tickerMapper: TickerMapper;
  private fmpClient: FMPClient;
  private llmEvaluator: LLMEvaluator;
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
    this.fmpClient = new FMPClient();
    this.llmEvaluator = new LLMEvaluator();
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

            try {
              // 1. Fetch raw landing page HTML and resolve true main filing URL
              console.log(`[Poller] Downloading landing page HTML for: ${tradeInfo.ticker}`);
              const landingHtml = await this.client.fetchFeed(filing.link);
              
              let rawHtml = landingHtml;
              const mainUrl = this.getMainFilingUrl(landingHtml, filing.formType);
              if (mainUrl) {
                console.log(`[Poller] Resolved main filing URL: ${mainUrl}. Downloading main filing HTML.`);
                rawHtml = await this.client.fetchFeed(mainUrl);
                filing.link = mainUrl; // Update link to direct document URL for logging
              } else {
                console.warn(`[Poller] Could not resolve main filing URL for ${tradeInfo.ticker} (${filing.formType}). Using landing page as fallback.`);
              }

              // 2. Fetch pre-event consensus expectations from FMP
              let estimate = null;
              try {
                console.log(`[Poller] Fetching baseline expectations from FMP for: ${tradeInfo.ticker}`);
                const period = filing.formType.includes('10-K') ? 'annual' : 'quarter';
                estimate = await this.fmpClient.getEstimateForFiling(tradeInfo.ticker, filing.publishedAt, period);
              } catch (fmpErr: any) {
                console.warn(`[Poller] Failed to fetch FMP expectations for ${tradeInfo.ticker} (proceeding without expectations): ${fmpErr.message}`);
              }

              // 3. Call LLM Evaluator for structural QoE analysis
              const { result: llmResult, prompt, responseRaw } = await this.llmEvaluator.evaluate(tradeInfo.ticker, rawHtml, estimate, filing.formType);

              // 4. Enrich filing with QoE and qualitative metrics
              filing.revenueSurprisePct = llmResult.qoe_metrics.revenue_surprise_pct;
              filing.epsSurprisePct = llmResult.qoe_metrics.eps_surprise_pct;
              filing.grossMarginPct = llmResult.qoe_metrics.gross_margin_pct;
              filing.grossMarginExpansionBps = llmResult.qoe_metrics.gross_margin_expansion_bps;
              filing.operatingMarginPct = llmResult.qoe_metrics.operating_margin_pct;
              filing.operatingMarginExpansionBps = llmResult.qoe_metrics.operating_margin_expansion_bps;
              filing.fcfToNetIncomeRatio = llmResult.qoe_metrics.fcf_to_net_income_ratio;
              filing.qoeScore = llmResult.qoe_score;
              filing.redFlagsCount = llmResult.qualitative_analysis.red_flags.length;
              filing.guidanceSentiment = llmResult.qualitative_analysis.forward_guidance.sentiment;
              filing.expectationClassification = llmResult.expectation_classification;
              filing.personalEvaluation = llmResult.personal_evaluation;
              filing.llmPrompt = prompt;
              filing.llmResponse = responseRaw;
              
              // Detailed relational entities
              filing.redFlags = llmResult.qualitative_analysis.red_flags;
              filing.guidance = {
                provided: llmResult.qualitative_analysis.forward_guidance.provided,
                revenueGuidance: llmResult.qualitative_analysis.forward_guidance.revenue_guidance,
                epsGuidance: llmResult.qualitative_analysis.forward_guidance.eps_guidance,
                sentiment: llmResult.qualitative_analysis.forward_guidance.sentiment,
              };

              console.log(`[Poller] LLM evaluation complete for ${tradeInfo.ticker}. QoE Score: ${filing.qoeScore}/5`);
            } catch (err: any) {
              console.error(`[Poller] Failed to perform LLM analysis on filing ${filing.id} for ${tradeInfo.ticker}: ${err.message}`);
              // Fallback to empty properties so we don't completely block log writing on LLM failure
            }

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

  /**
   * Parses the SEC EDGAR index HTML to extract the true filing document URL using Cheerio DOM selectors.
   */
  private getMainFilingUrl(html: string, targetForm: string): string | null {
    try {
      const $ = cheerio.load(html);
      let resolvedUrl: string | null = null;
      
      const targetFormLower = targetForm.toLowerCase();
      const baseFormLower = targetForm.split('/')[0].toLowerCase();

      // Find all rows in the table with class 'tableFile'
      // Standard SEC EDGAR files list is formatted in a <table class="tableFile">
      const rows = $('table.tableFile tr');
      
      rows.each((_, row) => {
        if (resolvedUrl) return; // Break if already found
        
        const cols = $(row).find('td');
        if (cols.length < 4) return; // Need at least 4 columns (type is index 3)

        // Type column (typically index 3)
        const typeText = $(cols[3]).text().trim().toLowerCase();
        
        // Check if the cell type text matches target form or its base form (e.g. 10-K or 10-K/A)
        const isMatch = typeText === targetFormLower || 
                        typeText === `form ${targetFormLower}` ||
                        typeText === baseFormLower ||
                        typeText === `form ${baseFormLower}`;

        if (isMatch) {
          // Document link column (typically index 2) contains the anchor
          const linkElement = $(cols[2]).find('a');
          const href = linkElement.attr('href');
          if (href) {
            resolvedUrl = href;
          }
        }
      });

      // Fallback: If no exact form match was found, grab the first file in the table ending in .htm or .html
      if (!resolvedUrl) {
        rows.each((_, row) => {
          if (resolvedUrl) return;
          const cols = $(row).find('td');
          if (cols.length < 3) return; // Anchor link is in index 2

          const linkElement = $(cols[2]).find('a');
          const href = linkElement.attr('href');
          if (href && (href.toLowerCase().endsWith('.htm') || href.toLowerCase().endsWith('.html'))) {
            resolvedUrl = href;
          }
        });
      }

      if (resolvedUrl) {
        let url = resolvedUrl as string;
        // Strip the iXBRL viewer prefix if present
        if (url.includes('ix?doc=')) {
          url = url.split('ix?doc=').pop() || url;
        }
        if (url.startsWith('/')) {
          url = 'https://www.sec.gov' + url;
        }
        return url;
      }
    } catch (err: any) {
      console.error(`[Poller] Cheerio parsing failed: ${err.message}`);
    }
    return null;
  }
}
