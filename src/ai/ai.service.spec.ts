import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { OcrService } from '../ocr/ocr.service';
import OpenAI from 'openai';
import axios from 'axios';

// Mock OpenAI
const mockOpenAiCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: mockOpenAiCreate,
        },
      },
    };
  });
});

// Mock Axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AiService', () => {
  let service: AiService;
  let ocrService: OcrService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'mock-openai-key';
        if (key === 'GEMINI_API_KEY') return 'mock-gemini-key';
        if (key === 'CLAUDE_API_KEY') return 'mock-claude-key';
        return null;
      }),
    };

    const mockOcrService = {
      extractTextFromAnyFile: jest.fn().mockResolvedValue('Texto de teste com conteúdo suficiente para passar pela validação de tamanho mínimo do texto.'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OcrService, useValue: mockOcrService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    ocrService = module.get<OcrService>(OcrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract data from OpenAI successfully without falling back', async () => {
    mockOpenAiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              productName: 'Papel A4 (OpenAI)',
              quantity: 100,
              unit: 'un',
              co2Emitted: 15,
              supplier: 'Distribuidora OpenAI',
              confidence: 95,
            }),
          },
        },
      ],
    });

    const result = await service.extractFromDocument('', 'dummy-path.pdf', 'application/pdf');
    expect(result).toBeDefined();
    expect(result.productName).toBe('Papel A4 (OpenAI)');
    expect(result.supplier).toBe('Distribuidora OpenAI');
    expect(mockOpenAiCreate).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should fallback to Gemini if OpenAI fails', async () => {
    // OpenAI fails
    mockOpenAiCreate.mockRejectedValueOnce(new Error('OpenAI Rate Limit'));

    // Gemini succeeds
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    productName: 'Papel A4 (Gemini)',
                    quantity: 100,
                    unit: 'un',
                    co2Emitted: 12,
                    supplier: 'Distribuidora Gemini',
                    confidence: 90,
                  }),
                },
              ],
            },
          },
        ],
      },
    });

    const result = await service.extractFromDocument('', 'dummy-path.pdf', 'application/pdf');
    expect(result).toBeDefined();
    expect(result.productName).toBe('Papel A4 (Gemini)');
    expect(result.supplier).toBe('Distribuidora Gemini');
    expect(mockOpenAiCreate).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('should fallback to Claude if both OpenAI and Gemini fail', async () => {
    // OpenAI fails
    mockOpenAiCreate.mockRejectedValueOnce(new Error('OpenAI Timeout'));

    // Gemini fails
    mockedAxios.post.mockRejectedValueOnce(new Error('Gemini Overloaded'));

    // Claude succeeds
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        content: [
          {
            text: JSON.stringify({
              productName: 'Papel A4 (Claude)',
              quantity: 100,
              unit: 'un',
              co2Emitted: 14,
              supplier: 'Distribuidora Claude',
              confidence: 93,
            }),
          },
        ],
      },
    });

    const result = await service.extractFromDocument('', 'dummy-path.pdf', 'application/pdf');
    expect(result).toBeDefined();
    expect(result.productName).toBe('Papel A4 (Claude)');
    expect(result.supplier).toBe('Distribuidora Claude');
    expect(mockOpenAiCreate).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2); // First Gemini, then Claude
  });

  it('should return error object if all providers fail', async () => {
    // OpenAI fails
    mockOpenAiCreate.mockRejectedValueOnce(new Error('OpenAI Error'));
    // Gemini fails
    mockedAxios.post.mockRejectedValueOnce(new Error('Gemini Error'));
    // Claude fails
    mockedAxios.post.mockRejectedValueOnce(new Error('Claude Error'));

    const result = await service.extractFromDocument('', 'dummy-path.pdf', 'application/pdf');
    expect(result).toBeDefined();
    expect(result.error).toContain('Todos os provedores de IA falharam');
    expect(result.error).toContain('Claude Error');
  });
});
