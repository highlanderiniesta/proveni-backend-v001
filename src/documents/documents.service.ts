/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ocr/ocr.service';
import { AiService } from '../ai/ai.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import {
  DocumentStatus,
  DocumentType,
  Batch,
  BatchStatus,
} from '@prisma/client';
import { UploadDocumentDto } from './dto/upload-document.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import axios from 'axios';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: OcrService,
    private readonly ai: AiService,
    private readonly ipfs: IpfsService,
    private readonly blockchain: BlockchainService,
  ) {}

  async findBySupplier(supplierId: string) {
    return this.prisma.document.findMany({
      where: { supplierId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
      },
    });
  }

  async upload(
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    uploadedById: string,
  ) {
    this.logger.log(`📤 Iniciando upload do arquivo: ${file.originalname}`);
    this.logger.log(`📊 Tamanho: ${(file.size / 1024).toFixed(2)} KB`);
    this.logger.log(`📋 Tipo MIME: ${file.mimetype}`);

    let filePath: string;

    const tempDir = path.resolve(process.cwd(), 'uploads', 'temp');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const originalExt = path.extname(file.originalname);
    const unique =
      Date.now() + '-' + Math.round(Math.random() * 1e9) + originalExt;
    filePath = path.join(tempDir, unique);

    this.logger.log(`💾 Salvando arquivo em: ${filePath}`);
    await fs.promises.writeFile(filePath, file.buffer);

    let batch: Batch | null = null;
    if (dto.batchId) {
      batch = await this.prisma.batch.findUnique({
        where: { batchId: dto.batchId },
      });
      if (!batch) {
        await fs.promises.unlink(filePath).catch(() => {});
        throw new NotFoundException(`Lote ${dto.batchId} não encontrado`);
      }
    }

    const uploader = await this.prisma.user.findUnique({
      where: { id: uploadedById },
    });
    if (!uploader) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw new BadRequestException('Usuário não encontrado');
    }

    const supplierId = dto.supplierId ?? uploader.companyId ?? batch?.companyId;

    if (!supplierId) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw new BadRequestException('Não foi possível determinar o fornecedor');
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const documentHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    const docType =
      dto.docType ?? this.inferDocType(file.mimetype, file.originalname);

    this.logger.log(`📡 Enviando arquivo para IPFS/Pinata...`);
    let ipfsHash: string;
    try {
      ipfsHash = await this.ipfs.uploadFile(filePath);
      this.logger.log(`✅ Arquivo enviado para IPFS. Hash: ${ipfsHash}`);
    } catch (error: any) {
      this.logger.error(`❌ Erro ao enviar para IPFS: ${error.message}`);
      await fs.promises.unlink(filePath).catch(() => {});
      throw new BadRequestException('Erro ao enviar arquivo para IPFS');
    }

    this.logger.log(`🔍 Extraindo texto do documento via OCR...`);
    let extractedText = '';
    try {
      extractedText = await this.ocr.extractTextFromAnyFile(
        filePath,
        file.mimetype,
      );
      this.logger.log(`📝 OCR concluído: ${extractedText.length} caracteres`);
      if (extractedText.length > 0) {
        this.logger.log(
          `📄 Primeiros 200 caracteres: ${extractedText.substring(0, 200)}`,
        );
      } else {
        this.logger.warn(`⚠️ Nenhum texto extraído pelo OCR`);
      }
    } catch (error: any) {
      this.logger.warn(`⚠️ Erro no OCR: ${error.message}`);
      extractedText = '';
    }

    const document = await this.prisma.document.create({
      data: {
        batchId: batch?.id || undefined,
        supplierId,
        filename: file.originalname,
        originalName: file.originalname,
        fileSize: BigInt(file.size),
        mimeType: file.mimetype,
        filePath: '',
        ipfsHash: ipfsHash || null,
        documentHash,
        docType,
        extractedData: { text: extractedText },
        processingStatus: DocumentStatus.PENDING,
        uploadedById,
      },
    });

    await fs.promises.unlink(filePath).catch(() => {});

    this.logger.log(`✅ Documento ${document.id} criado com sucesso`);

    return {
      id: document.id,
      ipfsHash,
      status: DocumentStatus.PENDING,
      message: 'Documento enviado para IPFS e aguardando processamento',
    };
  }

  async extractDataWithAi(documentId: string, userId: string) {
    this.logger.log(`🚀 Iniciando extração de IA para documento ${documentId}`);

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    this.logger.log(`📄 Documento: ${doc.originalName}`);
    this.logger.log(`📋 Tipo MIME: ${doc.mimeType}`);
    this.logger.log(`🔗 IPFS Hash: ${doc.ipfsHash}`);
    this.logger.log(`📊 Status atual: ${doc.processingStatus}`);

    if (!doc.ipfsHash) {
      throw new BadRequestException('Documento não possui hash IPFS');
    }

    if (doc.processingStatus === DocumentStatus.EXTRACTED) {
      this.logger.log(`ℹ️ Documento já foi extraído anteriormente`);
      return doc.extractedData;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: DocumentStatus.PROCESSING },
    });

    let tempFilePath: string | null = null;

    try {
      const ipfsUrl = this.ipfs.getPublicUrl(doc.ipfsHash);
      this.logger.log(`🌐 Baixando arquivo do IPFS: ${ipfsUrl}`);

      const response = await axios.get(ipfsUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      this.logger.log(
        `✅ Download concluído: ${(response.data.length / 1024).toFixed(2)} KB`,
      );

      const tempDir = path.resolve(os.tmpdir(), 'proveni-ai');
      await fs.promises.mkdir(tempDir, { recursive: true });

      const originalExt = path.extname(doc.originalName || '.pdf');
      tempFilePath = path.join(
        tempDir,
        `${documentId}_${Date.now()}${originalExt}`,
      );

      this.logger.log(`💾 Salvando arquivo temporário: ${tempFilePath}`);
      await fs.promises.writeFile(tempFilePath, response.data);

      const stats = await fs.promises.stat(tempFilePath);
      this.logger.log(
        `📊 Tamanho do arquivo temporário: ${(stats.size / 1024).toFixed(2)} KB`,
      );

      let extractedText = (doc.extractedData as any)?.text || '';

      if (!extractedText) {
        this.logger.log(`🔍 Extraindo texto do arquivo baixado...`);
        this.logger.log(`📋 Extensão do arquivo: ${originalExt}`);
        this.logger.log(`📋 MIME Type: ${doc.mimeType || 'desconhecido'}`);

        extractedText = await this.ocr.extractTextFromAnyFile(
          tempFilePath,
          doc.mimeType || 'application/octet-stream',
        );

        this.logger.log(`📝 OCR retornou ${extractedText.length} caracteres`);

        if (extractedText.length > 0) {
          this.logger.log(
            `📄 Amostra do texto: "${extractedText.substring(0, 300)}..."`,
          );
        } else {
          this.logger.error(
            `❌ OCR não conseguiu extrair texto do arquivo ${tempFilePath}`,
          );

          try {
            const buffer = await fs.promises.readFile(tempFilePath);
            const textSample = buffer.toString('utf-8', 0, 500);
            if (
              textSample &&
              textSample.length > 50 &&
              !textSample.startsWith('%PDF')
            ) {
              this.logger.log(`🔄 Tentando leitura direta do arquivo...`);
              extractedText = textSample;
              this.logger.log(
                `✅ Leitura direta obteve ${extractedText.length} caracteres`,
              );
            }
          } catch (readError: any) {
            this.logger.warn(`Leitura direta falhou: ${readError.message}`);
          }
        }
      }

      if (!extractedText || extractedText.length < 30) {
        this.logger.error(
          `❌ Texto insuficiente: ${extractedText?.length || 0} caracteres`,
        );
        throw new BadRequestException(
          'Não foi possível extrair texto do documento. Verifique se o arquivo é um PDF ou imagem com texto legível.',
        );
      }

      this.logger.log(
        `🤖 Enviando texto para IA (${extractedText.length} caracteres)...`,
      );
      const extractedData = await this.ai.extractFromDocument(
        '',
        undefined,
        undefined,
        extractedText,
      );

      const sanitizeText = (text: string): string => {
        if (!text) return '';
        return text
          .replace(/\u0000/g, '')
          .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 50000);
      };

      const sanitizedText = sanitizeText(extractedText);

      const sanitizedExtractedData = { ...extractedData };
      if (sanitizedExtractedData.productName) {
        sanitizedExtractedData.productName = sanitizeText(
          sanitizedExtractedData.productName,
        );
      }
      if (sanitizedExtractedData.supplier) {
        sanitizedExtractedData.supplier = sanitizeText(
          sanitizedExtractedData.supplier,
        );
      }
      if (sanitizedExtractedData.invoiceNumber) {
        sanitizedExtractedData.invoiceNumber = sanitizeText(
          sanitizedExtractedData.invoiceNumber,
        );
      }
      if (sanitizedExtractedData.unit) {
        sanitizedExtractedData.unit = sanitizeText(sanitizedExtractedData.unit);
      }

      const updatedDoc = await this.prisma.document.update({
        where: { id: documentId },
        data: {
          extractedData: {
            text: sanitizedText,
            ...sanitizedExtractedData,
          },
          processingStatus: DocumentStatus.EXTRACTED,
          processedAt: new Date(),
          confidenceScore: extractedData.confidence || 70,
        },
      });

      this.logger.log(
        `✅ Extração concluída com sucesso para documento ${documentId}`,
      );
      this.logger.log(`📊 Confiança: ${extractedData.confidence || 70}%`);

      return {
        ...extractedData,
        confidence: extractedData.confidence || 70,
      };
    } catch (error: any) {
      this.logger.error(`❌ Erro na extração: ${error.message}`);
      if (error.stack) {
        this.logger.error(`📚 Stack trace: ${error.stack}`);
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: DocumentStatus.NEEDS_REVIEW,
          extractedData: {
            error: error.message,
            ...((doc.extractedData as any) || {}),
          },
        },
      });

      throw new BadRequestException(`Erro na extração: ${error.message}`);
    } finally {
      if (tempFilePath) {
        try {
          await fs.promises.unlink(tempFilePath);
          this.logger.log(`🗑️ Arquivo temporário removido: ${tempFilePath}`);
        } catch (unlinkError) {
          this.logger.warn(
            `Não foi possível remover arquivo temporário: ${unlinkError.message}`,
          );
        }
      }
    }
  }

  async validate(documentId: string, extractedData: any, validatorId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { supplier: true },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    if (doc.processingStatus !== DocumentStatus.EXTRACTED) {
      throw new BadRequestException('Documento não está pronto para validação');
    }

    let batchIdToLink = doc.batchId;

    if (!batchIdToLink) {
      const validator = await this.prisma.user.findUnique({
        where: { id: validatorId },
        include: { company: true },
      });

      if (!validator || !validator.companyId) {
        throw new BadRequestException(
          'Validador não possui empresa associada para criar lote',
        );
      }

      let invoiceNumber =
        extractedData.invoiceNumber ||
        extractedData.nfNumber ||
        extractedData.numeroNota;

      if (!invoiceNumber && doc.originalName) {
        const patterns = [
          /(?:NFe|NF-e|NFS-e|NOTA\s*FISCAL)[\s-]*(\d+)/i,
          /(?:nota|fiscal)[\s-]*(\d+)/i,
          /(\d{30,44})/,
          /(\d{6,9})/,
        ];

        for (const pattern of patterns) {
          const match = doc.originalName.match(pattern);
          if (match && match[1]) {
            invoiceNumber = match[1];
            break;
          }
        }
      }

      if (!invoiceNumber) {
        invoiceNumber = Date.now().toString();
        this.logger.warn(
          `Número da nota não encontrado, usando timestamp: ${invoiceNumber}`,
        );
      }

      let finalBatchIdStr = `proveni-nf-${invoiceNumber}`;
      this.logger.log(`📦 Criando novo lote com ID: ${finalBatchIdStr}`);

      let existingBatch = await this.prisma.batch.findUnique({
        where: { batchId: finalBatchIdStr },
      });

      let counter = 1;
      while (existingBatch) {
        finalBatchIdStr = `proveni-nf-${invoiceNumber}-${counter}`;
        existingBatch = await this.prisma.batch.findUnique({
          where: { batchId: finalBatchIdStr },
        });
        counter++;
      }

      const companyName = validator.company?.name || validator.companyId;
      const countryOfOrigin = extractedData.countryOfOrigin || 'Brasil';
      const destinationCountry =
        extractedData.destinationCountry || 'União Europeia';

      // 🔧 CORREÇÃO: Salvar o IPFS hash do documento no lote
      const newBatch = await this.prisma.batch.create({
        data: {
          batchId: finalBatchIdStr,
          productName:
            extractedData.productName || doc.originalName || 'Produto sem nome',
          productDescription: `Lote criado a partir da NF ${invoiceNumber}`,
          quantity: extractedData.quantity
            ? parseFloat(extractedData.quantity)
            : null,
          unit: extractedData.unit || null,
          companyId: validator.companyId,
          status: BatchStatus.DRAFT,
          isCompliant: true,
          co2Emitted: extractedData.co2Emitted
            ? parseFloat(extractedData.co2Emitted)
            : 0,
          countryOfOrigin,
          destinationCountry,
          ipfsDocumentHash: doc.ipfsHash, // ✅ SALVAR O IPFS HASH AQUI
        },
      });
      batchIdToLink = newBatch.id;

      this.logger.log(
        `✅ Lote criado: ${finalBatchIdStr} (ID: ${newBatch.id}) com IPFS hash: ${doc.ipfsHash}`,
      );
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        batchId: batchIdToLink,
        isValidated: true,
        validatedById: validatorId,
        processingStatus: DocumentStatus.VALIDATED,
        extractedData: {
          ...(doc.extractedData as any),
          ...extractedData,
          validatedBy: validatorId,
          validatedAt: new Date().toISOString(),
        },
      },
    });

    if (batchIdToLink && doc.supplierId) {
      await this.prisma.batchSupplier.upsert({
        where: {
          batchId_supplierId: {
            batchId: batchIdToLink,
            supplierId: doc.supplierId,
          },
        },
        update: {
          co2Emitted: extractedData.co2Emitted
            ? parseFloat(extractedData.co2Emitted)
            : 0,
          productName:
            extractedData.productName || doc.originalName || 'Produto sem nome',
          documentId: doc.id,
        },
        create: {
          batchId: batchIdToLink,
          supplierId: doc.supplierId,
          co2Emitted: extractedData.co2Emitted
            ? parseFloat(extractedData.co2Emitted)
            : 0,
          productName:
            extractedData.productName || doc.originalName || 'Produto sem nome',
          documentId: doc.id,
        },
      });
    }

    return updated;
  }

  async registerOnBlockchain(
    documentId: string,
    specialistId: string,
    notes?: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        batch: {
          include: { company: true },
        },
        supplier: true,
      },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    if (doc.processingStatus !== DocumentStatus.VALIDATED) {
      throw new BadRequestException('Documento precisa ser validado primeiro');
    }

    if (!doc.batch?.batchId) {
      throw new BadRequestException(
        'Documento não está associado a nenhum lote',
      );
    }

    this.logger.log(`Registrando lote ${doc.batch.batchId} na blockchain...`);

    const extractedData = doc.extractedData as any;
    const companyName = doc.batch.company?.name || 'Empresa Desconhecida';
    const co2Emitted = doc.batch.co2Emitted || extractedData?.co2Emitted || 0;
    const countryOfOrigin =
      doc.batch.countryOfOrigin || extractedData?.countryOfOrigin || 'Brasil';
    const destinationCountry =
      doc.batch.destinationCountry ||
      extractedData?.destinationCountry ||
      'União Europeia';

    // 🔧 Usar o IPFS hash salvo no lote
    const ipfsDocumentHash = doc.batch.ipfsDocumentHash || doc.ipfsHash || '';

    let blockchainTxHash: string;
    try {
      const result = await this.blockchain.registerBatchOnChain(
        doc.batch.batchId,
        doc.batch.productName,
        co2Emitted,
        companyName,
        countryOfOrigin,
        destinationCountry,
        ipfsDocumentHash, // ✅ Agora usa o hash salvo no lote
      );
      blockchainTxHash = result.txHash;
      this.logger.log(`Transação confirmada: ${blockchainTxHash}`);
    } catch (error: any) {
      this.logger.error(`Erro ao registrar na blockchain: ${error.message}`);
      throw new BadRequestException(
        `Falha ao registrar na blockchain: ${error.message}`,
      );
    }

    await this.prisma.batch.update({
      where: { id: doc.batch.id },
      data: {
        blockchainTxHash,
        blockchainRegisteredAt: new Date(),
        status: BatchStatus.COMPLETED,
      },
    });

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: DocumentStatus.ON_CHAIN,
        extractedData: {
          ...(doc.extractedData as any),
          blockchainRegisteredAt: new Date().toISOString(),
          blockchainTxHash,
          specialistNotes: notes,
          registeredBy: specialistId,
        },
      },
    });

    return updated;
  }

  async auditBatchOnBlockchain(
    batchId: string,
    isCompliant: boolean,
    ipfsInspectionHash: string,
    specialistId: string,
  ) {
    this.logger.log(`Auditando lote ${batchId} na blockchain...`);

    try {
      const result = await this.blockchain.auditBatchOnChain(
        batchId,
        isCompliant,
        ipfsInspectionHash,
      );

      await this.prisma.batch.update({
        where: { batchId },
        data: {
          isCompliant,
          blockchainTxHash: result.txHash,
          blockchainRegisteredAt: new Date(),
          status: isCompliant ? BatchStatus.COMPLETED : BatchStatus.REJECTED,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error(`Erro ao auditar lote: ${error.message}`);
      throw new BadRequestException(`Falha ao auditar: ${error.message}`);
    }
  }

  async rejectDocument(
    documentId: string,
    specialistId: string,
    reason: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: DocumentStatus.REJECTED,
        validationNotes: reason,
        extractedData: {
          ...(doc.extractedData as any),
          rejectedAt: new Date().toISOString(),
          rejectedBy: specialistId,
          rejectionReason: reason,
        },
      },
    });

    return updated;
  }

  async findAwaitingReview() {
    return this.prisma.document.findMany({
      where: {
        processingStatus: DocumentStatus.VALIDATED,
      },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
        validatedBy: { select: { name: true } },
      },
    });
  }

  async findByStatus(status?: DocumentStatus | DocumentStatus[]) {
    const statusFilter = status
      ? Array.isArray(status)
        ? { in: status }
        : status
      : undefined;

    return this.prisma.document.findMany({
      where: statusFilter ? { processingStatus: statusFilter } : undefined,
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
        validatedBy: { select: { name: true } },
      },
    });
  }

  async findAll(batchId?: string) {
    return this.prisma.document.findMany({
      where: batchId ? { batchId } : undefined,
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        docType: true,
        processingStatus: true,
        ipfsHash: true,
        documentHash: true,
        uploadedAt: true,
        processedAt: true,
        uploadedBy: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: {
          select: {
            batchId: true,
            productName: true,
            countryOfOrigin: true,
            destinationCountry: true,
            ipfsDocumentHash: true,
          },
        },
        validatedBy: { select: { name: true } },
      },
    });
    if (!doc) throw new NotFoundException(`Documento ${id} não encontrado`);
    return doc;
  }

  async remove(id: string) {
    const doc = await this.findOne(id);
    await this.prisma.document.delete({ where: { id } });
    return { message: `Documento ${doc.originalName} removido com sucesso` };
  }

  private inferDocType(mimeType: string, filename: string): DocumentType {
    const ext = path.extname(filename).toLowerCase();
    if (mimeType === 'application/pdf' || ext === '.pdf')
      return DocumentType.INVOICE;
    if (mimeType.startsWith('image/')) return DocumentType.OTHER;
    if (['.xlsx', '.xls'].includes(ext)) return DocumentType.CARBON_REPORT;
    if (ext === '.xml') return DocumentType.INVOICE;
    return DocumentType.OTHER;
  }
}
