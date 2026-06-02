// providers/groq.provider.ts
import axios from 'axios';
import {
  IAiProvider,
  AiExtractionResult,
  getExtractionPrompt,
} from './provider.interface';

export class GroqProvider implements IAiProvider {
  readonly name = 'Groq (Llama)';
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(
    apiKey: string,
    model = 'llama-3.3-70b-versatile', // ou 'llama-3.1-8b-instant' para mais rapido
    timeoutMs = 30000,
  ) {
    this.apiKey = apiKey.replace(/['"]/g, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async extractFromText(text: string): Promise<AiExtractionResult> {
    if (!this.apiKey) {
      throw new Error('Chave de API do Groq não configurada.');
    }

    const prompt = getExtractionPrompt(text);
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    try {
      const response = await axios.post(
        url,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'Você é um especialista em extração de dados de notas fiscais brasileiras. Responda APENAS com JSON válido, sem explicações adicionais.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 2048,
          top_p: 0.9,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeoutMs,
        },
      );

      const rawText = response.data?.choices?.[0]?.message?.content;
      if (!rawText) {
        throw new Error('Groq retornou uma resposta vazia');
      }

      const cleanedText = this.cleanJsonResponse(rawText);
      const result = JSON.parse(cleanedText) as AiExtractionResult;

      if (typeof result.confidence !== 'number') {
        result.confidence = 70;
      }

      return result;
    } catch (error: any) {
      console.error('Groq API error:', error.message);
      if (error.response) {
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw new Error(`Falha na extração Groq: ${error.message}`);
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
