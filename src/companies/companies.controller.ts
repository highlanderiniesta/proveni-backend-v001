/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/companies/companies.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { CreateCompanyWithManagerDto } from './dto/create-company-with-manager.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SPECIALIST)
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('dashboard')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getDashboard(@CurrentUser() user: any) {
    return this.companiesService.getDashboardStats(user.companyId, user.role);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SPECIALIST &&
      user.companyId !== id
    ) {
      throw new HttpException('Acesso negado', HttpStatus.FORBIDDEN);
    }
    return this.companiesService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateCompanyDto>,
    @CurrentUser() user: any,
  ) {
    // Verificar permissão: apenas ADMIN ou SPECIALIST, ou a própria empresa
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SPECIALIST &&
      user.companyId !== id
    ) {
      throw new HttpException('Acesso negado', HttpStatus.FORBIDDEN);
    }
    return this.companiesService.update(id, updateDto);
  }

  @Post('with-manager')
  @Roles(Role.ADMIN, Role.SPECIALIST)
  async createCompanyWithManager(@Body() dto: CreateCompanyWithManagerDto) {
    return this.companiesService.createCompanyWithManager(dto);
  }

  @Get('stats/system')
  @Roles(Role.ADMIN, Role.SPECIALIST)
  async getSystemStats() {
    return this.companiesService.getSystemStats();
  }

  /**
   * GET /companies/:id/export-stats
   * Estatísticas de exportação da empresa
   */
  @Get(':id/export-stats')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  async getExportStats(@Param('id') id: string, @CurrentUser() user: any) {
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SPECIALIST &&
      user.companyId !== id
    ) {
      throw new HttpException('Acesso negado', HttpStatus.FORBIDDEN);
    }
    return this.companiesService.getExportStats(id);
  }
}
