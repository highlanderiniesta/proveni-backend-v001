/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import * as bcrypt from 'bcryptjs';
import { CreateCompanyWithManagerDto } from './dto/create-company-with-manager.dto';
import { Role, BatchStatus } from '@prisma/client';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({
      where: { cnpj: data.cnpj },
    });
    if (existing) {
      throw new ConflictException('CNPJ já cadastrado');
    }

    return this.prisma.company.create({
      data: {
        name: data.name,
        cnpj: data.cnpj,
        email: data.email,
        phone: data.phone,
        companyType: data.companyType,
        plan: data.plan,
      },
    });
  }

  async findAll() {
    return this.prisma.company.findMany({
      include: {
        users: { select: { id: true, name: true, email: true, role: true } },
        batches: { take: 5, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true } },
        suppliersTo: {
          include: {
            supplier: { select: { id: true, name: true, cnpj: true } },
          },
          where: { status: 'ACTIVE' },
        },
        batches: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  async update(id: string, data: Partial<CreateCompanyDto>) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async getDashboardStats(companyId?: string, userRole?: string) {
    // Para SPECIALIST (sem companyId), retorna estatísticas de todas as empresas
    if (!companyId || userRole === Role.SPECIALIST) {
      const [
        totalBatches,
        compliantBatches,
        totalCO2,
        totalSuppliers,
        totalCertificates,
      ] = await Promise.all([
        this.prisma.batch.count(),
        this.prisma.batch.count({ where: { isCompliant: true } }),
        this.prisma.batch.aggregate({ _sum: { co2Emitted: true } }),
        this.prisma.companySupplier.count({ where: { status: 'ACTIVE' } }),
        this.prisma.batch.count({
          where: {
            status: BatchStatus.COMPLETED,
            blockchainTxHash: { not: null },
          },
        }),
      ]);

      return {
        totalBatches,
        compliantRate:
          totalBatches > 0 ? (compliantBatches / totalBatches) * 100 : 0,
        totalCO2: totalCO2._sum.co2Emitted || 0,
        totalSuppliers,
        totalCertificates,
      };
    }

    // Para MANAGER e ADMIN com companyId
    const [
      totalBatches,
      compliantBatches,
      totalCO2,
      totalSuppliers,
      totalCertificates,
    ] = await Promise.all([
      this.prisma.batch.count({ where: { companyId } }),
      this.prisma.batch.count({ where: { companyId, isCompliant: true } }),
      this.prisma.batch.aggregate({
        where: { companyId },
        _sum: { co2Emitted: true },
      }),
      this.prisma.companySupplier.count({
        where: { companyId, status: 'ACTIVE' },
      }),
      this.prisma.batch.count({
        where: {
          companyId,
          status: BatchStatus.COMPLETED,
          blockchainTxHash: { not: null },
        },
      }),
    ]);

    return {
      totalBatches,
      compliantRate:
        totalBatches > 0 ? (compliantBatches / totalBatches) * 100 : 0,
      totalCO2: totalCO2._sum.co2Emitted || 0,
      totalSuppliers,
      totalCertificates,
    };
  }

  async getExportStats(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const [batches, totalValue] = await Promise.all([
      this.prisma.batch.findMany({
        where: { companyId },
        select: {
          batchId: true,
          productName: true,
          countryOfOrigin: true,
          destinationCountry: true,
          totalValue: true,
          currency: true,
          incoterm: true,
          shippingDate: true,
          status: true,
          isCompliant: true,
          blockchainTxHash: true,
          nftTokenId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.batch.aggregate({
        where: { companyId, totalValue: { not: null } },
        _sum: { totalValue: true },
      }),
    ]);

    const exportedBatches = batches.filter(
      (b) => b.status === BatchStatus.COMPLETED,
    );
    const compliantBatches = batches.filter((b) => b.isCompliant);
    const onChainBatches = batches.filter((b) => b.blockchainTxHash);

    return {
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
      },
      summary: {
        totalBatches: batches.length,
        exportedBatches: exportedBatches.length,
        compliantBatches: compliantBatches.length,
        onChainBatches: onChainBatches.length,
        totalExportValue: totalValue._sum.totalValue || 0,
        currency: 'BRL',
      },
      recentBatches: batches.slice(0, 10),
      destinations: await this.getDestinationStats(companyId),
    };
  }

  private async getDestinationStats(companyId: string) {
    const destinations = await this.prisma.batch.groupBy({
      by: ['destinationCountry'],
      where: { companyId, destinationCountry: { not: null } },
      _count: { destinationCountry: true },
      _sum: { totalValue: true },
    });

    return destinations.map((d) => ({
      country: d.destinationCountry,
      batchCount: d._count.destinationCountry,
      totalValue: d._sum.totalValue || 0,
    }));
  }

  async createCompanyWithManager(data: CreateCompanyWithManagerDto) {
    const existingCompany = await this.prisma.company.findUnique({
      where: { cnpj: data.companyCnpj },
    });
    if (existingCompany) {
      throw new ConflictException('CNPJ já cadastrado');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.managerEmail },
    });
    if (existingUser) {
      throw new ConflictException('E-mail do gerente já cadastrado');
    }

    const company = await this.prisma.company.create({
      data: {
        name: data.companyName,
        cnpj: data.companyCnpj,
        email: data.companyEmail,
        phone: data.companyPhone,
        companyType: 'CLIENT',
        plan: data.plan,
        status: 'ACTIVE',
      },
    });

    const hashedPassword = await bcrypt.hash(data.managerPassword, 10);
    const manager = await this.prisma.user.create({
      data: {
        name: data.managerName,
        email: data.managerEmail,
        passwordHash: hashedPassword,
        role: Role.MANAGER,
        companyId: company.id,
        isActive: true,
      },
    });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    await this.prisma.metric.upsert({
      where: {
        companyId_periodType_periodDate: {
          companyId: company.id,
          periodType: 'MONTH',
          periodDate: startOfMonth,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        periodType: 'MONTH',
        periodDate: startOfMonth,
        totalBatches: 0,
        totalCo2Emitted: 0,
        totalSuppliers: 0,
        activeSuppliers: 0,
        blockedSuppliers: 0,
        totalOnChainBatches: 0,
      },
    });

    this.logger.log(
      `Empresa ${company.name} e gerente ${manager.email} criados com sucesso`,
    );

    return {
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        email: company.email,
        plan: company.plan,
      },
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        role: manager.role,
      },
      message: 'Empresa e gerente criados com sucesso!',
      loginInfo: {
        email: manager.email,
        password: data.managerPassword,
      },
    };
  }

  async getSystemStats() {
    const [
      totalCompanies,
      totalUsers,
      totalBatches,
      totalDocuments,
      totalOnChainBatches,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count(),
      this.prisma.batch.count(),
      this.prisma.document.count(),
      this.prisma.batch.count({ where: { blockchainTxHash: { not: null } } }),
    ]);

    return {
      totalCompanies,
      totalUsers,
      totalBatches,
      totalDocuments,
      totalOnChainBatches,
      lastUpdate: new Date().toISOString(),
    };
  }
}
