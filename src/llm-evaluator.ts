import axios from 'axios';
import { AnalystEstimate } from './fmp-client';

export interface LLMAnalysisResult {
  actual_metrics: {
    revenue: number;
    gross_profit: number;
    operating_income: number;
    net_income: number;
    eps: number;
    operating_cash_flow: number;
    capital_expenditures: number;
    weighted_average_shares_diluted: number;
  };
  qoe_metrics: {
    revenue_surprise_pct: number;
    eps_surprise_pct: number;
    gross_margin_pct: number;
    gross_margin_expansion_bps: number;
    operating_margin_pct: number;
    operating_margin_expansion_bps: number;
    fcf_to_net_income_ratio: number;
    buyback_activity: {
      is_eps_inflated_by_buybacks: boolean;
      share_count_change_pct: number;
    };
  };
  qualitative_analysis: {
    red_flags: Array<{
      category: 'ASSET_RECLASSIFICATION' | 'INVENTORY_BUILDUP' | 'RECEIVABLES_STRETCHING' | 'ONE_TIME_GAINS' | 'LITIGATION_OR_REGULATORY' | 'AUDITOR_CONCERNS' | 'SUPPLY_CHAIN_MEMENTO' | 'OTHER';
      finding: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
    forward_guidance: {
      provided: boolean;
      revenue_guidance: string;
      eps_guidance: string;
      sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'N/A';
    };
  };
  qoe_score: number;
}

/**
 * Strips HTML tags and script/style sections to compress context size.
 */
export function cleanHtml(html: string): string {
  if (!html) return '';
  // Remove script/style tags
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Replace XML/HTML character entities
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'");
  // Normalize whitespaces
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');
  return text.trim();
}

export class LLMEvaluator {
  private apiKey: string;
  private model: string;
  private endpoint = 'https://api.openai.com/v1/chat/completions';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!this.apiKey) {
      console.warn('[LLMEvaluator] Warning: OPENAI_API_KEY environment variable is not defined.');
    }
  }

  /**
   * Invokes OpenAI API to evaluate the filing text against the baseline estimates.
   */
  async evaluate(
    symbol: string,
    rawHtml: string,
    estimate: AnalystEstimate | null
  ): Promise<LLMAnalysisResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required to evaluate filings.');
    }

    console.log(`[LLMEvaluator] Preprocessing raw HTML for: ${symbol}`);
    const cleanedText = cleanHtml(rawHtml);
    // Slice text to fit safely within the model context window
    const truncatedText = cleanedText.slice(0, 300000);

    const baselineInfo = estimate
      ? `Consensus Revenue Estimate: ${estimate.estimatedRevenueAvg}
Consensus EPS Estimate: ${estimate.estimatedEpsAvg}
Consensus EBITDA Estimate: ${estimate.estimatedEbitdaAvg}
Consensus SG&A Expense Estimate: ${estimate.estimatedSgaExpenseAvg}`
      : 'Consensus estimates are not available for this period.';

    const systemPrompt = `You are an expert financial analyst. Your task is to analyze the provided SEC filing text for ${symbol} and extract the actual reported numbers, calculate Quality of Earnings (QoE) surprise metrics compared to the consensus expectations baseline, and perform a qualitative assessment of the MD&A.

Baseline Expectations:
${baselineInfo}

Instructions:
1. Extract the actual values for Revenue, Gross Profit, Operating Income, Net Income, EPS, Operating Cash Flow, CapEx, and Diluted Shares Outstanding from the financial tables.
2. Calculate the QoE margins and expansion basis points (relative to the baseline if expectations are available, otherwise set to 0).
3. Search the MD&A and footnotes for qualitative red flags (such as inventory buildup faster than revenue, receivables stretching, one-time gains, reclassifications, or guidance changes).
4. Output your analysis in a strict JSON format matching the schema provided.`;

    const jsonSchema = {
      type: 'object',
      properties: {
        actual_metrics: {
          type: 'object',
          properties: {
            revenue: { type: 'number', description: 'Total revenue reported in USD.' },
            gross_profit: { type: 'number', description: 'Gross profit reported in USD.' },
            operating_income: { type: 'number', description: 'Operating income (EBIT) reported in USD.' },
            net_income: { type: 'number', description: 'Net income reported in USD.' },
            eps: { type: 'number', description: 'Diluted earnings per share reported.' },
            operating_cash_flow: { type: 'number', description: 'Net cash provided by operating activities in USD.' },
            capital_expenditures: { type: 'number', description: 'Capital expenditures (CapEx) in USD.' },
            weighted_average_shares_diluted: { type: 'integer', description: 'Weighted average diluted shares outstanding.' }
          },
          required: [
            'revenue',
            'gross_profit',
            'operating_income',
            'net_income',
            'eps',
            'operating_cash_flow',
            'capital_expenditures',
            'weighted_average_shares_diluted'
          ],
          additionalProperties: false
        },
        qoe_metrics: {
          type: 'object',
          properties: {
            revenue_surprise_pct: { type: 'number', description: 'Percentage difference between actual revenue and consensus expectations.' },
            eps_surprise_pct: { type: 'number', description: 'Percentage difference between actual EPS and consensus expectations.' },
            gross_margin_pct: { type: 'number', description: 'Calculated actual gross margin: gross_profit / revenue.' },
            gross_margin_expansion_bps: { type: 'integer', description: 'Gross margin expansion or contraction relative to expected, expressed in basis points (1% = 100bps).' },
            operating_margin_pct: { type: 'number', description: 'Calculated actual operating margin: operating_income / revenue.' },
            operating_margin_expansion_bps: { type: 'integer', description: 'Operating margin expansion or contraction relative to expected, in basis points.' },
            fcf_to_net_income_ratio: { type: 'number', description: 'Free Cash Flow (operating_cash_flow - capital_expenditures) divided by net_income.' },
            buyback_activity: {
              type: 'object',
              properties: {
                is_eps_inflated_by_buybacks: { type: 'boolean', description: 'True if the EPS surprise is positive but the Net Income surprise is negative or significantly lower due to share buybacks.' },
                share_count_change_pct: { type: 'number', description: 'Percentage change in weighted average diluted shares outstanding compared to the same period last year.' }
              },
              required: ['is_eps_inflated_by_buybacks', 'share_count_change_pct'],
              additionalProperties: false
            }
          },
          required: [
            'revenue_surprise_pct',
            'eps_surprise_pct',
            'gross_margin_pct',
            'gross_margin_expansion_bps',
            'operating_margin_pct',
            'operating_margin_expansion_bps',
            'fcf_to_net_income_ratio',
            'buyback_activity'
          ],
          additionalProperties: false
        },
        qualitative_analysis: {
          type: 'object',
          properties: {
            red_flags: {
              type: 'array',
              description: 'List of qualitative accounting or operational issues found in the MD&A or footnotes.',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: [
                      'ASSET_RECLASSIFICATION',
                      'INVENTORY_BUILDUP',
                      'RECEIVABLES_STRETCHING',
                      'ONE_TIME_GAINS',
                      'LITIGATION_OR_REGULATORY',
                      'AUDITOR_CONCERNS',
                      'SUPPLY_CHAIN_MEMENTO',
                      'OTHER'
                    ]
                  },
                  finding: { type: 'string', description: 'Detailed quote or summary of the red flag from the filing.' },
                  severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }
                },
                required: ['category', 'finding', 'severity'],
                additionalProperties: false
              }
            },
            forward_guidance: {
              type: 'object',
              properties: {
                provided: { type: 'boolean', description: 'True if management provided guidance for future periods.' },
                revenue_guidance: { type: 'string', description: 'Guidance details or numbers for revenue, or "N/A".' },
                eps_guidance: { type: 'string', description: 'Guidance details or numbers for EPS, or "N/A".' },
                sentiment: {
                  type: 'string',
                  enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'N/A'],
                  description: 'Guidance sentiment relative to expectations.'
                }
              },
              required: ['provided', 'revenue_guidance', 'eps_guidance', 'sentiment'],
              additionalProperties: false
            }
          },
          required: ['red_flags', 'forward_guidance'],
          additionalProperties: false
        },
        qoe_score: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'Overall Quality of Earnings score from 1 (low quality/manipulated/poor cash) to 5 (clean beat/expanding margins/high FCF conversion).'
        }
      },
      required: ['actual_metrics', 'qoe_metrics', 'qualitative_analysis', 'qoe_score'],
      additionalProperties: false
    };

    console.log(`[LLMEvaluator] Executing OpenAI analysis call for ${symbol} using ${this.model}...`);
    try {
      const response = await axios.post(
        this.endpoint,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Here is the filing text for ${symbol}:\n\n${truncatedText}` }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'pead_filing_analysis',
              strict: true,
              schema: jsonSchema
            }
          },
          temperature: 0.1 // low temperature for analytical consistency
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const responseContent = response.data.choices[0].message.content;
      return JSON.parse(responseContent) as LLMAnalysisResult;
    } catch (error: any) {
      if (error.response) {
        console.error(`[LLMEvaluator] OpenAI API responded with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      } else {
        console.error(`[LLMEvaluator] OpenAI API call failed: ${error.message}`);
      }
      throw error;
    }
  }
}
