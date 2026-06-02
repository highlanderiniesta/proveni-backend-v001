/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/blockchain/blockchain.controller.ts
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { BlockchainService, BlockchainBatchData } from './blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('blockchain')
export class BlockchainController {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // 🔓 ROTAS PÚBLICAS (Para Alfândega)
  // ============================================================

  @Get('batch/:batchId')
  async getBatch(@Param('batchId') batchId: string) {
    const batch = await this.blockchainService.getFullBatch(batchId);

    if (!batch) {
      throw new HttpException(
        {
          success: false,
          message: 'Lote não encontrado na blockchain',
          batchId,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      data: batch,
      verifiedAt: new Date().toISOString(),
    };
  }

  @Get('batch/:batchId/quick')
  async quickVerify(@Param('batchId') batchId: string) {
    const result = await this.blockchainService.quickVerify(batchId);

    return {
      success: true,
      batchId,
      isCompliant: result.isCompliant,
      hasCertificate: result.hasCertificate,
      message: result.isCompliant
        ? '✅ Produto aprovado para exportação'
        : '❌ Produto não conforme',
    };
  }

  @Get('batch/:batchId/exists')
  async checkBatchExists(@Param('batchId') batchId: string) {
    const exists = await this.blockchainService.isBatchRegistered(batchId);

    return {
      success: true,
      batchId,
      exists,
    };
  }

  @Get('batches')
  async getAllBatches() {
    const batches = await this.blockchainService.getAllBatches();

    return {
      success: true,
      count: batches.length,
      data: batches,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('batches/paginated')
  async getBatchesPaginated(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.blockchainService.getBatchesPaginated(
      page,
      limit,
    );

    return {
      success: true,
      ...result,
    };
  }

  @Get('batches/recent')
  async getRecentBatches(
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    const batches = await this.blockchainService.getRecentBatches(limit);

    return {
      success: true,
      count: batches.length,
      data: batches,
    };
  }

  @Get('stats')
  async getStats() {
    const stats = await this.blockchainService.getSystemStats();
    const health = await this.blockchainService.healthCheck();

    return {
      success: true,
      data: {
        ...stats,
        network: {
          connected: health.connected,
          blockNumber: health.blockNumber,
          contractAddress: health.contractAddress,
        },
      },
    };
  }

  @Get('health')
  async healthCheck() {
    const health = await this.blockchainService.healthCheck();

    return {
      success: health.connected,
      status: health.connected ? 'online' : 'offline',
      ...health,
    };
  }

  @Get('auditors')
  async getAllAuditors() {
    const auditors = await this.blockchainService.getAllAuditors();

    return {
      success: true,
      count: auditors.length,
      data: auditors,
    };
  }

  @Get('auditors/:address/check')
  async checkAuditor(@Param('address') address: string) {
    const isAuditor = await this.blockchainService.isAuditor(address);

    return {
      success: true,
      address,
      isAuditor,
    };
  }

  @Get('batch/:batchId/traceability')
  async getFullTraceability(@Param('batchId') batchId: string) {
    const blockchainData = await this.blockchainService.getFullBatch(batchId);

    if (!blockchainData) {
      throw new HttpException(
        { success: false, message: 'Lote não encontrado' },
        HttpStatus.NOT_FOUND,
      );
    }

    const batchWithSuppliers = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        company: { select: { name: true, cnpj: true } },
        batchSuppliers: {
          include: {
            supplier: { select: { name: true, cnpj: true, email: true } },
            document: {
              select: { id: true, ipfsHash: true, originalName: true },
            },
          },
        },
      },
    });

    return {
      success: true,
      batchId,
      verifiedAt: new Date().toISOString(),
      blockchain: {
        registeredAt: blockchainData.registeredAt,
        registeredBy: blockchainData.registeredBy,
        auditedBy: blockchainData.auditedBy,
        nftTokenId: blockchainData.nftTokenId,
      },
      product: {
        name: blockchainData.productName,
        totalCO2: blockchainData.co2Emitted,
        isCompliant: blockchainData.isCompliant,
        countryOfOrigin: blockchainData.countryOfOrigin,
        destinationCountry: blockchainData.destinationCountry,
      },
      exporter: {
        name: batchWithSuppliers?.company?.name || blockchainData.companyName,
        cnpj: batchWithSuppliers?.company?.cnpj || '—',
      },
      documents: {
        documentHash: blockchainData.ipfsDocumentHash,
        documentUrl: blockchainData.ipfsDocumentHash
          ? `https://gateway.pinata.cloud/ipfs/${blockchainData.ipfsDocumentHash}`
          : '',
        inspectionHash: blockchainData.ipfsInspectionHash,
        inspectionUrl: blockchainData.ipfsInspectionHash
          ? `https://gateway.pinata.cloud/ipfs/${blockchainData.ipfsInspectionHash}`
          : '',
      },
    };
  }

  // ============================================================
  // 🔒 ROTAS DE ESCRITA (Autenticadas)
  // ============================================================

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async registerBatch(
    @Body()
    body: {
      batchId: string;
      productName: string;
      co2Emitted: number;
      companyName: string;
      countryOfOrigin: string;
      destinationCountry: string;
      ipfsDocumentHash: string;
    },
    @CurrentUser() user: any,
  ) {
    try {
      const result = await this.blockchainService.registerBatchOnChain(
        body.batchId,
        body.productName,
        body.co2Emitted,
        body.companyName,
        body.countryOfOrigin,
        body.destinationCountry,
        body.ipfsDocumentHash,
      );

      return {
        success: true,
        message: 'Lote registrado na blockchain',
        batchId: body.batchId,
        txHash: result.txHash,
        registeredBy: user.id,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('audit/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async auditBatch(
    @Param('batchId') batchId: string,
    @Body() body: { isCompliant: boolean; ipfsInspectionHash?: string },
    @CurrentUser() user: any,
  ) {
    try {
      // 🔧 Se for aprovação e nenhum hash foi fornecido, gera um placeholder automático
      let inspectionHash = body.ipfsInspectionHash || '';
      if (body.isCompliant && !inspectionHash) {
        inspectionHash = `approved-by-specialist-${Date.now()}`;
      }

      const result = await this.blockchainService.auditBatchOnChain(
        batchId,
        body.isCompliant,
        inspectionHash,
      );

      return {
        success: true,
        message: body.isCompliant
          ? 'Lote aprovado e certificado emitido'
          : 'Lote reprovado',
        batchId,
        txHash: result.txHash,
        auditedBy: user.id,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('auditors/add')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async addAuditor(
    @Body() body: { address: string },
    @CurrentUser() user: any,
  ) {
    try {
      const result = await this.blockchainService.addAuditor(body.address);

      return {
        success: true,
        message: 'Auditor adicionado com sucesso',
        address: body.address,
        txHash: result.txHash,
        addedBy: user.id,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('auditors/remove')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async removeAuditor(
    @Body() body: { address: string },
    @CurrentUser() user: any,
  ) {
    try {
      const result = await this.blockchainService.removeAuditor(body.address);

      return {
        success: true,
        message: 'Auditor removido com sucesso',
        address: body.address,
        txHash: result.txHash,
        removedBy: user.id,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':batchId/validate')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async validateConsistency(@Param('batchId') batchId: string) {
    return this.blockchainService.validateConsistency(batchId);
  }
}
