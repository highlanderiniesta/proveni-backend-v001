// src/manager/manager.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { ManagerService } from './manager.service';
import { CreateManagerBatchDto } from './dto/create-manager.dto';

@Controller('manager')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  /**
   * POST /manager/batches/create
   * Criar lote final com fornecedores vinculados
   */
  // src/manager/manager.controller.ts - No método createFinalBatch
  @Post('batches/create')
  @Roles(Role.MANAGER, Role.ADMIN)
  async createFinalBatch(
    @CurrentUser() user: any,
    @Body() dto: CreateManagerBatchDto,
  ) {
    console.log('🔵 POST /manager/batches/create foi chamado!');
    console.log('📦 DTO recebido:', JSON.stringify(dto, null, 2));

    if (!user.companyId) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.managerService.createFinalBatch(user.companyId, dto);
  }

  /**
   * GET /manager/suppliers
   * Listar fornecedores disponíveis para o manager
   */
  @Get('suppliers')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getAvailableSuppliers(@CurrentUser() user: any) {
    if (!user.companyId) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.managerService.getAvailableSuppliers(user.companyId, user.role);
  }

  /**
   * GET /manager/documents
   * Listar documentos do próprio manager
   */
  @Get('documents')
  @Roles(Role.MANAGER, Role.ADMIN)
  async getManagerDocuments(@CurrentUser() user: any) {
    if (!user.companyId) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.managerService.getManagerDocuments(user.companyId);
  }

  /**
   * GET /manager/documents/all
   * Listar documentos de TODOS os fornecedores vinculados
   */
  @Get('documents/all')
  @Roles(Role.MANAGER, Role.ADMIN)
  async getAllSupplierDocuments(@CurrentUser() user: any) {
    if (!user.companyId) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.managerService.getAllSupplierDocuments(user.companyId);
  }

  /**
   * GET /manager/stats
   * Estatísticas do manager
   */
  @Get('stats')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getManagerStats(@CurrentUser() user: any) {
    if (!user.companyId) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.managerService.getManagerStats(user.companyId);
  }

  /**
   * POST /manager/batches/:batchId/suppliers
   * Adicionar fornecedor a um lote existente
   */
  @Post('batches/:batchId/suppliers')
  @Roles(Role.MANAGER, Role.ADMIN)
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
    if (!user.companyId) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.managerService.linkSupplierToBatch(
      batchId,
      body,
      user.companyId,
    );
  }
}
