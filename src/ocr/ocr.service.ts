import { Injectable, Logger } from '@nestjs/common';
import * as Tesseract from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

// Importação correta do pdf2pic
import { fromPath } from 'pdf2pic';

// Importação do pdf2json
const PDFParser = require('pdf2json');

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  /**
   * Extrai texto de PDF (suporta PDF nativo e PDF escaneado via OCR)
   */
  async extractTextFromPDF(filePath: string): Promise<string> {
    this.logger.log(`Processando PDF: ${path.basename(filePath)}`);

    const nativeText = await this.extractNativeText(filePath);

    if (nativeText && nativeText.length > 100) {
      this.logger.log(`✅ PDF com texto nativo: ${nativeText.length} caracteres`);
      return nativeText;
    }

    this.logger.log(`📸 PDF parece ser escaneado, aplicando OCR...`);
    const ocrText = await this.extractTextFromScannedPDF(filePath);

    if (ocrText && ocrText.length > 50) {
      this.logger.log(`✅ OCR em PDF escaneado: ${ocrText.length} caracteres`);
      return ocrText;
    }

    this.logger.warn(`⚠️ Nenhum texto encontrado no PDF`);
    return '';
  }

  private async extractNativeText(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataError', (errData: any) => {
        this.logger.debug(`pdf2json erro: ${errData?.parserError || errData?.message}`);
        resolve('');
      });

      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          let fullText = '';
          if (pdfData?.Pages?.length) {
            for (const page of pdfData.Pages) {
              if (page.Texts?.length) {
                for (const text of page.Texts) {
                  if (text.R?.[0]?.T) {
                    fullText += decodeURIComponent(text.R[0].T) + ' ';
                  }
                }
                fullText += '\n';
              }
            }
          }
          resolve(fullText.replace(/\s+/g, ' ').trim());
        } catch (error: any) {
          this.logger.error(`Erro ao extrair texto nativo: ${error.message}`);
          resolve('');
        }
      });

      pdfParser.loadPDF(filePath);
    });
  }

  /**
   * Converte PDF escaneado em imagens e aplica OCR
   */
  async extractTextFromScannedPDF(filePath: string): Promise<string> {
    this.logger.log(`Convertendo PDF para imagem: ${path.basename(filePath)}`);

    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const baseName = path.basename(filePath, '.pdf');

    try {
      const options = {
        density: 300,
        format: 'png',
        width: 2048,
        height: 2048,
        savePath: tempDir,
        saveFilename: baseName,
      };

      const convert = fromPath(filePath, options);

      // Converte todas as páginas (-1 = todas)
      const result = await convert(-1);

      // Correção importante: pode retornar um objeto ou um array
      const images = Array.isArray(result) ? result : [result];

      this.logger.log(`✅ PDF convertido em ${images.length} página(s)`);

      let fullText = '';

      for (const image of images) {
        if (!image?.path) continue;

        const imgPath = image.path;
        this.logger.log(`📸 Aplicando OCR: ${path.basename(imgPath)}`);

        const pageText = await this.extractTextFromImage(imgPath);
        fullText += pageText + '\n\n';

        // Limpeza
        await fs.promises.unlink(imgPath).catch(() => {});
      }

      return fullText.trim();
    } catch (error: any) {
      this.logger.error(`Erro na conversão/OCR do PDF: ${error.message}`);
      return '';
    }
  }

  async extractTextFromImage(filePath: string): Promise<string> {
    this.logger.log(`Aplicando OCR na imagem: ${path.basename(filePath)}`);

    try {
      if (!fs.existsSync(filePath)) return '';

      const result = await Tesseract.recognize(filePath, 'por', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            this.logger.debug(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      let text = result.data.text || '';

      text = text
        .replace(/\s+/g, ' ')
        .replace(/(\d)\s+(\d)/g, '$1$2')
        .replace(/(\d)\s+\.\s+(\d)/g, '$1.$2')
        .replace(/[^\x20-\x7E\u00C0-\u00FF\n]/g, '')
        .trim();

      this.logger.log(`✅ OCR concluído: ${text.length} caracteres`);
      return text;
    } catch (error: any) {
      this.logger.error(`Erro no OCR da imagem: ${error.message}`);
      return '';
    }
  }

  // === Métodos restantes (sem alteração) ===
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

  async extractTextFromAnyFile(filePath: string, mimeType: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    this.logger.log(`Processando arquivo: ${path.basename(filePath)} (ext: ${ext})`);

    if (!fs.existsSync(filePath)) {
      this.logger.error(`Arquivo não encontrado: ${filePath}`);
      return '';
    }

    if (ext === '.pdf') return await this.extractTextFromPDF(filePath);
    if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'].includes(ext)) {
      return await this.extractTextFromImage(filePath);
    }
    if (['.xlsx', '.xls', '.xlsm', '.xlsb'].includes(ext)) {
      const data = await this.extractFromExcel(filePath);
      return JSON.stringify(data, null, 2);
    }
    if (['.txt', '.csv', '.xml', '.json'].includes(ext)) {
      return await this.extractFromTextFile(filePath);
    }

    this.logger.warn(`Tipo de arquivo não suportado: ${ext}`);
    return '';
  }

  async testPDF(filePath: string): Promise<{ hasText: boolean; textLength: number; sample: string }> {
    const text = await this.extractTextFromPDF(filePath);
    return {
      hasText: text.length > 0,
      textLength: text.length,
      sample: text.substring(0, 200),
    };
  }
}