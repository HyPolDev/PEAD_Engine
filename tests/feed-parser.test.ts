import { FeedParser } from '../src/feed-parser';

describe('FeedParser', () => {
  let parser: FeedParser;

  beforeEach(() => {
    parser = new FeedParser();
  });

  const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>EDGAR Filings - Latest Filings</title>
  <entry>
    <title>8-K - Apple Inc. (0000320193) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-20260616.htm"/>
    <updated>2026-06-16T14:00:00-04:00</updated>
    <category scheme="http://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2026-06-16:accession-number=0000320193-26-000001</id>
  </entry>
  <entry>
    <title>10-K - MICROSOFT CORP (0000789019) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/789019/000078901926000002/msft-20260616.htm"/>
    <updated>2026-06-16T14:05:00-04:00</updated>
    <category scheme="http://www.sec.gov/" label="form type" term="10-K"/>
    <id>urn:tag:sec.gov,2026-06-16:accession-number=0000789019-26-000002</id>
  </entry>
</feed>`;

  it('should parse valid SEC Atom feed and return FilingEntry array', () => {
    const filings = parser.parse(mockXml);

    expect(filings).toHaveLength(2);

    expect(filings[0]).toEqual({
      id: '0000320193-26-000001',
      title: '8-K - Apple Inc. (0000320193) (Filer)',
      link: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-20260616.htm',
      formType: '8-K',
      companyName: 'Apple Inc.',
      cik: '0000320193',
      publishedAt: '2026-06-16T14:00:00-04:00',
    });

    expect(filings[1]).toEqual({
      id: '0000789019-26-000002',
      title: '10-K - MICROSOFT CORP (0000789019) (Filer)',
      link: 'https://www.sec.gov/Archives/edgar/data/789019/000078901926000002/msft-20260616.htm',
      formType: '10-K',
      companyName: 'MICROSOFT CORP',
      cik: '0000789019',
      publishedAt: '2026-06-16T14:05:00-04:00',
    });
  });

  it('should return empty list on empty or invalid XML', () => {
    expect(parser.parse('')).toEqual([]);
    expect(parser.parse('<invalid></invalid>')).toEqual([]);
  });

  it('should handle title parsing fallbacks if regex does not match perfectly', () => {
    const nonStandardXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Apple Inc. (320193)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-20260616.htm"/>
    <updated>2026-06-16T14:00:00-04:00</updated>
    <category scheme="http://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2026-06-16:accession-number=0000320193-26-000001</id>
  </entry>
</feed>`;

    const filings = parser.parse(nonStandardXml);
    expect(filings).toHaveLength(1);
    expect(filings[0].cik).toBe('0000320193'); // should pad CIK from 320193 to 0000320193
  });
});
