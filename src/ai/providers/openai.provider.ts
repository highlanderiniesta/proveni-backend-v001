/* eslint-disable prettier/prettier */
import OpenAI from 'openai';
import { IAiProvider, AiExtractionResult, getExtractionPrompt } from './provider.interface';

export class OpenAiProvider implements IAiProvider {
  readonly name = 'OpenAI';
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey: apiKey.replace(/['"]/g, '') });
  }

  async extractFromText(text: string): Promise<AiExtractionResult> {
    const prompt = getExtractionPrompt(text);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI retornou uma resposta vazia.');
    }

    return JSON.parse(content) as AiExtractionResult;
  }
}
