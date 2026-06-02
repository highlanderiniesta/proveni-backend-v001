/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import axios from 'axios';
import {
  IAiProvider,
  AiExtractionResult,
  getExtractionPrompt,
} from './provider.interface';

export class ClaudeProvider implements IAiProvider {
  readonly name = 'Claude';
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey: string, timeoutMs = 10000) {
    this.apiKey = apiKey.replace(/['"]/g, '');
    this.timeoutMs = timeoutMs;
  }

  async extractFromText(text: string): Promise<AiExtractionResult> {
    if (!this.apiKey) {
      throw new Error('Chave de API do Claude não configurada.');
    }

    const prompt = getExtractionPrompt(text);
    const url = 'https://api.anthropic.com/v1/messages';

    const response = await axios.post(
      url,
      {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: this.timeoutMs,
      },
    );

    const contentArray = response.data?.content;
    const rawText = contentArray?.[0]?.text;

    if (!rawText) {
      throw new Error('Claude retornou uma resposta vazia.');
    }

    const cleanedText = this.cleanJsonResponse(rawText);
    return JSON.parse(cleanedText) as AiExtractionResult;
  }

  private cleanJsonResponse(rawText: string): string {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return cleaned.trim();
  }
}
