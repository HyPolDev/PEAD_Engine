import axios from 'axios';
import { LLMEvaluator, cleanHtml, LLMAnalysisResult, extractMdaAndFinancials } from '../src/llm-evaluator';
import { AnalystEstimate } from '../src/fmp-client';

jest.mock('axios');

describe('LLMEvaluator', () => {
  const mockEstimate: AnalystEstimate = {
    symbol: 'AAPL',
    date: '2026-06-30',
    revenueLow: 100,
    revenueHigh: 110,
    revenueAvg: 105,
    epsLow: 1.0,
    epsHigh: 1.2,
    epsAvg: 1.1,
    ebitdaLow: 40,
    ebitdaHigh: 50,
    ebitdaAvg: 45,
    sgaExpenseLow: 10,
    sgaExpenseHigh: 12,
    sgaExpenseAvg: 11,
    numAnalystsRevenue: 10,
    numAnalystsEps: 10,
  };

  const mockLLMResponse: LLMAnalysisResult = {
    actual_metrics: {
      revenue: 110,
      gross_profit: 44,
      operating_income: 22,
      net_income: 12,
      eps: 1.2,
      operating_cash_flow: 15,
      capital_expenditures: 3,
      weighted_average_shares_diluted: 10000000,
    },
    qoe_metrics: {
      revenue_surprise_pct: 4.76,
      eps_surprise_pct: 9.09,
      gross_margin_pct: 0.4,
      gross_margin_expansion_bps: 120,
      operating_margin_pct: 0.2,
      operating_margin_expansion_bps: 80,
      fcf_to_net_income_ratio: 1.0,
      buyback_activity: {
        is_eps_inflated_by_buybacks: false,
        share_count_change_pct: -0.5,
      },
    },
    qualitative_analysis: {
      red_flags: [
        {
          category: 'INVENTORY_BUILDUP',
          finding: 'Inventory increased by 15% exceeding sales growth.',
          severity: 'MEDIUM',
        },
      ],
      forward_guidance: {
        provided: true,
        revenue_guidance: 'Expected 115-120M next quarter',
        eps_guidance: 'N/A',
        sentiment: 'POSITIVE',
      },
    },
    qoe_score: 4,
    expectation_classification: 'more or less meets expectations',
    personal_evaluation: 'Strong company with minor inventory buildup risk.',
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'mock-openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
  });

  describe('cleanHtml', () => {
    it('should strip script, style, and HTML tags, and clean whitespace', () => {
      const dirtyHtml = `
        <html>
          <head>
            <style>body { color: red; }</style>
            <script>console.log("hello");</script>
          </head>
          <body>
            <div>
              <h1>Item 2. Management's Discussion and Analysis</h1>
              <p>The company had a strong quarter &amp; net sales increased &nbsp; significantly.</p>
            </div>
          </body>
        </html>
      `;

      const cleaned = cleanHtml(dirtyHtml);
      expect(cleaned).toContain("Item 2. Management's Discussion and Analysis");
      expect(cleaned).toContain("strong quarter & net sales increased significantly");
      expect(cleaned).not.toContain("body { color: red; }");
      expect(cleaned).not.toContain('console.log("hello")');
    });
  });

  describe('extractMdaAndFinancials', () => {
    it('should extract Item 7 to Item 9 for a 10-K filing', () => {
      const mockText = `
        Cover Page Information
        Item 6. Selected Financial Data
        Item 7. Management's Discussion and Analysis of Financial Condition
        This is the MD&A content.
        It contains company performance details.
        Item 7A. Quantitative and Qualitative Disclosures
        Item 8. Financial Statements
        This is the financial tables content.
        Item 9. Changes in and Disagreements with Accountants
        This should be excluded.
      `;
      const extracted = extractMdaAndFinancials(mockText, '10-K');
      expect(extracted).toContain("Item 7. Management's Discussion and Analysis");
      expect(extracted).toContain("This is the MD&A content.");
      expect(extracted).toContain("Item 8. Financial Statements");
      expect(extracted).not.toContain("Item 9. Changes in and Disagreements");
    });

    it('should extract Item 1 to Item 3 for a 10-Q filing', () => {
      const mockText = `
        Cover Page Information
        Item 1. Financial Statements
        This is the Q1 financial statements.
        Item 2. Management's Discussion and Analysis
        This is the Q1 MD&A content.
        Item 3. Quantitative and Qualitative Disclosures
        This should be excluded.
      `;
      const extracted = extractMdaAndFinancials(mockText, '10-Q');
      expect(extracted).toContain("Item 1. Financial Statements");
      expect(extracted).toContain("Item 2. Management's Discussion and Analysis");
      expect(extracted).not.toContain("Item 3. Quantitative and Qualitative");
    });

    it('should skip Table of Contents match when extracting', () => {
      const mockTocText = `
        PART I
        Item 1. Business............................................... 5
        Item 7. Management's Discussion and Analysis.................. 20
        Item 8. Financial Statements................................... 35
        Item 9. Changes................................................ 50
        
        ${'A'.repeat(30000)}
        
        Item 7. Management's Discussion and Analysis of Financial Condition
        Actual MD&A body text here.
        Item 8. Financial Statements
        Actual Financial Statements here.
        Item 9. Changes in and Disagreements
        Actual changes body text here.
      `;
      const extracted = extractMdaAndFinancials(mockTocText, '10-K');
      expect(extracted).toContain("Actual MD&A body text here.");
      expect(extracted).toContain("Actual Financial Statements here.");
      expect(extracted).not.toContain("Actual changes body text here.");
      expect(extracted).not.toContain("Item 1. Business");
    });

    it('should fallback to default slicing if start markers are not found', () => {
      const mockText = `This text does not contain any item markers. `.repeat(10);
      const extracted = extractMdaAndFinancials(mockText, '10-K');
      expect(extracted).toBe(mockText.slice(0, 300000));
    });
  });

  describe('evaluate', () => {
    it('should call OpenAI API completions with correct payload and return parsed result', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify(mockLLMResponse),
              },
            },
          ],
        },
      });

      const evaluator = new LLMEvaluator();
      const { result, prompt, responseRaw } = await evaluator.evaluate('AAPL', '<html>mock html</html>', mockEstimate, '10-Q');

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: expect.objectContaining({
            type: 'json_schema',
            json_schema: expect.objectContaining({
              name: 'pead_filing_analysis',
            }),
          }),
        }),
        expect.any(Object)
      );

      expect(result).toEqual(mockLLMResponse);
      expect(prompt).toBeDefined();
      expect(responseRaw).toBe(JSON.stringify(mockLLMResponse));
    });
  });
});
