import * as fs from 'fs';
import * as path from 'path';
import { Poller } from '../src/poller';
import { AppConfig, FilingEntry } from '../src/types';
import { SECClient } from '../src/sec-client';
import { FeedParser } from '../src/feed-parser';

// Mock the SEC client and parser modules
jest.mock('../src/sec-client');
jest.mock('../src/feed-parser');

describe('Poller', () => {
  const testCachePath = path.resolve(__dirname, 'test_seen_cache.json');
  const testCsvPath = path.resolve(__dirname, 'test_filings.csv');

  const mockConfig: AppConfig = {
    secUserAgent: 'TestAgent/1.0 (test@example.com)',
    secFeedUrl: 'https://example.com/feed',
    pollIntervalMs: 10000,
    formTypes: ['8-K', '10-K'],
    csvPath: testCsvPath,
    seenCachePath: testCachePath,
  };

  let mockClientInstance: jest.Mocked<SECClient>;
  let mockParserInstance: jest.Mocked<FeedParser>;

  beforeEach(() => {
    // Reset filesystem mocks/files
    if (fs.existsSync(testCachePath)) {
      fs.unlinkSync(testCachePath);
    }

    mockClientInstance = new SECClient('', 0) as jest.Mocked<SECClient>;
    mockParserInstance = new FeedParser() as jest.Mocked<FeedParser>;

    (SECClient as jest.Mock).mockImplementation(() => mockClientInstance);
    (FeedParser as jest.Mock).mockImplementation(() => mockParserInstance);
  });

  afterEach(() => {
    if (fs.existsSync(testCachePath)) {
      fs.unlinkSync(testCachePath);
    }
  });

  it('should pull, parse, filter, and emit new filings', async () => {
    const poller = new Poller(mockConfig);

    const mockXml = '<feed>mock</feed>';
    mockClientInstance.fetchFeed.mockResolvedValue(mockXml);

    const parsedMockEntries: FilingEntry[] = [
      {
        id: '1111',
        title: '8-K - Apple Inc.',
        link: 'https://sec.gov/1111',
        formType: '8-K',
        companyName: 'Apple Inc.',
        cik: '0000320193',
        publishedAt: '2026-06-16T12:00:00Z',
      },
      {
        id: '2222',
        title: '4 - Insiders',
        link: 'https://sec.gov/2222',
        formType: '4', // Should be filtered out
        companyName: 'Apple Inc.',
        cik: '0000320193',
        publishedAt: '2026-06-16T12:01:00Z',
      },
      {
        id: '3333',
        title: '10-K - Microsoft Corp.',
        link: 'https://sec.gov/3333',
        formType: '10-K',
        companyName: 'Microsoft Corp.',
        cik: '0000789019',
        publishedAt: '2026-06-16T12:02:00Z',
      },
    ];

    mockParserInstance.parse.mockReturnValue(parsedMockEntries);

    const emittedFilings: FilingEntry[][] = [];
    poller.on('filings', (filings) => {
      emittedFilings.push(filings);
    });

    // Run the internal poll method
    await (poller as any).poll();

    // Verify it fetched the feed and parsed it
    expect(mockClientInstance.fetchFeed).toHaveBeenCalledWith(mockConfig.secFeedUrl);
    expect(mockParserInstance.parse).toHaveBeenCalledWith(mockXml);

    // Verify we only emitted the 8-K and 10-K filings, filtering out form 4
    expect(emittedFilings).toHaveLength(1);
    expect(emittedFilings[0]).toHaveLength(2);
    expect(emittedFilings[0][0].id).toBe('1111');
    expect(emittedFilings[0][1].id).toBe('3333');

    // Verify they are saved to cache
    expect(fs.existsSync(testCachePath)).toBe(true);
    const cachedIds = JSON.parse(fs.readFileSync(testCachePath, 'utf8'));
    expect(cachedIds).toContain('1111');
    expect(cachedIds).toContain('2222'); // Form 4 is still marked "seen" to prevent re-processing
    expect(cachedIds).toContain('3333');
  });

  it('should deduplicate already seen filings', async () => {
    // Write pre-existing cache file
    fs.writeFileSync(testCachePath, JSON.stringify(['1111']), 'utf8');

    const poller = new Poller(mockConfig);

    mockClientInstance.fetchFeed.mockResolvedValue('<feed></feed>');
    const parsedMockEntries: FilingEntry[] = [
      {
        id: '1111', // already seen
        title: '8-K - Apple Inc.',
        link: 'https://sec.gov/1111',
        formType: '8-K',
        companyName: 'Apple Inc.',
        cik: '0000320193',
        publishedAt: '2026-06-16T12:00:00Z',
      },
      {
        id: '4444', // new
        title: '8-K - Google LLC',
        link: 'https://sec.gov/4444',
        formType: '8-K',
        companyName: 'Google LLC',
        cik: '0001652044',
        publishedAt: '2026-06-16T12:05:00Z',
      },
    ];
    mockParserInstance.parse.mockReturnValue(parsedMockEntries);

    const emittedFilings: FilingEntry[][] = [];
    poller.on('filings', (filings) => {
      emittedFilings.push(filings);
    });

    await (poller as any).poll();

    // Verify we only emitted the new filing
    expect(emittedFilings).toHaveLength(1);
    expect(emittedFilings[0]).toHaveLength(1);
    expect(emittedFilings[0][0].id).toBe('4444');
  });
});
