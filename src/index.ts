import { config } from './config';
import { Poller } from './poller';
import { TickerMapper } from './ticker-mapper';
import { initDatabase } from './db';
import { DBLogger } from './db-logger';

async function main() {
  console.log('===================================================');
  console.log('  PEAD Engine - SEC EDGAR Filings Listener         ');
  console.log('===================================================');
  console.log(`Configured Forms:    ${config.formTypes.join(', ')}`);
  console.log(`Polling Feed URL:    ${config.secFeedUrl}`);
  console.log(`Polling Interval:    ${config.pollIntervalMs} ms`);
  console.log(`User-Agent:          ${config.secUserAgent}`);
  console.log('---------------------------------------------------');

  console.log('[Main] Initializing database...');
  await initDatabase();

  console.log('[Main] Loading Ticker-to-Exchange mappings...');
  const tickerMapper = new TickerMapper();
  await tickerMapper.initialize();

  const dbLogger = new DBLogger();
  const poller = new Poller(config, tickerMapper);

  // Wire up the event emitter to the database logger
  poller.on('filings', async (newFilings) => {
    try {
      await dbLogger.logBatch(newFilings);
    } catch (err: any) {
      console.error(`[Main] Error writing to database: ${err.message}`);
    }
  });

  // Start polling
  poller.start();

  // Handle graceful shutdowns
  const shutdown = () => {
    console.log('\n[Main] Shutdown signal received. Cleaning up...');
    poller.stop();
    console.log('[Main] Shutdown complete. Goodbye.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[Main] Critical failure during startup:', error);
  process.exit(1);
});
