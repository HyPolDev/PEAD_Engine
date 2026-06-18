import * as fs from 'fs';
import * as path from 'path';
import { TickerMapper } from '../src/ticker-mapper';
import { SECClient } from '../src/sec-client';

// Mock the SEC client
jest.mock('../src/sec-client');

describe('TickerMapper', () => {
  const testCachePath = path.resolve(__dirname, 'test_tickers_exchange.json');
  let mockClientInstance: jest.Mocked<SECClient>;

  const mockPayload = {
    fields: ['cik', 'name', 'ticker', 'exchange'],
    data: [
      [320193, 'Apple Inc.', 'AAPL', 'Nasdaq'],
      [23194, 'COMSTOCK RESOURCES INC', 'CRK', 'NYSE'],
      [1143362, 'OTC Filer Corp', 'OTCF', 'OTC'], // OTC (not tradable)
      [999999, 'BATS Filer Corp', 'BATSF', 'BATS'], // BATS (not tradable)
    ],
  };

  beforeEach(() => {
    if (fs.existsSync(testCachePath)) {
      fs.unlinkSync(testCachePath);
    }
    mockClientInstance = new SECClient('', 0) as jest.Mocked<SECClient>;
    (SECClient as jest.Mock).mockImplementation(() => mockClientInstance);
  });

  afterEach(() => {
    if (fs.existsSync(testCachePath)) {
      fs.unlinkSync(testCachePath);
    }
  });

  it('should fetch from SEC and save to cache if cache is missing', async () => {
    mockClientInstance.fetchFeed.mockResolvedValue(JSON.stringify(mockPayload));

    const mapper = new TickerMapper(testCachePath);
    await mapper.initialize();

    expect(mockClientInstance.fetchFeed).toHaveBeenCalled();
    expect(fs.existsSync(testCachePath)).toBe(true);

    const infoAAPL = mapper.getTradableInfo('0000320193');
    expect(infoAAPL).toEqual({ ticker: 'AAPL', exchange: 'Nasdaq' });

    const infoCRK = mapper.getTradableInfo('0000023194');
    expect(infoCRK).toEqual({ ticker: 'CRK', exchange: 'NYSE' });

    const infoOTC = mapper.getTradableInfo('0001143362');
    expect(infoOTC).toBeNull(); // OTC should be skipped
  });

  it('should load from cache and NOT fetch from SEC if cache is fresh', async () => {
    fs.writeFileSync(testCachePath, JSON.stringify(mockPayload), 'utf8');

    const mapper = new TickerMapper(testCachePath);
    await mapper.initialize();

    expect(mockClientInstance.fetchFeed).not.toHaveBeenCalled();

    const infoAAPL = mapper.getTradableInfo('320193'); // should handle unpadded CIK strings too
    expect(infoAAPL).toEqual({ ticker: 'AAPL', exchange: 'Nasdaq' });
  });

  it('should fetch from SEC and update cache if cache is stale', async () => {
    fs.writeFileSync(testCachePath, JSON.stringify(mockPayload), 'utf8');
    
    // Set file modification time to 25 hours ago
    const mtime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(testCachePath, mtime, mtime);

    mockClientInstance.fetchFeed.mockResolvedValue(JSON.stringify(mockPayload));

    const mapper = new TickerMapper(testCachePath);
    await mapper.initialize();

    expect(mockClientInstance.fetchFeed).toHaveBeenCalled();
  });
});
