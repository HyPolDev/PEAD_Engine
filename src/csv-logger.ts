import * as fs from 'fs';
import { FilingEntry } from './types';

/**
 * Escapes a string value to be RFC 4180 compliant for CSV files.
 */
function escapeCSV(val: string | undefined): string {
  if (val === undefined || val === null) {
    return '';
  }
  const str = String(val).trim();
  // If the value contains quotes, commas, or newlines, wrap it in double quotes and escape existing quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Handles append-only logging of filings into a CSV format.
 */
export class CSVLogger {
  private csvPath: string;
  private headers = [
    'AccessionNumber',
    'CIK',
    'Ticker',
    'Exchange',
    'CompanyName',
    'FormType',
    'FilingDate',
    'FilingUrl',
    'RevenueSurprisePct',
    'EpsSurprisePct',
    'GrossMarginPct',
    'GrossMarginExpansionBps',
    'OperatingMarginPct',
    'OperatingMarginExpansionBps',
    'FcfToNetIncomeRatio',
    'QoEScore',
    'RedFlagsCount',
    'GuidanceSentiment',
    'LoggedAt',
  ];

  constructor(csvPath: string) {
    this.csvPath = csvPath;
  }

  /**
   * Initializes the CSV file. If it doesn't exist, writes the header.
   */
  private async initCSV(): Promise<void> {
    if (!fs.existsSync(this.csvPath)) {
      const headerLine = this.headers.join(',') + '\n';
      await fs.promises.writeFile(this.csvPath, headerLine, 'utf8');
      console.log(`[CSVLogger] Created new CSV file at: ${this.csvPath}`);
    }
  }

  /**
   * Appends a filing entry to the CSV file.
   */
  async log(entry: FilingEntry): Promise<void> {
    await this.initCSV();

    const loggedAt = new Date().toISOString();
    const row = [
      entry.id,
      entry.cik,
      entry.ticker,
      entry.exchange,
      entry.companyName,
      entry.formType,
      entry.publishedAt,
      entry.link,
      entry.revenueSurprisePct !== undefined ? String(entry.revenueSurprisePct) : undefined,
      entry.epsSurprisePct !== undefined ? String(entry.epsSurprisePct) : undefined,
      entry.grossMarginPct !== undefined ? String(entry.grossMarginPct) : undefined,
      entry.grossMarginExpansionBps !== undefined ? String(entry.grossMarginExpansionBps) : undefined,
      entry.operatingMarginPct !== undefined ? String(entry.operatingMarginPct) : undefined,
      entry.operatingMarginExpansionBps !== undefined ? String(entry.operatingMarginExpansionBps) : undefined,
      entry.fcfToNetIncomeRatio !== undefined ? String(entry.fcfToNetIncomeRatio) : undefined,
      entry.qoeScore !== undefined ? String(entry.qoeScore) : undefined,
      entry.redFlagsCount !== undefined ? String(entry.redFlagsCount) : undefined,
      entry.guidanceSentiment,
      loggedAt,
    ];

    const csvRow = row.map(escapeCSV).join(',') + '\n';
    await fs.promises.appendFile(this.csvPath, csvRow, 'utf8');
    console.log(`[CSVLogger] Logged filing to CSV: ${entry.companyName} (${entry.formType}) CIK:${entry.cik}`);
  }

  /**
   * Appends a batch of filing entries to the CSV file.
   */
  async logBatch(entries: FilingEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.initCSV();

    const loggedAt = new Date().toISOString();
    let rows = '';

    for (const entry of entries) {
      const row = [
        entry.id,
        entry.cik,
        entry.ticker,
        entry.exchange,
        entry.companyName,
        entry.formType,
        entry.publishedAt,
        entry.link,
        entry.revenueSurprisePct !== undefined ? String(entry.revenueSurprisePct) : undefined,
        entry.epsSurprisePct !== undefined ? String(entry.epsSurprisePct) : undefined,
        entry.grossMarginPct !== undefined ? String(entry.grossMarginPct) : undefined,
        entry.grossMarginExpansionBps !== undefined ? String(entry.grossMarginExpansionBps) : undefined,
        entry.operatingMarginPct !== undefined ? String(entry.operatingMarginPct) : undefined,
        entry.operatingMarginExpansionBps !== undefined ? String(entry.operatingMarginExpansionBps) : undefined,
        entry.fcfToNetIncomeRatio !== undefined ? String(entry.fcfToNetIncomeRatio) : undefined,
        entry.qoeScore !== undefined ? String(entry.qoeScore) : undefined,
        entry.redFlagsCount !== undefined ? String(entry.redFlagsCount) : undefined,
        entry.guidanceSentiment,
        loggedAt,
      ];
      rows += row.map(escapeCSV).join(',') + '\n';
    }

    await fs.promises.appendFile(this.csvPath, rows, 'utf8');
    console.log(`[CSVLogger] Logged batch of ${entries.length} filings to CSV.`);
  }
}
