/**
 * Represents a parsed SEC EDGAR filing entry.
 */
export interface FilingEntry {
  /** Unique accession number (e.g. URN or accession-number in entry ID) */
  id: string;
  /** Full title of the filing entry */
  title: string;
  /** Link to the filing index/document page on SEC */
  link: string;
  /** Extracted form type (e.g. 8-K, 10-K, 10-Q) */
  formType: string;
  /** Extracted company name */
  companyName: string;
  /** Extracted 10-digit Central Index Key (CIK) */
  cik: string;
  /** The timestamp when the filing was published/accepted */
  publishedAt: string;
}

/**
 * System configuration settings.
 */
export interface AppConfig {
  /** SEC Fair Access compliance User-Agent */
  secUserAgent: string;
  /** URL of the SEC Atom Feed */
  secFeedUrl: string;
  /** Frequency to poll the feed in milliseconds */
  pollIntervalMs: number;
  /** Target form types to capture (e.g. ['8-K', '10-K', '10-Q']) */
  formTypes: string[];
  /** File path where matched filings are logged */
  csvPath: string;
  /** File path where seen filing IDs are cached to prevent duplication across runs */
  seenCachePath: string;
}
