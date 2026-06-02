/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpException,
  HttpStatus,
  Patch,
  Query,
} from '@nestjs/common';
import { CompanySuppliersService } from './company-suppliers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { CreateSupplierDirectlyDto } from './dto/create-company-supplier.dto';

@Controller('company-suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanySuppliersController {
  constructor(private companySuppliersService: CompanySuppliersService) {}

  @Post('direct')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  createDirect(
    @CurrentUser() user: any,
    @Body() dto: CreateSupplierDirectlyDto,
  ) {
    const companyId =
      user.role === Role.ADMIN || user.role === Role.SPECIALIST
        ? dto.companyId
        : user.companyId;

    if (!companyId) {
      throw new HttpException(
        'companyId é obrigatório',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.companySuppliersService.createSupplierDirectly(companyId, dto);
  }

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getSuppliers(@CurrentUser() user: any) {
    const companyId = user.companyId;

    if (!companyId && user.role !== Role.SPECIALIST) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.companySuppliersService.getSuppliersByCompany(
      companyId,
      user.role,
    );
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.SPECIALIST)
  getAllSuppliers(@CurrentUser() user: any) {
    return this.companySuppliersService.getAllSuppliers();
  }

  @Get(':supplierId')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getSupplierById(
    @CurrentUser() user: any,
    @Param('supplierId') supplierId: string,
  ) {
    const companyId = user.companyId;
    return this.companySuppliersService.getSupplierById(companyId, supplierId);
  }

  @Delete(':supplierId')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  blockSupplier(
    @CurrentUser() user: any,
    @Param('supplierId') supplierId: string,
  ) {
    if (!user.companyId && user.role !== Role.SPECIALIST) {
      throw new HttpException(
        'Usuário não associado a uma empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.companySuppliersService.blockSupplier(
      user.companyId,
      supplierId,
    );
  }

  @Patch(':supplierId/activate')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  activateSupplier(
    @CurrentUser() user: any,
    @Param('supplierId') supplierId: string,
  ) {
    return this.companySuppliersService.activateSupplier(
      user.companyId,
      supplierId,
    );
  }

  @Get('stats/summary')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getSuppliersStats(@CurrentUser() user: any) {
    const companyId = user.companyId;
    return this.companySuppliersService.getSuppliersStats(companyId, user.role);
  }

  @Get(':supplierId/batches')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getSupplierBatches(
    @CurrentUser() user: any,
    @Param('supplierId') supplierId: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = user.companyId;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.companySuppliersService.getSupplierBatches(
      companyId,
      supplierId,
      limitNum,
    );
  }
}
