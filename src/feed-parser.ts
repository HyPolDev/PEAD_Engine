import { XMLParser } from 'fast-xml-parser';
import { FilingEntry } from './types';

/**
 * Normalizes an XML element that might be a single value, an array, or undefined
 * into a guaranteed array of values.
 */
function ensureArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parser for the SEC EDGAR Atom Feed.
 */
export class FeedParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: false, // keep everything as strings
      processEntities: false,     // disable entity processing to avoid expansion limit errors with HTML entities
    });
  }

  /**
   * Parses the raw XML feed string into a list of structured FilingEntry objects.
   */
  parse(xmlString: string): FilingEntry[] {
    if (!xmlString || xmlString.trim() === '') {
      return [];
    }

    const jsonObj = this.parser.parse(xmlString);
    if (!jsonObj || !jsonObj.feed) {
      console.warn('[FeedParser] Invalid XML format: root <feed> element not found.');
      return [];
    }

    const rawEntries = ensureArray(jsonObj.feed.entry);
    const parsedEntries: FilingEntry[] = [];

    for (const entry of rawEntries) {
      if (!entry) continue;

      try {
        const id = entry.id || '';
        const title = entry.title || '';
        const updated = entry.updated || entry.published || new Date().toISOString();

        // 1. Extract Form Type from <category> element
        let formType = '';
        if (entry.category) {
          const categories = ensureArray(entry.category);
          // Look for category containing form type (usually label="form type")
          const formTypeCategory = categories.find(
            (c: any) => c['@_label'] === 'form type' || c['@_term']
          );
          if (formTypeCategory) {
            formType = formTypeCategory['@_term'] || '';
          }
        }

        // 2. Extract Link from <link> element
        let link = '';
        if (entry.link) {
          const links = ensureArray(entry.link);
          // Prefer link with rel="alternate" or type="text/html", fallback to the first link's href
          const alternateLink = links.find((l: any) => l['@_rel'] === 'alternate') || links[0];
          if (alternateLink) {
            link = alternateLink['@_href'] || '';
          }
        }

        // 3. Parse Company Name and CIK from <title> using regex
        // Expected format: "FORM - Company Name (CIK) (Filer)" or "FORM - Company Name (CIK)"
        // Example: "8-K - Apple Inc. (0000320193) (Filer)"
        let companyName = '';
        let cik = '';

        // Match regex: captures form type (Group 1), company name (Group 2), CIK (Group 3)
        const titleRegex = /^([^\s]+)\s+-\s+(.+)\s+\((\d+)\)(?:\s+\([a-zA-Z]+\))?$/;
        const match = title.trim().match(titleRegex);

        if (match) {
          // If we couldn't parse the form type from category, fallback to title parsing
          if (!formType) {
            formType = match[1];
          }
          companyName = match[2].trim();
          cik = match[3].padStart(10, '0'); // pad to standard 10 digits
        } else {
          // If regex doesn't match perfectly, attempt weaker parsing
          console.warn(`[FeedParser] Title regex did not match title format: "${title}"`);
          
          // Try to extract CIK from parenthesized numbers at the end
          const cikMatch = title.match(/\((\d{7,10})\)/);
          if (cikMatch) {
            cik = cikMatch[1].padStart(10, '0');
          }

          // Try to extract form type before the first dash
          const dashIndex = title.indexOf('-');
          if (dashIndex > 0) {
            const potentialForm = title.substring(0, dashIndex).trim();
            if (!formType) {
              formType = potentialForm;
            }
          }
        }

        // Clean up accession number / id
        let cleanId = id;
        if (id.includes('accession-number=')) {
          cleanId = id.split('accession-number=').pop() || id;
        }

        if (cleanId && link) {
          parsedEntries.push({
            id: cleanId,
            title,
            link,
            formType: formType.toUpperCase(),
            companyName,
            cik,
            publishedAt: updated,
          });
        }
      } catch (entryError: any) {
        console.error(`[FeedParser] Error parsing individual entry: ${entryError.message}`, entry);
      }
    }

    return parsedEntries;
  }
}
