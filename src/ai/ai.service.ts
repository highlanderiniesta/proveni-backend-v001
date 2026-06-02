/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrService } from '../ocr/ocr.service';
import {
  IAiProvider,
  AiExtractionResult,
} from './providers/provider.interface';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';
// import { GroqProvider } from './providers/groq.provider';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GroqProvider } from 'src/ai/providers/ollama.provider';

@Injectable()
export class AiService {
  private providers: IAiProvider[] = [];
  private readonly logger = new Logger(AiService.name);

  constructor(
    private configService: ConfigService,
    private ocrService: OcrService,
  ) {
    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    const claudeKey = this.configService.get<string>('CLAUDE_API_KEY');
    const groqKey = this.configService.get<string>('GROQ_API_KEY');

    this.logger.log('🔧 Inicializando provedores de IA...');
    this.logger.log(
      `📋 OPENAI_API_KEY: ${openAiKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );
    this.logger.log(
      `📋 GEMINI_API_KEY: ${geminiKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );
    this.logger.log(
      `📋 CLAUDE_API_KEY: ${claudeKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );
    this.logger.log(
      `📋 GROQ_API_KEY: ${groqKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );

    // Ordem de prioridade: Groq (mais rápido e gratuito) primeiro
    if (groqKey && groqKey !== '') {
      this.providers.push(new GroqProvider(groqKey));
      this.logger.log('✅ Groq (Llama) provider configurado - PRIORITÁRIO');
    }
    if (openAiKey && openAiKey !== '') {
      this.providers.push(new OpenAiProvider(openAiKey));
      this.logger.log('✅ OpenAI provider configurado');
    }
    if (geminiKey && geminiKey !== '') {
      this.providers.push(new GeminiProvider(geminiKey));
      this.logger.log('✅ Gemini provider configurado');
    }
    if (claudeKey && claudeKey !== '') {
      this.providers.push(new ClaudeProvider(claudeKey));
      this.logger.log('✅ Claude provider configurado');
    }

    if (this.providers.length === 0) {
      this.logger.error('❌ Nenhum provedor de IA foi configurado');
    } else {
      this.logger.log(
        `🎉 Total de provedores configurados: ${this.providers.length}`,
      );
    }
  }

  /**
   * Extrai dados de um documento usando IA
   * Retorna todos os campos da nota fiscal
   */
  async extractFromDocument(
    publicUrl: string,
    filePath?: string,
    mimeType?: string,
    rawText?: string,
  ): Promise<AiExtractionResult> {
    let text = rawText || '';

    this.logger.log('🚀 Iniciando extração de dados...');
    this.logger.log(`📋 publicUrl: ${publicUrl || 'não fornecida'}`);
    this.logger.log(`📋 filePath: ${filePath || 'não fornecido'}`);
    this.logger.log(`📋 mimeType: ${mimeType || 'não fornecido'}`);
    this.logger.log(
      `📋 rawText: ${rawText ? `${rawText.length} caracteres` : 'não fornecido'}`,
    );

    // Se não temos o texto mas temos o arquivo local, usa OCR direto
    if (!text && filePath && mimeType) {
      this.logger.log(`📄 Processando arquivo local via OCR: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        throw new BadRequestException(`Arquivo não encontrado: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      this.logger.log(
        `📊 Tamanho do arquivo: ${(stats.size / 1024).toFixed(2)} KB`,
      );

      if (stats.size === 0) {
        throw new BadRequestException('Arquivo vazio');
      }

      text = await this.ocrService.extractTextFromAnyFile(filePath, mimeType);
      this.logger.log(`📝 OCR resultou em ${text.length} caracteres`);
    }
    // Caso contrário, baixa da URL se não tiver o texto
    else if (!text && publicUrl) {
      this.logger.log(`🌐 Baixando documento da URL: ${publicUrl}`);
      try {
        const axios = await import('axios');
        const response = await axios.default.get(publicUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });
        this.logger.log(
          `✅ Download concluído: ${(response.data.length / 1024).toFixed(2)} KB`,
        );

        const buffer = Buffer.from(response.data);
        const isPDF = buffer.toString('hex', 0, 4).toLowerCase() === '25504446';
        const isPNG = buffer.toString('hex', 1, 4).toLowerCase() === '504e47';
        const isJPG = buffer.toString('hex', 0, 4).toLowerCase() === 'ffd8ffe0';

        let tempPath: string;
        if (isPDF) {
          tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.pdf`);
        } else if (isPNG || isJPG) {
          tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.jpg`);
        } else {
          tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.pdf`);
        }

        fs.writeFileSync(tempPath, response.data);
        this.logger.log(`💾 Arquivo salvo temporariamente: ${tempPath}`);

        text = await this.ocrService.extractTextFromAnyFile(
          tempPath,
          mimeType || 'application/octet-stream',
        );
        this.logger.log(`📝 OCR resultou em ${text.length} caracteres`);

        try {
          fs.unlinkSync(tempPath);
          this.logger.log(`🗑️ Arquivo temporário removido`);
        } catch (unlinkError) {
          this.logger.warn(
            `Não foi possível remover arquivo temporário: ${unlinkError.message}`,
          );
        }
      } catch (error: any) {
        this.logger.error(`❌ Erro ao processar documento: ${error.message}`);
        throw new BadRequestException(
          `Erro ao processar documento: ${error.message}`,
        );
      }
    }

    // Verificar se conseguiu extrair texto
    if (!text || text.length === 0) {
      this.logger.error('❌ Nenhum texto foi extraído do documento!');

      if (filePath && fs.existsSync(filePath)) {
        this.logger.log('🔄 Tentando leitura direta do arquivo...');
        try {
          const buffer = fs.readFileSync(filePath);
          const bufferString = buffer.toString(
            'utf-8',
            0,
            Math.min(buffer.length, 1000),
          );
          if (
            bufferString &&
            bufferString.length > 50 &&
            !bufferString.includes('%PDF')
          ) {
            text = bufferString;
            this.logger.log(
              `✅ Leitura direta obteve ${text.length} caracteres`,
            );
          }
        } catch (readError) {
          this.logger.warn(`Leitura direta falhou: ${readError.message}`);
        }
      }
    }

    // Log do texto extraído
    if (text && text.length > 0) {
      this.logger.log(`📝 Texto extraído (primeiros 500 caracteres):`);
      this.logger.log(`--- INÍCIO DO TEXTO ---`);
      this.logger.log(text.substring(0, 500));
      this.logger.log(`--- FIM DO TEXTO ---`);
      this.logger.log(`📊 Tamanho total do texto: ${text.length} caracteres`);
    } else {
      this.logger.error(`❌ Nenhum texto foi extraído!`);
      throw new BadRequestException(
        'Não foi possível extrair texto do documento. Verifique se o arquivo é um PDF ou imagem com texto legível.',
      );
    }

    // Limitar o tamanho do texto para não ultrapassar limites da IA
    const MAX_CHARS = 25000;
    if (text.length > MAX_CHARS) {
      this.logger.warn(
        `⚠️ Texto truncado de ${text.length} para ${MAX_CHARS} caracteres`,
      );
      text = text.substring(0, MAX_CHARS);
    }

    if (text.length < 50) {
      this.logger.warn(
        '⚠️ Texto extraído muito curto - possivelmente documento escaneado',
      );
      return {
        invoiceNumber: null,
        nfNumber: null,
        productName: null,
        quantity: null,
        unit: null,
        co2Emitted: null,
        supplier: null,
        supplierCnpj: null,
        buyer: null,
        buyerCnpj: null,
        totalValue: null,
        issueDate: null,
        ncmCode: null,
        cfop: null,
        confidence: 10,
        error:
          'Texto muito curto. Documento pode ser escaneado ou não ter texto legível.',
      };
    }

    this.logger.log(`🤖 Enviando texto para IA (${text.length} caracteres)...`);

    let lastError: any = null;

    for (const provider of this.providers) {
      try {
        this.logger.log(`🔄 Tentando extração via provedor: ${provider.name}`);
        const startTime = Date.now();
        const result = await provider.extractFromText(text);
        const duration = Date.now() - startTime;

        this.logger.log(`✅ IA (${provider.name}) extraiu em ${duration}ms`);
        this.logger.log(`📊 Resultado: Confiança=${result.confidence}%`);
        this.logger.log(
          `📦 Nota Fiscal: ${result.invoiceNumber || 'não encontrado'}`,
        );
        this.logger.log(
          `📦 Produto: ${result.productName || 'não encontrado'}`,
        );
        this.logger.log(
          `📦 Quantidade: ${result.quantity || 'não encontrado'} ${result.unit || ''}`,
        );
        this.logger.log(`🌿 CO₂: ${result.co2Emitted || 'não encontrado'} kg`);
        this.logger.log(
          `🏭 Fornecedor: ${result.supplier || 'não encontrado'}`,
        );
        this.logger.log(
          `🏭 CNPJ Fornecedor: ${result.supplierCnpj || 'não encontrado'}`,
        );
        this.logger.log(
          `💰 Valor Total: ${result.totalValue || 'não encontrado'}`,
        );
        this.logger.log(`📅 Data: ${result.issueDate || 'não encontrado'}`);
        this.logger.log(`🔢 NCM: ${result.ncmCode || 'não encontrado'}`);
        this.logger.log(`📋 CFOP: ${result.cfop || 'não encontrado'}`);

        // Retornar o resultado completo
        return {
          invoiceNumber: result.invoiceNumber,
          nfNumber: result.nfNumber,
          productName: result.productName,
          quantity: result.quantity,
          unit: result.unit,
          co2Emitted: result.co2Emitted,
          supplier: result.supplier,
          supplierCnpj: result.supplierCnpj,
          buyer: result.buyer,
          buyerCnpj: result.buyerCnpj,
          totalValue: result.totalValue,
          issueDate: result.issueDate,
          ncmCode: result.ncmCode,
          cfop: result.cfop,
          confidence: result.confidence || 70,
        };
      } catch (error: any) {
        let errMsg = error.message || error;
        if (error.response?.data) {
          errMsg += ` - Detalhes: ${JSON.stringify(error.response.data)}`;
        }
        this.logger.warn(
          `⚠️ Falha ao extrair usando ${provider.name}: ${errMsg}`,
        );
        lastError = error;
      }
    }

    this.logger.error('❌ Todos os provedores de IA falharam na extração.');
    return {
      invoiceNumber: null,
      nfNumber: null,
      productName: null,
      quantity: null,
      unit: null,
      co2Emitted: null,
      supplier: null,
      supplierCnpj: null,
      buyer: null,
      buyerCnpj: null,
      totalValue: null,
      issueDate: null,
      ncmCode: null,
      cfop: null,
      confidence: 10,
      error: `Todos os provedores falharam. ${lastError?.message || lastError}`,
    };
  }

  /**
   * Retorna a lista de provedores configurados
   */
  getAvailableProviders(): string[] {
    return this.providers.map((p) => p.name);
  }

  /**
   * Verifica se há pelo menos um provedor configurado
   */
  hasProviders(): boolean {
    return this.providers.length > 0;
  }
}
