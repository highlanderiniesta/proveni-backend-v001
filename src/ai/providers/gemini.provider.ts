/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import axios from 'axios';
import {
  IAiProvider,
  AiExtractionResult,
  getExtractionPrompt,
} from './provider.interface';

export class GeminiProvider implements IAiProvider {
  readonly name = 'Gemini';
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey: string, timeoutMs = 15000) {
    // Aumentado timeout para 15s
    this.apiKey = apiKey.replace(/['"]/g, '');
    this.timeoutMs = timeoutMs;
  }

  async extractFromText(text: string): Promise<AiExtractionResult> {
    if (!this.apiKey) {
      throw new Error('Chave de API do Gemini não configurada.');
    }

    // Limitar tamanho do texto
    const truncatedText = text.length > 15000 ? text.substring(0, 15000) : text;
    const prompt = getExtractionPrompt(truncatedText);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;

    try {
      const response = await axios.post(
        url,
        {
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.timeoutMs,
        },
      );

      const candidates = response.data?.candidates;
      const rawText = candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Gemini retornou uma resposta vazia.');
      }

      const cleanedText = this.cleanJsonResponse(rawText);
      const result = JSON.parse(cleanedText) as AiExtractionResult;

      // Garantir que confidence seja um número
      if (typeof result.confidence !== 'number') {
        result.confidence = 70;
      }

      return result;
    } catch (error: any) {
      console.error('Gemini API error:', error.message);
      if (error.response) {
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw new Error(`Falha na extração Gemini: ${error.message}`);
    }
  }

  private cleanJsonResponse(rawText: string): string {
    let cleaned = rawText.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    // Remove caracteres de controle
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    return cleaned.trim();
  }
}
