import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig } from './types';

// Load environmental variables from .env
dotenv.config();

/**
 * Validates the loaded configurations.
 */
function validateConfig(): AppConfig {
  const secUserAgent = process.env.SEC_USER_AGENT || '';
  const secFeedUrl = process.env.SEC_FEED_URL || 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=include&count=100&output=atom';
  const pollIntervalStr = process.env.POLL_INTERVAL_MS || '30000';
  const formTypesStr = process.env.FORM_TYPES || '8-K,10-K,10-Q';
  const csvPath = process.env.CSV_PATH || 'data/filings.csv';
  const seenCachePath = process.env.SEEN_CACHE_PATH || 'data/seen_filings.json';

  // SEC requires a proper User-Agent header containing organization name/email.
  // E.g., "Company Name contact@email.com"
  if (!secUserAgent || secUserAgent.trim() === '') {
    throw new Error('SEC_USER_AGENT environment variable is required for compliance with SEC Fair Access policy.');
  }

  // Basic validation to ensure email/contact info is provided in the UA header
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (!emailRegex.test(secUserAgent)) {
    throw new Error(
      `SEC_USER_AGENT "${secUserAgent}" does not appear to contain a valid contact email address. ` +
      'Please specify a User-Agent like "CompanyName/Version (email@domain.com)".'
    );
  }

  const pollIntervalMs = parseInt(pollIntervalStr, 10);
  if (isNaN(pollIntervalMs) || pollIntervalMs < 5000) {
    throw new Error('POLL_INTERVAL_MS must be a valid number and at least 5000 (5 seconds) to avoid rate limits.');
  }

  const formTypes = formTypesStr
    .split(',')
    .map(type => type.trim())
    .filter(type => type.length > 0);

  if (formTypes.length === 0) {
    throw new Error('FORM_TYPES must contain at least one valid SEC form type (e.g. 8-K, 10-K).');
  }

  // Resolve absolute paths for the CSV and cache files
  const resolvedCsvPath = path.resolve(process.cwd(), csvPath);
  const resolvedCachePath = path.resolve(process.cwd(), seenCachePath);

  // Ensure directories exist
  const csvDir = path.dirname(resolvedCsvPath);
  if (!fs.existsSync(csvDir)) {
    fs.mkdirSync(csvDir, { recursive: true });
  }

  const cacheDir = path.dirname(resolvedCachePath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return {
    secUserAgent,
    secFeedUrl,
    pollIntervalMs,
    formTypes,
    csvPath: resolvedCsvPath,
    seenCachePath: resolvedCachePath,
  };
}

export const config = validateConfig();
export default config;
