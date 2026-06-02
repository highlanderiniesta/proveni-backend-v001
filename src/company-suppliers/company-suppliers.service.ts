/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDirectlyDto } from './dto/create-company-supplier.dto';
import { Role, SupplierRelationshipStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CompanySuppliersService {
  private readonly logger = new Logger(CompanySuppliersService.name);

  constructor(private prisma: PrismaService) {}

  async createSupplierDirectly(
    companyId: string,
    dto: CreateSupplierDirectlyDto,
  ) {
    // Verificar se a empresa existe
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Empresa ${companyId} não encontrada`);
    }

    // Verificar se o CNPJ do fornecedor já existe
    let supplier = await this.prisma.company.findUnique({
      where: { cnpj: dto.supplierCnpj },
    });

    // Se o fornecedor não existe, criar
    if (!supplier) {
      supplier = await this.prisma.company.create({
        data: {
          name: dto.supplierName,
          cnpj: dto.supplierCnpj,
          email: dto.supplierEmail,
          phone: dto.supplierPhone,
          companyType: 'SUPPLIER',
          plan: 'BASIC',
          status: 'ACTIVE',
        },
      });
      this.logger.log(`Fornecedor ${supplier.name} criado com sucesso`);
    }

    // Verificar se o relacionamento já existe
    const existingRelation = await this.prisma.companySupplier.findFirst({
      where: {
        companyId,
        supplierId: supplier.id,
      },
    });

    if (existingRelation) {
      if (existingRelation.status === 'ACTIVE') {
        throw new ConflictException('Fornecedor já vinculado a esta empresa');
      }
      // Se estava bloqueado, reativar
      return this.prisma.companySupplier.update({
        where: { id: existingRelation.id },
        data: {
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              cnpj: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    }

    // Criar relacionamento
    const relation = await this.prisma.companySupplier.create({
      data: {
        companyId,
        supplierId: supplier.id,
        status: 'ACTIVE',
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Criar usuário para o fornecedor (opcional)
    await this.createSupplierUserIfNeeded(supplier, dto);

    this.logger.log(
      `Fornecedor ${supplier.name} vinculado à empresa ${company.name}`,
    );

    return {
      success: true,
      message: 'Fornecedor vinculado com sucesso',
      data: relation,
    };
  }

  private async createSupplierUserIfNeeded(
    supplier: any,
    dto: CreateSupplierDirectlyDto,
  ) {
    // Verificar se já existe um usuário para este fornecedor
    const existingUser = await this.prisma.user.findFirst({
      where: {
        companyId: supplier.id,
        role: 'SUPPLIER',
      },
    });

    if (existingUser) {
      this.logger.log(`Usuário já existe para fornecedor ${supplier.name}`);
      return existingUser;
    }

    // Gerar senha temporária se não fornecida
    const tempPassword = dto.supplierPassword || this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Criar usuário do tipo SUPPLIER
    const user = await this.prisma.user.create({
      data: {
        name: dto.supplierName,
        email: dto.supplierEmail,
        passwordHash: hashedPassword,
        role: 'SUPPLIER',
        companyId: supplier.id,
        isActive: true,
      },
    });

    this.logger.log(`Usuário criado para fornecedor ${supplier.name}`);

    return {
      user,
      tempPassword,
    };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async getSuppliersByCompany(companyId?: string, userRole?: string) {
    // Para SPECIALIST (sem companyId), retorna todos os fornecedores de todas as empresas
    if (!companyId || userRole === Role.SPECIALIST) {
      const allRelations = await this.prisma.companySupplier.findMany({
        where: { status: 'ACTIVE' },
        include: {
          company: { select: { id: true, name: true, cnpj: true } },
          supplier: { select: { id: true, name: true, cnpj: true, email: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return allRelations;
    }

    const suppliers = await this.prisma.companySupplier.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return suppliers;
  }

  async getAllSuppliers() {
    return this.prisma.company.findMany({
      where: { companyType: 'SUPPLIER', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        companyType: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getSupplierById(companyId: string | undefined, supplierId: string) {
    const relation = await this.prisma.companySupplier.findFirst({
      where: {
        supplierId,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        supplier: {
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });

    if (!relation) {
      throw new NotFoundException(`Fornecedor ${supplierId} não encontrado`);
    }

    return relation;
  }

  async blockSupplier(companyId: string | undefined, supplierId: string) {
    const relation = await this.prisma.companySupplier.findFirst({
      where: {
        supplierId,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!relation) {
      throw new NotFoundException(`Relação com fornecedor ${supplierId} não encontrada`);
    }

    const updated = await this.prisma.companySupplier.update({
      where: { id: relation.id },
      data: {
        status: 'BLOCKED',
        updatedAt: new Date(),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Fornecedor ${updated.supplier.name} bloqueado`);

    return {
      success: true,
      message: 'Fornecedor bloqueado com sucesso',
      data: updated,
    };
  }

  async activateSupplier(companyId: string | undefined, supplierId: string) {
    const relation = await this.prisma.companySupplier.findFirst({
      where: {
        supplierId,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!relation) {
      throw new NotFoundException(`Relação com fornecedor ${supplierId} não encontrada`);
    }

    if (relation.status === 'ACTIVE') {
      throw new BadRequestException('Fornecedor já está ativo');
    }

    const updated = await this.prisma.companySupplier.update({
      where: { id: relation.id },
      data: {
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Fornecedor ${updated.supplier.name} reativado`);

    return {
      success: true,
      message: 'Fornecedor reativado com sucesso',
      data: updated,
    };
  }

  async getSuppliersStats(companyId?: string, userRole?: string) {
    // Para SPECIALIST, estatísticas de todas as empresas
    if (!companyId || userRole === Role.SPECIALIST) {
      const [totalSuppliers, activeSuppliers, blockedSuppliers, totalBatches] = await Promise.all([
        this.prisma.companySupplier.count(),
        this.prisma.companySupplier.count({ where: { status: 'ACTIVE' } }),
        this.prisma.companySupplier.count({ where: { status: 'BLOCKED' } }),
        this.prisma.batchSupplier.count(),
      ]);

      return {
        totalSuppliers,
        activeSuppliers,
        blockedSuppliers,
        inactiveSuppliers: totalSuppliers - activeSuppliers - blockedSuppliers,
        totalSupplierBatches: totalBatches,
        activeRate: totalSuppliers > 0 ? (activeSuppliers / totalSuppliers) * 100 : 0,
      };
    }

    // Para empresa específica
    const [totalSuppliers, activeSuppliers, blockedSuppliers, totalBatches] = await Promise.all([
      this.prisma.companySupplier.count({ where: { companyId } }),
      this.prisma.companySupplier.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.companySupplier.count({ where: { companyId, status: 'BLOCKED' } }),
      this.prisma.batchSupplier.count({
        where: {
          batch: { companyId },
          supplier: { companyType: 'SUPPLIER' },
        },
      }),
    ]);

    // Top fornecedores por CO2
    const topSuppliersByCO2 = await this.prisma.batchSupplier.groupBy({
      by: ['supplierId'],
      where: {
        batch: { companyId },
        co2Emitted: { not: null },
      },
      _sum: { co2Emitted: true },
      orderBy: { _sum: { co2Emitted: 'desc' } },
      take: 5,
    });

    const topSuppliers = await Promise.all(
      topSuppliersByCO2.map(async (item) => {
        const supplier = await this.prisma.company.findUnique({
          where: { id: item.supplierId },
          select: { id: true, name: true, cnpj: true },
        });
        return {
          ...supplier,
          totalCO2: item._sum.co2Emitted || 0,
        };
      }),
    );

    return {
      totalSuppliers,
      activeSuppliers,
      blockedSuppliers,
      inactiveSuppliers: totalSuppliers - activeSuppliers - blockedSuppliers,
      totalSupplierBatches: totalBatches,
      activeRate: totalSuppliers > 0 ? (activeSuppliers / totalSuppliers) * 100 : 0,
      topSuppliersByCO2: topSuppliers,
    };
  }

  async getSupplierBatches(companyId: string | undefined, supplierId: string, limit: number = 10) {
    // Verificar se o fornecedor existe
    const supplier = await this.prisma.company.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) {
      throw new NotFoundException(`Fornecedor ${supplierId} não encontrado`);
    }

    // Verificar relacionamento
    const relation = await this.prisma.companySupplier.findFirst({
      where: {
        supplierId,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!relation && companyId) {
      throw new NotFoundException(`Fornecedor não vinculado a esta empresa`);
    }

    // Buscar lotes do fornecedor
    const batchSuppliers = await this.prisma.batchSupplier.findMany({
      where: { supplierId },
      include: {
        batch: {
          include: {
            company: { select: { id: true, name: true } },
          },
        },
        document: { select: { id: true, ipfsHash: true, originalName: true } },
      },
      orderBy: { includedAt: 'desc' },
      take: limit,
    });

    const batches = batchSuppliers.map(bs => ({
      batchId: bs.batch.batchId,
      productName: bs.productName || bs.batch.productName,
      quantity: bs.quantity,
      unit: bs.unit,
      co2Emitted: bs.co2Emitted,
      status: bs.batch.status,
      isCompliant: bs.batch.isCompliant,
      registeredAt: bs.batch.registeredAt,
      blockchainTxHash: bs.batch.blockchainTxHash,
      nftTokenId: bs.batch.nftTokenId,
      document: bs.document,
    }));

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        cnpj: supplier.cnpj,
      },
      totalBatches: batchSuppliers.length,
      batches,
    };
  }

  async getSupplierByCnpj(cnpj: string) {
    const supplier = await this.prisma.company.findFirst({
      where: { cnpj, companyType: 'SUPPLIER' },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        country: true,
        status: true,
      },
    });

    if (!supplier) {
      throw new NotFoundException(`Fornecedor com CNPJ ${cnpj} não encontrado`);
    }

    return supplier;
  }
}
