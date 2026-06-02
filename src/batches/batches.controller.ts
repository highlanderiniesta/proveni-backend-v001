/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/decorators/roles.decorator';
import { Role, BatchStatus } from '@prisma/client';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';

@Controller('batches')
export class BatchesController {
  private readonly logger = new Logger(BatchesController.name);

  constructor(private batchesService: BatchesService) {}

  // ============================================================
  // 🔓 ROTAS PÚBLICAS (Não precisam de autenticação)
  // ============================================================

  @Get('public/:batchId/suppliers')
  async getPublicBatchSuppliers(@Param('batchId') batchId: string) {
    return this.batchesService.getBatchSuppliersPublic(batchId);
  }

  @Get('public/:batchId')
  async getPublicBatch(@Param('batchId') batchId: string) {
    return this.batchesService.getBatchPublic(batchId);
  }

  // ============================================================
  // 🔒 ROTAS PROTEGIDAS (Precisam de autenticação)
  // ============================================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.OPERATOR) // ❌ SPECIALIST removido
  create(@CurrentUser() user: any, @Body() createDto: CreateBatchDto) {
    if (!user.companyId && user.role !== Role.SPECIALIST) {
      throw new HttpException(
        'Usuário não está associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.batchesService.create(user.companyId, createDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  findAll(@CurrentUser() user: any) {
    return this.batchesService.findAllByCompany(user.companyId, user.role);
  }

  @Get('supplier/available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getAvailableBatches(@CurrentUser() user: any) {
    return this.batchesService.findAllByCompany(user.companyId);
  }

  @Post(':batchId/suppliers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST, Role.OPERATOR)
  async addSupplierToBatch(
    @Param('batchId') batchId: string,
    @Body()
    body: {
      supplierId: string;
      productName: string;
      quantity?: number;
      unit?: string;
      co2Emitted?: number;
      documentId?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (!user.companyId && user.role !== Role.SPECIALIST) {
      throw new HttpException(
        'Usuário não está associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.batchesService.addSupplierToBatch(
      batchId,
      body,
      user.companyId,
    );
  }

  @Get(':batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  findOne(@CurrentUser() user: any, @Param('batchId') batchId: string) {
    return this.batchesService.findOne(batchId, user.companyId, user.role);
  }

  @Patch(':batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async updateBatch(
    @Param('batchId') batchId: string,
    @Body()
    updateData: {
      ipfsDocumentHash?: string;
      isCompliant?: boolean;
      status?: BatchStatus;
      productName?: string;
      productDescription?: string;
      countryOfOrigin?: string;
      destinationCountry?: string;
      totalValue?: number;
      currency?: string;
      incoterm?: string;
    },
    @CurrentUser() user: any,
  ) {
    this.logger.log(`Usuário ${user.id} atualizando lote ${batchId}`);
    return this.batchesService.updateBatch(
      batchId,
      updateData,
      user.companyId,
      user.role,
    );
  }

  @Post(':batchId/calculate-co2')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  calculateCO2(@Param('batchId') batchId: string) {
    return this.batchesService.calculateTotalCO2(batchId);
  }

  @Get(':batchId/compliance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getCompliance(@Param('batchId') batchId: string) {
    return this.batchesService.getComplianceStatus(batchId);
  }

  @Post(':batchId/register-blockchain')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async registerBlockchain(
    @Param('batchId') batchId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Especialista ${user.id} registrando lote ${batchId} na blockchain`,
    );
    return this.batchesService.registerOnBlockchain(batchId, user.id);
  }

  @Post(':batchId/audit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async auditBatch(
    @Param('batchId') batchId: string,
    @Body() body: { isCompliant: boolean; ipfsInspectionHash?: string },
    @CurrentUser() user: any,
  ) {
    // ✅ Validação removida – o service gerará placeholder se necessário
    return this.batchesService.auditBatchOnBlockchain(
      batchId,
      body.isCompliant,
      body.ipfsInspectionHash || '',
      user.id,
    );
  }

  @Post(':batchId/export-to-blockchain')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async exportToBlockchain(
    @Param('batchId') batchId: string,
    @CurrentUser() user: any,
  ) {
    return this.batchesService.exportBatchToBlockchain(batchId, user.id);
  }

  @Get('blockchain/:batchId')
  async getFromBlockchain(@Param('batchId') batchId: string) {
    return this.batchesService.getBatchFromBlockchain(batchId);
  }

  @Get('blockchain/:batchId/verify')
  async quickVerify(@Param('batchId') batchId: string) {
    return this.batchesService.quickBlockchainVerify(batchId);
  }

  @Get(':batchId/traceability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST, Role.SUPPLIER)
  async getTraceability(@Param('batchId') batchId: string) {
    return this.batchesService.getFullTraceability(batchId);
  }

  @Patch(':batchId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async updateStatus(
    @Param('batchId') batchId: string,
    @Body('status') status: BatchStatus,
  ) {
    if (!Object.values(BatchStatus).includes(status)) {
      throw new HttpException('Status inválido', HttpStatus.BAD_REQUEST);
    }
    return this.batchesService.updateStatus(batchId, status);
  }

  @Get('stats/export-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getExportSummary(@CurrentUser() user: any) {
    return this.batchesService.getExportSummary(user.companyId, user.role);
  }

  @Post(':batchId/update-compliance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async updateCompliance(@Param('batchId') batchId: string) {
    return this.batchesService.updateComplianceStatus(batchId);
  }

  @Get(':batchId/certificate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getCertificate(@Param('batchId') batchId: string) {
    return this.batchesService.getCertificateInfo(batchId);
  }
}
