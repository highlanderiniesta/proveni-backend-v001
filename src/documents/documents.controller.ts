/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentStatus, Role } from '@prisma/client';
import { Roles } from '../common/guards/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * POST /documents/upload
   * Upload de documento - SUPPLIER, MANAGER e ADMIN podem enviar
   */
  @Post('upload')
  @Roles(Role.SUPPLIER, Role.ADMIN, Role.MANAGER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedMime =
          /^(application\/pdf|image\/(png|jpeg|bmp|tiff)|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|text\/xml|application\/xml)$/;
        if (allowedMime.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type'), false);
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Usuário ${user.id} (${user.role}) enviando documento: ${file.originalname}`,
    );
    return this.documentsService.upload(file, dto, user.id);
  }

  /**
   * GET /documents
   * Listar documentos - Todos os roles podem acessar com diferentes filtros
   */
  @Get()
  @Roles(
    Role.MANAGER,
    Role.ADMIN,
    Role.OPERATOR,
    Role.SPECIALIST,
    Role.SUPPLIER,
  )
  findAll(
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @CurrentUser() user?: any,
  ) {
    // SUPPLIER só vê seus próprios documentos
    if (user?.role === Role.SUPPLIER && user?.companyId) {
      return this.documentsService.findBySupplier(user.companyId);
    }

    // MANAGER, ADMIN, SPECIALIST podem ver documentos de um fornecedor específico
    if (
      supplierId &&
      [Role.MANAGER, Role.ADMIN, Role.SPECIALIST].includes(user?.role)
    ) {
      return this.documentsService.findBySupplier(supplierId);
    }

    // Filtrar por status
    if (status) {
      const statuses = status.split(',') as DocumentStatus[];
      return this.documentsService.findByStatus(statuses);
    }

    return this.documentsService.findAll(batchId);
  }

  /**
   * GET /documents/pending
   * Documentos pendentes de extração - OPERATOR, SPECIALIST e MANAGER
   */
  @Get('pending')
  @Roles(Role.OPERATOR, Role.SPECIALIST, Role.MANAGER)
  async findPending() {
    this.logger.log('Buscando documentos pendentes para extração');
    return this.documentsService.findByStatus([
      DocumentStatus.PENDING,
      DocumentStatus.PROCESSING,
      DocumentStatus.EXTRACTED,
    ]);
  }

  /**
   * GET /documents/awaiting-review
   * Documentos aguardando revisão - SPECIALIST e MANAGER
   */
  @Get('awaiting-review')
  @Roles(Role.SPECIALIST, Role.MANAGER)
  async findAwaitingReview() {
    this.logger.log('Buscando documentos aguardando revisão do especialista');
    return this.documentsService.findByStatus([DocumentStatus.VALIDATED]);
  }

  /**
   * GET /documents/manager
   * Documentos específicos do MANAGER (própria empresa)
   */
  @Get('manager/list')
  @Roles(Role.MANAGER)
  async findManagerDocuments(@CurrentUser() user: any) {
    if (!user?.companyId) {
      throw new HttpException(
        'Usuário não associado a empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.logger.log(`Manager ${user.id} buscando seus documentos`);
    return this.documentsService.findBySupplier(user.companyId);
  }

  /**
   * GET /documents/:id
   * Buscar documento por ID - Todos os roles autenticados
   */
  @Get(':id')
  @Roles(
    Role.MANAGER,
    Role.ADMIN,
    Role.OPERATOR,
    Role.SPECIALIST,
    Role.SUPPLIER,
  )
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  /**
   * POST /documents/:id/extract-ai
   * Extrair dados com IA - OPERATOR, SPECIALIST e MANAGER
   */
  @Post(':id/extract-ai')
  @Roles(Role.OPERATOR, Role.SPECIALIST, Role.MANAGER)
  async extractAi(@Param('id') documentId: string, @CurrentUser() user: any) {
    this.logger.log(
      `Usuário ${user.id} (${user.role}) solicitando extração IA para documento ${documentId}`,
    );
    const result = await this.documentsService.extractDataWithAi(
      documentId,
      user.id,
    );
    return {
      message: 'Extração concluída com sucesso',
      data: result,
    };
  }

  /**
   * POST /documents/:id/validate
   * Validar documento extraído - OPERATOR, SPECIALIST e MANAGER
   */
  @Post(':id/validate')
  @Roles(Role.OPERATOR, Role.SPECIALIST, Role.MANAGER)
  async validate(
    @Param('id') documentId: string,
    @Body('extractedData') extractedData: any,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Usuário ${user.id} (${user.role}) validando documento ${documentId}`,
    );
    const result = await this.documentsService.validate(
      documentId,
      extractedData,
      user.id,
    );
    return {
      message: 'Documento validado e enviado para especialista',
      data: result,
    };
  }

  /**
   * POST /documents/:id/blockchain/register
   * Registrar na blockchain - SPECIALIST e ADMIN
   */
  @Post(':id/blockchain/register')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async registerOnBlockchain(
    @Param('id') documentId: string,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Especialista ${user.id} registrando documento ${documentId} na blockchain`,
    );
    const result = await this.documentsService.registerOnBlockchain(
      documentId,
      user.id,
      notes,
    );
    return {
      message: 'Documento registrado na blockchain com sucesso',
      data: result,
    };
  }

  /**
   * POST /documents/:id/blockchain/audit
   * Auditar lote diretamente na blockchain (compliance) - SPECIALIST e ADMIN
   */
  @Post(':id/blockchain/audit')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async auditOnBlockchain(
    @Param('id') documentId: string,
    @Body() body: { isCompliant: boolean; ipfsInspectionHash: string },
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Especialista ${user.id} auditando documento ${documentId} na blockchain`,
    );

    const doc = await this.documentsService.findOne(documentId);
    if (!doc.batch?.batchId) {
      throw new HttpException(
        'Documento não está associado a um lote',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.documentsService.auditBatchOnBlockchain(
      doc.batch.batchId,
      body.isCompliant,
      body.ipfsInspectionHash,
      user.id,
    );

    return {
      message: body.isCompliant
        ? 'Lote aprovado e certificado na blockchain'
        : 'Lote reprovado na blockchain',
      data: result,
    };
  }

  /**
   * POST /documents/:id/reject
   * Rejeitar documento - SPECIALIST e ADMIN
   */
  @Post(':id/reject')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async reject(
    @Param('id') documentId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Especialista ${user.id} rejeitando documento ${documentId}. Motivo: ${reason}`,
    );
    const result = await this.documentsService.rejectDocument(
      documentId,
      user.id,
      reason,
    );
    return {
      message: 'Documento rejeitado',
      data: result,
    };
  }

  /**
   * DELETE /documents/:id
   * Remover documento - ADMIN e MANAGER
   */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  /**
   * GET /documents/:id/ocr-debug
   * Retorna o texto extraído pelo OCR para debug
   */
  @Get(':id/ocr-debug')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getOcrDebug(@Param('id') documentId: string) {
    const doc = await this.documentsService.findOne(documentId);

    // 🔧 Extrair texto com segurança, tratando o tipo JsonValue
    let extractedText: string | null = null;
    let fullText: string | null = null;

    if (doc.extractedData && typeof doc.extractedData === 'object') {
      const extractedDataObj = doc.extractedData as Record<string, any>;
      if (extractedDataObj.text && typeof extractedDataObj.text === 'string') {
        extractedText = extractedDataObj.text;
        fullText = extractedText.substring(0, 2000);
      }
    }

    return {
      id: doc.id,
      originalName: doc.originalName,
      processingStatus: doc.processingStatus,
      extractedText: extractedText,
      extractedData: doc.extractedData,
      confidenceScore: doc.confidenceScore,
      fullText: fullText,
    };
  }
}
