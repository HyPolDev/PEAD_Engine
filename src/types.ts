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
  /** Extracted ticker symbol (e.g. AAPL) */
  ticker?: string;
  /** Exchange where the stock trades (e.g. NYSE, Nasdaq) */
  exchange?: string;
  /** Revenue Surprise Percentage compared to consensus */
  revenueSurprisePct?: number;
  /** EPS Surprise Percentage compared to consensus */
  epsSurprisePct?: number;
  /** Actual Gross Margin percentage */
  grossMarginPct?: number;
  /** Gross Margin Expansion/Contraction relative to expected in basis points */
  grossMarginExpansionBps?: number;
  /** Actual Operating Margin percentage */
  operatingMarginPct?: number;
  /** Operating Margin Expansion/Contraction relative to expected in basis points */
  operatingMarginExpansionBps?: number;
  /** Free Cash Flow divided by Net Income */
  fcfToNetIncomeRatio?: number;
  /** Overall Quality of Earnings score (1 to 5) */
  qoeScore?: number;
  /** Number of qualitative accounting/operational red flags found */
  redFlagsCount?: number;
  /** Forward Guidance Sentiment (POSITIVE, NEUTRAL, NEGATIVE, N/A) */
  guidanceSentiment?: string;
  /** Expectation classification based on QoE and consensus metrics */
  expectationClassification?: 'highly beats expectations' | 'more or less meets expectations' | 'falls way short';
  /** Detailed qualitative red flags extracted from the filing */
  redFlags?: Array<{
    category: string;
    finding: string;
    severity: string;
  }>;
  /** Detailed forward guidance information */
  guidance?: {
    provided: boolean;
    revenueGuidance: string;
    epsGuidance: string;
    sentiment: string;
  };
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
