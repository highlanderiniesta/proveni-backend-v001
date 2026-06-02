/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { BlockchainService } from '../blockchain/blockchain.service';
import { Role, BatchStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    private prisma: PrismaService,
    private blockchainService: BlockchainService,
    private configService: ConfigService,
  ) {}

  // ============================================================
  // 📌 MÉTODOS DE CRUD E UTILITÁRIOS (já existentes)
  // ============================================================

  async updateBatch(
    batchId: string,
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
    companyId?: string,
    userRole?: string,
  ) {
    const existingBatch = await this.prisma.batch.findUnique({
      where: { batchId },
    });

    if (!existingBatch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    if (
      companyId &&
      existingBatch.companyId !== companyId &&
      userRole !== Role.SPECIALIST &&
      userRole !== Role.ADMIN
    ) {
      throw new BadRequestException(
        'Você não tem permissão para alterar este lote',
      );
    }

    const updatedBatch = await this.prisma.batch.update({
      where: { batchId },
      data: updateData,
    });

    this.logger.log(
      `Lote ${batchId} atualizado: ${JSON.stringify(updateData)}`,
    );

    return {
      success: true,
      message: 'Lote atualizado com sucesso',
      batch: updatedBatch,
    };
  }

  async create(companyId: string, dto: CreateBatchDto) {
    if (!companyId) {
      throw new Error('companyId é obrigatório para criar um lote');
    }

    const existingBatch = await this.prisma.batch.findUnique({
      where: { batchId: dto.batchId },
    });

    if (existingBatch) {
      throw new BadRequestException(`Lote com ID ${dto.batchId} já existe`);
    }

    return this.prisma.batch.create({
      data: {
        batchId: dto.batchId,
        productName: dto.productName,
        productDescription: dto.productDescription,
        quantity: dto.quantity,
        unit: dto.unit,
        companyId,
        status: BatchStatus.DRAFT,
        countryOfOrigin: dto.countryOfOrigin || 'Brasil',
        destinationCountry: dto.destinationCountry || 'União Europeia',
        totalValue: dto.totalValue,
        currency: dto.currency || 'BRL',
        incoterm: dto.incoterm || 'FOB',
        shippingDate: dto.shippingDate ? new Date(dto.shippingDate) : null,
        estimatedArrival: dto.estimatedArrival
          ? new Date(dto.estimatedArrival)
          : null,
        isCompliant: false,
      },
    });
  }

  async findAllByCompany(companyId?: string, userRole?: string) {
    if (!companyId || userRole === Role.SPECIALIST) {
      return this.prisma.batch.findMany({
        include: {
          documents: true,
          batchSuppliers: { include: { supplier: true } },
          company: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.batch.findMany({
      where: { companyId },
      include: {
        documents: true,
        batchSuppliers: { include: { supplier: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(batchId: string, companyId?: string, userRole?: string) {
    let batch;

    if (!companyId || userRole === Role.SPECIALIST) {
      batch = await this.prisma.batch.findUnique({
        where: { batchId },
        include: {
          documents: true,
          batchSuppliers: { include: { supplier: true } },
          company: true,
        },
      });
    } else {
      batch = await this.prisma.batch.findFirst({
        where: { batchId, companyId },
        include: {
          documents: true,
          batchSuppliers: { include: { supplier: true } },
        },
      });
    }

    if (!batch) throw new NotFoundException('Lote não encontrado');
    return batch;
  }

  async getBatchPublic(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      select: {
        batchId: true,
        productName: true,
        productDescription: true,
        co2Emitted: true,
        isCompliant: true,
        countryOfOrigin: true,
        destinationCountry: true,
        totalValue: true,
        currency: true,
        status: true,
        blockchainTxHash: true,
        registeredAt: true,
        company: {
          select: {
            name: true,
            cnpj: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    return batch;
  }

  async getBatchSuppliersPublic(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        batchSuppliers: {
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                cnpj: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    return batch.batchSuppliers.map((bs) => ({
      supplier: bs.supplier,
      productName: bs.productName,
      co2Emitted: bs.co2Emitted,
      quantity: bs.quantity,
      unit: bs.unit,
    }));
  }

  async updateStatus(batchId: string, status: BatchStatus) {
    return this.prisma.batch.update({
      where: { batchId },
      data: { status },
    });
  }

  async calculateTotalCO2(batchId: string) {
    const batchSuppliers = await this.prisma.batchSupplier.findMany({
      where: { batchId },
    });

    const totalCO2 = batchSuppliers.reduce(
      (sum, bs) => sum + (bs.co2Emitted || 0),
      0,
    );

    await this.prisma.batch.update({
      where: { batchId },
      data: { co2Emitted: totalCO2 },
    });

    return { batchId, totalCO2 };
  }

  async getComplianceStatus(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: { complianceRule: true },
    });

    if (!batch) throw new NotFoundException('Lote não encontrado');

    if (!batch.complianceRule) {
      return { isCompliant: true, reason: 'Sem regra aplicável' };
    }

    const isCompliant =
      (batch.co2Emitted ?? 0) <= batch.complianceRule.co2Limit;
    return {
      isCompliant,
      reason: isCompliant
        ? 'Dentro do limite'
        : `CO₂ excede limite de ${batch.complianceRule.co2Limit} ${batch.complianceRule.co2Unit}`,
    };
  }

  async addSupplierToBatch(
    batchId: string,
    data: {
      supplierId: string;
      productName: string;
      quantity?: number;
      unit?: string;
      co2Emitted?: number;
      documentId?: string;
    },
    companyId: string,
  ) {
    const batch = await this.prisma.batch.findFirst({
      where: { batchId, companyId },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    const supplier = await this.prisma.company.findUnique({
      where: { id: data.supplierId },
    });

    if (!supplier) {
      throw new NotFoundException(
        `Fornecedor ${data.supplierId} não encontrado`,
      );
    }

    const batchSupplier = await this.prisma.batchSupplier.upsert({
      where: {
        batchId_supplierId: {
          batchId: batch.id,
          supplierId: data.supplierId,
        },
      },
      update: {
        productName: data.productName,
        quantity: data.quantity,
        unit: data.unit,
        co2Emitted: data.co2Emitted || 0,
        documentId: data.documentId,
      },
      create: {
        batchId: batch.id,
        supplierId: data.supplierId,
        productName: data.productName,
        quantity: data.quantity,
        unit: data.unit,
        co2Emitted: data.co2Emitted || 0,
        documentId: data.documentId,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            cnpj: true,
          },
        },
      },
    });

    await this.calculateTotalCO2(batchId);

    return batchSupplier;
  }

  async getCertificateInfo(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      select: {
        nftTokenId: true,
        blockchainTxHash: true,
        isCompliant: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    if (!batch.nftTokenId || batch.nftTokenId === 0) {
      throw new NotFoundException('Certificado NFT ainda não foi emitido');
    }

    const contractAddress = this.configService.get('CONTRACT_ADDRESS');

    return {
      success: true,
      batchId,
      nftTokenId: batch.nftTokenId,
      isCompliant: batch.isCompliant,
      openseaUrl: `https://testnets.opensea.io/sepolia/${contractAddress}/${batch.nftTokenId}`,
    };
  }

  async getBatchFromBlockchain(batchId: string) {
    const batch = await this.blockchainService.getFullBatch(batchId);

    if (!batch) {
      throw new NotFoundException(
        `Lote ${batchId} não encontrado na blockchain`,
      );
    }

    return {
      success: true,
      data: batch,
      source: 'blockchain',
    };
  }

  async quickBlockchainVerify(batchId: string) {
    const result = await this.blockchainService.quickVerify(batchId);

    return {
      success: true,
      batchId,
      isCompliant: result.isCompliant,
      hasCertificate: result.hasCertificate,
      message: result.isCompliant
        ? '✅ Produto aprovado para exportação'
        : '❌ Produto não conforme',
      verifiedAt: new Date().toISOString(),
    };
  }

  async getFullTraceability(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        batchSuppliers: {
          include: {
            supplier: { select: { id: true, name: true, cnpj: true } },
            document: {
              select: { id: true, ipfsHash: true, originalName: true },
            },
          },
        },
        documents: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    let blockchainData: any = null;
    try {
      blockchainData = await this.blockchainService.getFullBatch(batchId);
    } catch (error) {
      this.logger.warn(`Lote ${batchId} não encontrado na blockchain`);
    }

    const suppliersTraceability = batch.batchSuppliers.map((bs) => ({
      name: bs.supplier.name,
      cnpj: bs.supplier.cnpj,
      material: bs.productName,
      co2Emitted: bs.co2Emitted,
      percentageOfTotal:
        batch.co2Emitted && bs.co2Emitted
          ? ((bs.co2Emitted / batch.co2Emitted) * 100).toFixed(1)
          : '0',
      document: bs.document
        ? {
            name: bs.document.originalName,
            ipfsHash: bs.document.ipfsHash,
            url: bs.document.ipfsHash
              ? `https://gateway.pinata.cloud/ipfs/${bs.document.ipfsHash}`
              : '',
          }
        : null,
    }));

    return {
      success: true,
      batchId,
      verifiedAt: new Date().toISOString(),
      localData: {
        product: {
          name: batch.productName,
          description: batch.productDescription,
          totalCO2: batch.co2Emitted,
          isCompliant: batch.isCompliant,
          countryOfOrigin: batch.countryOfOrigin,
          destinationCountry: batch.destinationCountry,
        },
        exporter: {
          name: batch.company?.name,
          cnpj: batch.company?.cnpj,
        },
        suppliers: suppliersTraceability,
        status: batch.status,
        registeredAt: batch.registeredAt,
        blockchainTxHash: batch.blockchainTxHash,
      },
      blockchainData: blockchainData
        ? {
            registeredAt: blockchainData.registeredAt,
            registeredBy: blockchainData.registeredBy,
            auditedBy: blockchainData.auditedBy,
            nftTokenId: blockchainData.nftTokenId,
            isCompliant: blockchainData.isCompliant,
          }
        : null,
    };
  }

  async getExportSummary(companyId?: string, userRole?: string) {
    if (!companyId || userRole === Role.SPECIALIST) {
      const [
        totalBatches,
        completedBatches,
        onChainBatches,
        totalCO2,
        totalValue,
      ] = await Promise.all([
        this.prisma.batch.count(),
        this.prisma.batch.count({ where: { status: BatchStatus.COMPLETED } }),
        this.prisma.batch.count({ where: { blockchainTxHash: { not: null } } }),
        this.prisma.batch.aggregate({ _sum: { co2Emitted: true } }),
        this.prisma.batch.aggregate({ _sum: { totalValue: true } }),
      ]);

      return {
        totalBatches,
        completedBatches,
        onChainBatches,
        totalCO2: totalCO2._sum.co2Emitted || 0,
        totalExportValue: totalValue._sum.totalValue || 0,
        completionRate:
          totalBatches > 0 ? (completedBatches / totalBatches) * 100 : 0,
      };
    }

    const [
      totalBatches,
      completedBatches,
      onChainBatches,
      totalCO2,
      totalValue,
      destinations,
    ] = await Promise.all([
      this.prisma.batch.count({ where: { companyId } }),
      this.prisma.batch.count({
        where: { companyId, status: BatchStatus.COMPLETED },
      }),
      this.prisma.batch.count({
        where: { companyId, blockchainTxHash: { not: null } },
      }),
      this.prisma.batch.aggregate({
        where: { companyId },
        _sum: { co2Emitted: true },
      }),
      this.prisma.batch.aggregate({
        where: { companyId },
        _sum: { totalValue: true },
      }),
      this.prisma.batch.groupBy({
        by: ['destinationCountry'],
        where: { companyId, destinationCountry: { not: null } },
        _count: { destinationCountry: true },
        _sum: { totalValue: true },
      }),
    ]);

    return {
      totalBatches,
      completedBatches,
      onChainBatches,
      totalCO2: totalCO2._sum.co2Emitted || 0,
      totalExportValue: totalValue._sum.totalValue || 0,
      completionRate:
        totalBatches > 0 ? (completedBatches / totalBatches) * 100 : 0,
      destinations: destinations.map((d) => ({
        country: d.destinationCountry,
        batchCount: d._count.destinationCountry,
        totalValue: d._sum.totalValue || 0,
      })),
    };
  }

  async updateComplianceStatus(
    batchId: string,
  ): Promise<{ isCompliant: boolean; reason: string }> {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: { complianceRule: true },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    let isCompliant = true;
    let reason = 'Produto conforme';

    if (batch.complianceRule) {
      const rule = batch.complianceRule;
      const co2Limit = rule.co2Limit;
      const actualCO2 = batch.co2Emitted || 0;

      if (actualCO2 > co2Limit) {
        isCompliant = false;
        reason = `CO₂ excede limite de ${co2Limit} ${rule.co2Unit}`;
      }
    }

    await this.prisma.batch.update({
      where: { batchId },
      data: { isCompliant, complianceReason: isCompliant ? null : reason },
    });

    return { isCompliant, reason };
  }

  // ============================================================
  // 🚀 MÉTODOS DE INTEGRAÇÃO COM BLOCKCHAIN (CORRIGIDOS)
  // ============================================================

  /**
   * Registra um lote na blockchain (endpoint: POST /batches/:batchId/register-blockchain)
   */
  async registerOnBlockchain(batchId: string, specialistId: string) {
    // 1. Buscar o lote com todos os dados necessários
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        company: true,
        batchSuppliers: true,
        documents: true, // para buscar o ipfsDocumentHash se não estiver no batch diretamente
      },
    });

    if (!batch) {
      throw new NotFoundException(
        `Lote ${batchId} não encontrado no banco de dados`,
      );
    }

    // 2. Verificar se já foi registrado
    if (batch.blockchainTxHash) {
      throw new BadRequestException('Lote já registrado na blockchain');
    }

    // 3. Preparar os dados para o contrato
    const companyName = batch.company?.name || 'Empresa não informada';
    const co2Emitted = batch.co2Emitted || 0;

    // Usar os campos de origem/destino do lote (criados no create ou via update)
    const countryOfOrigin = batch.countryOfOrigin || 'Brasil';
    const destinationCountry = batch.destinationCountry || 'Exportação';

    // Buscar o ipfsDocumentHash: apenas do próprio lote
    let ipfsDocumentHash = batch.ipfsDocumentHash || '';

    // Se quiser mesmo tentar buscar em documentos associados, use valores válidos do enum:
    if (!ipfsDocumentHash && batch.documents && batch.documents.length > 0) {
      const doc = batch.documents.find((d) => d.docType === 'CERTIFICATE'); // ou 'CARBON_REPORT'
      if (doc && doc.ipfsHash) ipfsDocumentHash = doc.ipfsHash;
    }

    try {
      // 4. Chamar o serviço de blockchain
      const result = await this.blockchainService.registerBatchOnChain(
        batch.batchId,
        batch.productName,
        co2Emitted,
        companyName,
        countryOfOrigin,
        destinationCountry,
        ipfsDocumentHash,
      );

      // 5. Atualizar o banco local
      await this.prisma.batch.update({
        where: { batchId },
        data: {
          blockchainTxHash: result.txHash,
          blockchainRegisteredAt: new Date(),
          status: BatchStatus.BLOCKCHAIN, // ou outro status adequado
        },
      });

      this.logger.log(
        `Lote ${batchId} registrado na blockchain com tx ${result.txHash}`,
      );

      return {
        success: true,
        message: 'Lote registrado na blockchain com sucesso',
        batchId,
        txHash: result.txHash,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao registrar lote ${batchId}: ${error.message}`);
      await this.updateStatus(batchId, BatchStatus.ERROR);
      throw new BadRequestException(
        `Falha no registro blockchain: ${error.message}`,
      );
    }
  }

  /**
   * Audita um lote na blockchain (aprova/reprova e emite NFT)
   * Endpoint: POST /batches/:batchId/audit
   */
  async auditBatchOnBlockchain(
    batchId: string,
    isCompliant: boolean,
    ipfsInspectionHash: string,
    specialistId: string,
  ) {
    // 1. Verificar se o lote existe no banco local
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
    });
    if (!batch) {
      throw new NotFoundException(
        `Lote ${batchId} não encontrado no banco de dados`,
      );
    }

    // 2. 🔥 VERIFICAÇÃO CRÍTICA: o lote já existe na blockchain?
    const existsOnChain =
      await this.blockchainService.isBatchRegistered(batchId);
    if (!existsOnChain) {
      throw new BadRequestException(
        `Lote ${batchId} não encontrado na blockchain. É necessário registrá-lo primeiro (clique em "Registrar e Aprovar").`,
      );
    }

    // 3. Se aprovado, mas não forneceu hash de laudo, gerar um placeholder
    let finalInspectionHash = ipfsInspectionHash;
    if (isCompliant && (!ipfsInspectionHash || ipfsInspectionHash === '')) {
      finalInspectionHash = `approved-by-specialist-${Date.now()}`;
      this.logger.warn(
        `Hash de laudo não fornecido para aprovação do lote ${batchId}. Usando placeholder: ${finalInspectionHash}`,
      );
    }

    try {
      // 4. Chamar o serviço de blockchain para auditar
      const result = await this.blockchainService.auditBatchOnChain(
        batchId,
        isCompliant,
        finalInspectionHash,
      );

      // 5. Atualizar o banco local com o resultado da auditoria
      const updateData: any = {
        isCompliant,
        ipfsInspectionHash: finalInspectionHash,
        auditorAddress: specialistId,
        auditedAt: new Date(),
        // blockchainAuditTxHash: result.txHash,
        status: isCompliant ? BatchStatus.COMPLETED : BatchStatus.REJECTED,
      };

      // Se o contrato retornou um tokenId (via evento), você pode buscá-lo.
      // Por simplicidade, não estamos recuperando o tokenId aqui, mas ele pode ser obtido via evento Cert  ificateIssued.
      // Se você tiver um listener, pode atualizar o campo nftTokenId posteriormente.

      await this.prisma.batch.update({
        where: { batchId },
        data: updateData,
      });

      this.logger.log(
        `Lote ${batchId} auditado: ${isCompliant ? 'aprovado' : 'reprovado'} (tx: ${result.txHash})`,
      );

      return {
        success: true,
        message: isCompliant
          ? 'Lote aprovado e certificado NFT emitido com sucesso'
          : 'Lote reprovado',
        batchId,
        txHash: result.txHash,
        nftTokenId: isCompliant ? batch.nftTokenId : null, // pode ser null se ainda não capturado
      };
    } catch (error: any) {
      this.logger.error(`Erro ao auditar lote ${batchId}: ${error.message}`);
      throw new BadRequestException(
        `Falha na auditoria blockchain: ${error.message}`,
      );
    }
  }

  async exportBatchToBlockchain(batchId: string, specialistId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        company: true,
        batchSuppliers: { include: { supplier: true } },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote ${batchId} não encontrado`);
    }

    const registerResult = await this.registerOnBlockchain(
      batchId,
      specialistId,
    );

    let auditResult: Awaited<
      ReturnType<typeof this.auditBatchOnBlockchain>
    > | null = null;
    if (batch.isCompliant) {
      auditResult = await this.auditBatchOnBlockchain(
        batchId,
        batch.isCompliant,
        batch.ipfsInspectionHash || '',
        specialistId,
      );
    }

    return {
      success: true,
      register: registerResult,
      audit: auditResult,
      message: auditResult
        ? 'Lote registrado e aprovado com sucesso'
        : 'Lote registrado (aguardando auditoria)',
    };
  }
}
