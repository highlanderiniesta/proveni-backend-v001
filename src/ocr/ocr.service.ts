import { Injectable, Logger } from '@nestjs/common';
import * as Tesseract from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import * as pdf from 'pdf-poppler';

// Importação do pdf2json sem tipagem
const PDFParser = require('pdf2json');

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  /**
   * Extrai texto de PDF (suporta PDF nativo e PDF escaneado via OCR)
   */
  async extractTextFromPDF(filePath: string): Promise<string> {
    this.logger.log(`Processando PDF: ${path.basename(filePath)}`);

    // 1. Primeiro tenta extrair texto nativo com pdf2json
    const nativeText = await this.extractNativeText(filePath);

    if (nativeText && nativeText.length > 100) {
      this.logger.log(
        `✅ PDF com texto nativo: ${nativeText.length} caracteres`,
      );
      return nativeText;
    }

    // 2. Se não tem texto nativo, tenta OCR no PDF escaneado
    this.logger.log(`📸 PDF parece ser escaneado, aplicando OCR...`);
    const ocrText = await this.extractTextFromScannedPDF(filePath);

    if (ocrText && ocrText.length > 50) {
      this.logger.log(`✅ OCR em PDF escaneado: ${ocrText.length} caracteres`);
      return ocrText;
    }

    this.logger.warn(`⚠️ Nenhum texto encontrado no PDF`);
    return '';
  }

  /**
   * Extrai texto nativo de PDF usando pdf2json
   */
  private async extractNativeText(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataError', (errData: any) => {
        const errorMsg =
          errData?.parserError || errData?.message || String(errData);
        this.logger.debug(
          `pdf2json erro (normal para PDF escaneado): ${errorMsg}`,
        );
        resolve('');
      });

      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          let fullText = '';

          if (pdfData && pdfData.Pages && Array.isArray(pdfData.Pages)) {
            for (const page of pdfData.Pages) {
              if (page.Texts && Array.isArray(page.Texts)) {
                for (const text of page.Texts) {
                  if (text.R && text.R[0] && text.R[0].T) {
                    const decodedText = decodeURIComponent(text.R[0].T);
                    fullText += decodedText + ' ';
                  }
                }
                fullText += '\n';
              }
            }
          }

          const cleanedText = fullText.replace(/\s+/g, ' ').trim();
          resolve(cleanedText);
        } catch (error: any) {
          this.logger.error(`Erro ao extrair texto nativo: ${error.message}`);
          resolve('');
        }
      });

      try {
        pdfParser.loadPDF(filePath);
      } catch (error: any) {
        this.logger.debug(`Erro ao carregar PDF: ${error.message}`);
        resolve('');
      }
    });
  }

  /**
   * Extrai texto de PDF escaneado convertendo para imagem e aplicando OCR
   */
  async extractTextFromScannedPDF(filePath: string): Promise<string> {
    this.logger.log(`Convertendo PDF para imagem: ${path.basename(filePath)}`);

    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const baseName = path.basename(filePath, '.pdf');
    const outputPath = path.join(tempDir, baseName);

    try {
      const options = {
        format: 'png',
        out_dir: tempDir,
        out_prefix: baseName,
        page: null, // todas as páginas
        scale: 2048, // Aumentar qualidade
      };

      await pdf.convert(filePath, options);
      this.logger.log(`✅ PDF convertido para imagens em: ${outputPath}`);

      const files = await fs.promises.readdir(tempDir);
      const imageFiles = files.filter(
        (f) => f.startsWith(baseName) && f.endsWith('.png'),
      );

      let fullText = '';

      for (const imgFile of imageFiles) {
        const imgPath = path.join(tempDir, imgFile);
        this.logger.log(`📸 Aplicando OCR na imagem: ${imgFile}`);

        const pageText = await this.extractTextFromImage(imgPath);
        fullText += pageText + '\n\n';

        await fs.promises.unlink(imgPath).catch(() => {});
      }

      this.logger.log(`✅ OCR concluído: ${fullText.length} caracteres totais`);
      return fullText;
    } catch (error: any) {
      this.logger.error(`Erro na conversão/OCR do PDF: ${error.message}`);
      return '';
    }
  }

  /**
   * Extrai texto de imagem usando Tesseract OCR
   */
  async extractTextFromImage(filePath: string): Promise<string> {
    this.logger.log(`Aplicando OCR na imagem: ${path.basename(filePath)}`);

    try {
      if (!fs.existsSync(filePath)) return '';

      // Tesseract.recognize retorna um objeto com a propriedade 'data'
      const result = await Tesseract.recognize(filePath, 'por', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            this.logger.debug(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      // O texto está em result.data.text
      let text = result.data.text || '';

      // 🔧 Pós-processamento para limpar e melhorar o texto
      text = text
        .replace(/\s+/g, ' ') // Normaliza espaços
        .replace(/(\d)\s+(\d)/g, '$1$2') // Remove espaços entre números
        .replace(/(\d)\s+\.\s+(\d)/g, '$1.$2') // Corrige números decimais
        .replace(/[^\x20-\x7E\u00C0-\u00FF\n]/g, '') // Remove caracteres estranhos
        .trim();

      this.logger.log(`✅ OCR concluído: ${text.length} caracteres`);

      if (text.length > 0) {
        this.logger.log(`📄 Amostra do texto: "${text.substring(0, 500)}"`);
      }

      return text;
    } catch (error: any) {
      this.logger.error(`Erro no OCR da imagem: ${error.message}`);
      return '';
    }
  }

  /**
   * Extrai dados de arquivo Excel
   */
  async extractFromExcel(filePath: string): Promise<any[]> {
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);
      this.logger.log(`✅ Excel processado: ${data.length} linhas`);
      return data;
    } catch (error: any) {
      this.logger.error(`Erro ao processar Excel: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrai texto de arquivo TXT
   */
  async extractFromTextFile(filePath: string): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.logger.log(`✅ Arquivo texto: ${content.length} caracteres`);
      return content;
    } catch (error: any) {
      this.logger.error(`Erro ao ler arquivo texto: ${error.message}`);
      return '';
    }
  }

  /**
   * Extrai texto de qualquer tipo de arquivo
   */
  async extractTextFromAnyFile(
    filePath: string,
    mimeType: string,
  ): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    this.logger.log(
      `Processando arquivo: ${path.basename(filePath)} (ext: ${ext})`,
    );

    if (!fs.existsSync(filePath)) {
      this.logger.error(`Arquivo não encontrado: ${filePath}`);
      return '';
    }

    // PDF
    if (ext === '.pdf') {
      return await this.extractTextFromPDF(filePath);
    }

    // Imagens
    if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'].includes(ext)) {
      return await this.extractTextFromImage(filePath);
    }

    // Excel
    if (['.xlsx', '.xls', '.xlsm', '.xlsb'].includes(ext)) {
      const data = await this.extractFromExcel(filePath);
      return JSON.stringify(data, null, 2);
    }

    // TXT, CSV, XML, JSON
    if (['.txt', '.csv', '.xml', '.json'].includes(ext)) {
      return await this.extractFromTextFile(filePath);
    }

    this.logger.warn(`Tipo de arquivo não suportado: ${ext}`);
    return '';
  }

  /**
   * Método para testar se o PDF tem texto
   */
  async testPDF(
    filePath: string,
  ): Promise<{ hasText: boolean; textLength: number; sample: string }> {
    const text = await this.extractTextFromPDF(filePath);
    return {
      hasText: text.length > 0,
      textLength: text.length,
      sample: text.substring(0, 200),
    };
  }
}
