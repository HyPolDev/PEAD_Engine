import axios from 'axios';
import { LLMEvaluator, cleanHtml, LLMAnalysisResult } from '../src/llm-evaluator';
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
      const { result, prompt, responseRaw } = await evaluator.evaluate('AAPL', '<html>mock html</html>', mockEstimate);

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
