import { pool } from './db';
import { FilingEntry } from './types';

export class DBLogger {
  /**
   * Logs a single filing entry into the database using a transaction.
   */
  async log(entry: FilingEntry): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert/Update company metadata
      await client.query(`
        INSERT INTO companies (cik, ticker, name, exchange)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cik) DO UPDATE
        SET ticker = EXCLUDED.ticker,
            name = EXCLUDED.name,
            exchange = EXCLUDED.exchange;
      `, [entry.cik, entry.ticker || '', entry.companyName, entry.exchange || '']);

      // 2. Insert filing ledger entry
      const filingResult = await client.query(`
        INSERT INTO filings (
          accession_number, company_cik, form_type, filing_date, filing_url,
          revenue_surprise_pct, eps_surprise_pct, gross_margin_pct, gross_margin_expansion_bps,
          operating_margin_pct, operating_margin_expansion_bps, fcf_to_net_income_ratio, qoe_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (accession_number) DO NOTHING
        RETURNING accession_number;
      `, [
        entry.id,
        entry.cik,
        entry.formType,
        entry.publishedAt,
        entry.link,
        entry.revenueSurprisePct,
        entry.epsSurprisePct,
        entry.grossMarginPct,
        entry.grossMarginExpansionBps,
        entry.operatingMarginPct,
        entry.operatingMarginExpansionBps,
        entry.fcfToNetIncomeRatio,
        entry.qoeScore,
      ]);

      // Only insert red flags and guidance if the filing was successfully inserted
      if (filingResult.rowCount && filingResult.rowCount > 0) {
        const accessionNumber = entry.id;

        // 3. Insert red flags
        if (entry.redFlags && entry.redFlags.length > 0) {
          for (const flag of entry.redFlags) {
            await client.query(`
              INSERT INTO red_flags (filing_accession_number, category, finding, severity)
              VALUES ($1, $2, $3, $4);
            `, [accessionNumber, flag.category, flag.finding, flag.severity]);
          }
        }

        // 4. Insert guidance
        if (entry.guidance) {
          await client.query(`
            INSERT INTO guidance (filing_accession_number, provided, revenue_guidance, eps_guidance, sentiment)
            VALUES ($1, $2, $3, $4, $5);
          `, [
            accessionNumber,
            entry.guidance.provided,
            entry.guidance.revenueGuidance,
            entry.guidance.epsGuidance,
            entry.guidance.sentiment,
          ]);
        }
      }

      await client.query('COMMIT');
      console.log(`[DBLogger] Successfully saved filing and metadata to database: ${entry.ticker || entry.companyName} (${entry.formType})`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`[DBLogger] Failed to log filing ${entry.id} to DB: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Logs a batch of filing entries.
   */
  async logBatch(entries: FilingEntry[]): Promise<void> {
    if (entries.length === 0) return;
    console.log(`[DBLogger] Logging batch of ${entries.length} filings...`);
    for (const entry of entries) {
      await this.log(entry);
    }
  }
}
