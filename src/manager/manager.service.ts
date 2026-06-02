// src/manager/manager.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { Role, BatchStatus, DocumentStatus } from '@prisma/client';
import {
  CreateManagerBatchDto,
  SupplierLinkDto,
} from './dto/create-manager.dto';

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private prisma: PrismaService,
    private blockchainService: BlockchainService,
  ) {}

  // src/manager/manager.service.ts

  async createFinalBatch(companyId: string, dto: CreateManagerBatchDto) {
    if (!companyId) {
      throw new BadRequestException('companyId é obrigatório');
    }

    const existingBatch = await this.prisma.batch.findUnique({
      where: { batchId: dto.batchId },
    });

    if (existingBatch) {
      throw new BadRequestException(`Lote com ID ${dto.batchId} já existe`);
    }

    let ipfsDocumentHash: string | null = null;
    const supplierDocumentsMap = new Map<string, any>();

    if (dto.suppliers && dto.suppliers.length > 0) {
      for (const supplier of dto.suppliers) {
        if (supplier.ipfsDocumentHash && supplier.ipfsDocumentHash !== '') {
          ipfsDocumentHash = supplier.ipfsDocumentHash;
          break;
        }

        if (supplier.documentId) {
          const document = await this.prisma.document.findUnique({
            where: { id: supplier.documentId },
            select: { ipfsHash: true, originalName: true },
          });
          if (document?.ipfsHash && document.ipfsHash !== '') {
            ipfsDocumentHash = document.ipfsHash;
            supplierDocumentsMap.set(supplier.supplierId, document);
            break;
          }
        }

        const supplierDocs = await this.prisma.document.findMany({
          where: {
            supplierId: supplier.supplierId,
            processingStatus: 'VALIDATED',
          },
          take: 1,
          select: { ipfsHash: true, originalName: true },
        });

        if (
          supplierDocs.length > 0 &&
          supplierDocs[0].ipfsHash &&
          supplierDocs[0].ipfsHash !== ''
        ) {
          ipfsDocumentHash = supplierDocs[0].ipfsHash;
          supplierDocumentsMap.set(supplier.supplierId, supplierDocs[0]);
          break;
        }
      }
    }

    const totalValue = dto.totalValue ? Number(dto.totalValue) : null;

    const batch = await this.prisma.batch.create({
      data: {
        batchId: dto.batchId,
        productName: dto.productName,
        productDescription: dto.productDescription,
        companyId,
        status: BatchStatus.DRAFT,
        countryOfOrigin: dto.countryOfOrigin || 'Brasil',
        destinationCountry: dto.destinationCountry || 'União Europeia',
        totalValue: totalValue,
        currency: dto.currency || 'BRL',
        incoterm: dto.incoterm || 'FOB',
        shippingDate: dto.shippingDate ? new Date(dto.shippingDate) : null,
        estimatedArrival: dto.estimatedArrival
          ? new Date(dto.estimatedArrival)
          : null,
        isCompliant: true,
        ipfsDocumentHash: ipfsDocumentHash,
      },
    });

    this.logger.log(
      `📦 Lote criado: ${batch.batchId} com IPFS hash: ${ipfsDocumentHash || 'nenhum'}`,
    );

    let totalCO2 = 0;
    if (dto.suppliers && dto.suppliers.length > 0) {
      for (const supplier of dto.suppliers) {
        const docInfo = supplierDocumentsMap.get(supplier.supplierId);

        await this.linkSupplierToBatch(
          batch.batchId,
          {
            supplierId: supplier.supplierId,
            productName: supplier.productName,
            quantity: supplier.quantity,
            unit: supplier.unit,
            co2Emitted: supplier.co2Emitted || 0,
            documentId: supplier.documentId || docInfo?.id,
            ipfsDocumentHash: supplier.ipfsDocumentHash || docInfo?.ipfsHash,
          },
          companyId,
        );
        totalCO2 += supplier.co2Emitted || 0;
      }
    }

    await this.prisma.batch.update({
      where: { id: batch.id },
      data: { co2Emitted: totalCO2 },
    });

    this.logger.log(
      `✅ Manager criou lote final: ${batch.batchId} com ${dto.suppliers?.length || 0} fornecedores`,
    );

    return {
      success: true,
      message: 'Lote final criado com sucesso',
      batch: {
        id: batch.id,
        batchId: batch.batchId,
        productName: batch.productName,
        co2Emitted: totalCO2,
        suppliersCount: dto.suppliers?.length || 0,
        ipfsDocumentHash: ipfsDocumentHash,
      },
    };
  }

  // src/manager/manager.service.ts

  /**
   * Vincular fornecedor a um lote existente
   */
  async linkSupplierToBatch(
    batchId: string,
    supplierData: {
      supplierId: string;
      productName: string;
      quantity?: number;
      unit?: string;
      co2Emitted?: number;
      documentId?: string;
      ipfsDocumentHash?: string; // ✅ ADICIONAR ESTA LINHA
    },
    companyId: string,
  ) {
    // Buscar o batch pelo batchId (string) - NÃO PELO ID INTERNO
    const batch = await this.prisma.batch.findFirst({
      where: { batchId: batchId, companyId },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    const supplier = await this.prisma.company.findUnique({
      where: { id: supplierData.supplierId },
    });

    if (!supplier) {
      throw new NotFoundException(
        `Fornecedor ${supplierData.supplierId} não encontrado`,
      );
    }

    const batchSupplier = await this.prisma.batchSupplier.upsert({
      where: {
        batchId_supplierId: {
          batchId: batch.id,
          supplierId: supplierData.supplierId,
        },
      },
      update: {
        productName: supplierData.productName,
        quantity: supplierData.quantity,
        unit: supplierData.unit,
        co2Emitted: supplierData.co2Emitted || 0,
        documentId: supplierData.documentId,
      },
      create: {
        batchId: batch.id,
        supplierId: supplierData.supplierId,
        productName: supplierData.productName,
        quantity: supplierData.quantity,
        unit: supplierData.unit,
        co2Emitted: supplierData.co2Emitted || 0,
        documentId: supplierData.documentId,
      },
      include: {
        supplier: {
          select: { id: true, name: true, cnpj: true },
        },
      },
    });

    // ✅ Se o batch não tem ipfsDocumentHash e o fornecedor tem, atualizar
    if (!batch.ipfsDocumentHash && supplierData.ipfsDocumentHash) {
      await this.prisma.batch.update({
        where: { id: batch.id },
        data: { ipfsDocumentHash: supplierData.ipfsDocumentHash },
      });
      this.logger.log(
        `📄 IPFS hash adicionado ao lote ${batch.batchId}: ${supplierData.ipfsDocumentHash}`,
      );
    }

    await this.recalculateBatchCO2(batch.id);
    return batchSupplier;
  }

  /**
   * Recalcular CO2 total do lote
   */
  async recalculateBatchCO2(batchId: string) {
    const batchSuppliers = await this.prisma.batchSupplier.findMany({
      where: { batchId },
    });

    const totalCO2 = batchSuppliers.reduce(
      (sum, bs) => sum + (bs.co2Emitted || 0),
      0,
    );

    await this.prisma.batch.update({
      where: { id: batchId },
      data: { co2Emitted: totalCO2 },
    });

    return totalCO2;
  }

  /**
   * Buscar fornecedores disponíveis para o manager
   */
  async getAvailableSuppliers(companyId: string, userRole?: string) {
    if (userRole === Role.MANAGER) {
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
      });
      this.logger.log(`🔍 Fornecedores encontrados: ${suppliers.length}`);
      return suppliers.map((cs) => cs.supplier);
    }

    return this.prisma.company.findMany({
      where: { companyType: 'SUPPLIER', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
      },
    });
  }

  /**
   * Buscar documentos processados do próprio manager
   */
  async getManagerDocuments(companyId: string) {
    return this.prisma.document.findMany({
      where: { supplierId: companyId },
      include: {
        batch: { select: { batchId: true, productName: true } },
        uploadedBy: { select: { name: true, email: true } },
      },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Buscar documentos de TODOS os fornecedores vinculados
   */
  async getAllSupplierDocuments(companyId: string) {
    this.logger.log(
      `🔍 Buscando fornecedores vinculados à empresa ${companyId}`,
    );

    const suppliers = await this.prisma.companySupplier.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
      },
      include: {
        supplier: true,
      },
    });

    this.logger.log(`📋 Fornecedores encontrados: ${suppliers.length}`);

    if (suppliers.length === 0) {
      this.logger.warn('⚠️ Nenhum fornecedor vinculado encontrado');
      return [];
    }

    const allDocuments: any[] = [];

    for (const relation of suppliers) {
      this.logger.log(
        `📄 Buscando documentos do fornecedor: ${relation.supplier.name}`,
      );

      const documents = await this.prisma.document.findMany({
        where: {
          supplierId: relation.supplierId,
        },
        include: {
          supplier: { select: { id: true, name: true, cnpj: true } },
          batch: { select: { batchId: true, productName: true } },
          uploadedBy: { select: { name: true, email: true } },
        },
        orderBy: { uploadedAt: 'desc' },
      });

      this.logger.log(`   📄 Encontrados ${documents.length} documentos`);
      allDocuments.push(...documents);
    }

    // Ordenar por data (mais recentes primeiro)
    allDocuments.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );

    this.logger.log(
      `✅ Total de documentos carregados: ${allDocuments.length}`,
    );
    return allDocuments;
  }

  /**
   * Estatísticas do manager
   */
  async getManagerStats(companyId: string) {
    const [
      totalBatches,
      completedBatches,
      totalDocuments,
      processedDocuments,
      totalSuppliers,
    ] = await Promise.all([
      this.prisma.batch.count({ where: { companyId } }),
      this.prisma.batch.count({
        where: { companyId, blockchainTxHash: { not: null } },
      }),
      this.prisma.document.count({ where: { supplierId: companyId } }),
      this.prisma.document.count({
        where: {
          supplierId: companyId,
          processingStatus: DocumentStatus.ON_CHAIN,
        },
      }),
      this.prisma.companySupplier.count({
        where: { companyId, status: 'ACTIVE' },
      }),
    ]);

    return {
      totalBatches,
      completedBatches,
      pendingBatches: totalBatches - completedBatches,
      totalDocuments,
      processedDocuments,
      totalSuppliers,
      completionRate:
        totalBatches > 0 ? (completedBatches / totalBatches) * 100 : 0,
    };
  }
}
