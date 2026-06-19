import { Pool } from 'pg';

// Setup Connection Pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Initializes the database schema.
 * Creates the normalized tables and relationships if they do not exist.
 */
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[DB] Checking and initializing database schema...');
    
    // Begin transaction for initialization
    await client.query('BEGIN');

    // 1. Companies metadata table
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        cik VARCHAR(10) PRIMARY KEY,
        ticker VARCHAR(12) NOT NULL,
        name VARCHAR(255) NOT NULL,
        exchange VARCHAR(50) NOT NULL
      );
    `);

    // 2. Filings ledger
    await client.query(`
      CREATE TABLE IF NOT EXISTS filings (
        accession_number VARCHAR(50) PRIMARY KEY,
        company_cik VARCHAR(10) REFERENCES companies(cik) ON DELETE CASCADE,
        form_type VARCHAR(20) NOT NULL,
        filing_date TIMESTAMPTZ NOT NULL,
        filing_url TEXT NOT NULL,
        revenue_surprise_pct DOUBLE PRECISION,
        eps_surprise_pct DOUBLE PRECISION,
        gross_margin_pct DOUBLE PRECISION,
        gross_margin_expansion_bps INTEGER,
        operating_margin_pct DOUBLE PRECISION,
        operating_margin_expansion_bps INTEGER,
        fcf_to_net_income_ratio DOUBLE PRECISION,
        qoe_score INTEGER,
        expectation_classification VARCHAR(30),
        logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure the expectation_classification column exists in case the table already exists
    await client.query(`
      ALTER TABLE filings ADD COLUMN IF NOT EXISTS expectation_classification VARCHAR(30);
    `);

    // 3. Qualitative Red Flags table
    await client.query(`
      CREATE TABLE IF NOT EXISTS red_flags (
        id SERIAL PRIMARY KEY,
        filing_accession_number VARCHAR(50) REFERENCES filings(accession_number) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL,
        finding TEXT NOT NULL,
        severity VARCHAR(10) NOT NULL
      );
    `);

    // 4. Forward Guidance table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guidance (
        id SERIAL PRIMARY KEY,
        filing_accession_number VARCHAR(50) REFERENCES filings(accession_number) ON DELETE CASCADE,
        provided BOOLEAN NOT NULL,
        revenue_guidance TEXT,
        eps_guidance TEXT,
        sentiment VARCHAR(20)
      );
    `);

    await client.query('COMMIT');
    console.log('[DB] Database schema is initialized and verified.');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`[DB] Failed to initialize database: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}
