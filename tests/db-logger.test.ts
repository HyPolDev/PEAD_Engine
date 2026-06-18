import { DBLogger } from '../src/db-logger';
import { pool } from '../src/db';
import { FilingEntry } from '../src/types';

jest.mock('../src/db', () => ({
  pool: {
    connect: jest.fn(),
  },
}));

describe('DBLogger', () => {
  let mockClient: any;
  let logger: DBLogger;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
    logger = new DBLogger();
  });

  it('should log a filing, company metadata, red flags, and guidance statements inside a transaction', async () => {
    // Mock successful SQL returns
    mockClient.query.mockImplementation((sql: string) => {
      const cleanSql = sql.trim().replace(/\s+/g, ' ');
      if (cleanSql.includes('INSERT INTO filings')) {
        return Promise.resolve({ rowCount: 1, rows: [{ accession_number: '1111' }] });
      }
      return Promise.resolve({ rowCount: 1 });
    });

    const entry: FilingEntry = {
      id: '1111',
      title: 'Apple Inc. - 10-Q',
      cik: '0000320193',
      companyName: 'Apple Inc.',
      formType: '10-Q',
      link: 'https://sec.gov/1111',
      ticker: 'AAPL',
      exchange: 'Nasdaq',
      revenueSurprisePct: 5.0,
      epsSurprisePct: 10.0,
      grossMarginPct: 0.45,
      grossMarginExpansionBps: 150,
      operatingMarginPct: 0.30,
      operatingMarginExpansionBps: 100,
      fcfToNetIncomeRatio: 1.2,
      qoeScore: 5,
      redFlagsCount: 1,
      guidanceSentiment: 'POSITIVE',
      redFlags: [
        {
          category: 'INVENTORY_BUILDUP',
          finding: 'Inventory increased slightly',
          severity: 'LOW',
        },
      ],
      guidance: {
        provided: true,
        revenueGuidance: 'Strong outlook',
        epsGuidance: 'N/A',
        sentiment: 'POSITIVE',
      },
      publishedAt: '2026-06-16T12:00:00Z',
    };

    await logger.log(entry);

    // Verify transaction blocks
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    // Verify inserts
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO companies'),
      expect.arrayContaining(['0000320193', 'AAPL', 'Apple Inc.', 'Nasdaq'])
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO filings'),
      expect.any(Array)
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO red_flags'),
      expect.arrayContaining(['1111', 'INVENTORY_BUILDUP', 'Inventory increased slightly', 'LOW'])
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO guidance'),
      expect.arrayContaining(['1111', true, 'Strong outlook', 'N/A', 'POSITIVE'])
    );
  });
});
