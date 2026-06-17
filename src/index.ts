import { config } from './config';
import { Poller } from './poller';
import { CSVLogger } from './csv-logger';

async function main() {
  console.log('===================================================');
  console.log('  PEAD Engine - SEC EDGAR Filings Listener         ');
  console.log('===================================================');
  console.log(`Configured Forms:    ${config.formTypes.join(', ')}`);
  console.log(`Polling Feed URL:    ${config.secFeedUrl}`);
  console.log(`Polling Interval:    ${config.pollIntervalMs} ms`);
  console.log(`Output CSV Path:     ${config.csvPath}`);
  console.log(`Seen Cache Path:     ${config.seenCachePath}`);
  console.log(`User-Agent:          ${config.secUserAgent}`);
  console.log('---------------------------------------------------');

  const csvLogger = new CSVLogger(config.csvPath);
  const poller = new Poller(config);

  // Wire up the event emitter to the CSV logger
  poller.on('filings', async (newFilings) => {
    try {
      await csvLogger.logBatch(newFilings);
    } catch (err: any) {
      console.error(`[Main] Error writing to CSV file: ${err.message}`);
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
