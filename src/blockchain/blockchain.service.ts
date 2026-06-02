/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/blockchain/blockchain.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

export interface BlockchainBatchData {
  batchId: string;
  productName: string;
  co2Emitted: number;
  companyName: string;
  countryOfOrigin: string;
  destinationCountry: string;
  isCompliant: boolean;
  ipfsDocumentHash: string;
  ipfsInspectionHash: string;
  registeredAt: Date;
  registeredBy: string;
  auditedBy: string;
  nftTokenId: number;
  index: number;
}

export interface BatchQueryResult {
  productName: string;
  co2Emitted: number;
  companyName: string;
  countryOfOrigin: string;
  destinationCountry: string;
  isCompliant: boolean;
  ipfsDocumentHash: string;
  ipfsInspectionHash: string;
  registeredAt: Date;
  registeredBy: string;
  auditedBy: string;
  nftTokenId: number;
}

@Injectable()
export class BlockchainService {
  private provider?: ethers.Provider;
  private signer?: ethers.Wallet;
  private contract?: ethers.Contract;
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initializeBlockchainConnection();
  }

  private initializeBlockchainConnection() {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    const privateKey = this.configService.get<string>('BLOCKCHAIN_PRIVATE_KEY');
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');

    if (!rpcUrl) {
      this.logger.error('❌ BLOCKCHAIN_RPC_URL não configurada no .env');
      return;
    }

    if (!contractAddress) {
      this.logger.error('❌ CONTRACT_ADDRESS não configurada no .env');
      return;
    }

    this.logger.log(`📋 RPC URL: ${rpcUrl}`);
    this.logger.log(`📋 Contract Address: ${contractAddress}`);

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // ABI completa do contrato ExportTracker (Human-Readable)
      const abi = [
        // ============ FUNÇÕES DE LEITURA ============
        'function batches(string) view returns (string batchId, string productName, uint256 co2Emitted, string companyName, string countryOfOrigin, string destinationCountry, bool isCompliant, string ipfsDocumentHash, string ipfsInspectionHash, uint256 registeredAt, address registeredBy, address auditedBy, uint256 nftTokenId)',
        'function batchExists(string) view returns (bool)',
        'function batchIds(uint256) view returns (string)',
        'function getBatchCount() view returns (uint256)',
        'function verifyBatch(string calldata batchId) external view returns (string productName, string companyName, bool isCompliant, string ipfsDocumentHash, string ipfsInspectionHash, uint256 nftTokenId, address auditor)',
        'function quickVerify(string calldata batchId) external view returns (bool isCompliant, bool hasCertificate)',
        'function getCompanyBatches(address company) external view returns (string[] memory)',
        'function getSystemStats() external view returns (uint256 totalBatches, uint256 compliantBatches, uint256 certificatesIssued, uint256 totalAuditors, uint256 totalCO2Captured)',

        // ============ FUNÇÕES DE ESCRITA ============
        'function registerBatch(string calldata batchId, string calldata productName, uint256 co2Emitted, string calldata companyName, string calldata countryOfOrigin, string calldata destinationCountry, string calldata ipfsDocumentHash) external returns (string)',
        'function auditBatch(string calldata batchId, bool isCompliant, string calldata ipfsInspectionHash) external',

        // ============ GERENCIAMENTO DE AUDITORES ============
        'function addAuditor(address newAuditor) external',
        'function removeAuditor(address auditor) external',
        'function isAuditor(address account) external view returns (bool)',
        'function getAuditorCount() external view returns (uint256)',
        'function getAllAuditors() external view returns (address[] memory)',

        // ============ EVENTOS ============
        'event BatchRegistered(string indexed batchId, string productName, address exporter)',
        'event BatchAudited(string indexed batchId, bool isCompliant, address auditor)',
        'event CertificateIssued(string indexed batchId, uint256 tokenId)',
      ];

      if (privateKey && privateKey !== '0x' && privateKey !== '') {
        this.signer = new ethers.Wallet(privateKey, this.provider);
        this.contract = new ethers.Contract(contractAddress, abi, this.signer);
        this.logger.log('🔗 Blockchain conectada com permissão de ESCRITA');

        this.signer
          .getAddress()
          .then(async (address) => {
            const balance = await this.provider!.getBalance(address);
            this.logger.log(`👛 Conta: ${address}`);
            this.logger.log(`💰 Saldo: ${ethers.formatEther(balance)} ETH`);
          })
          .catch((err) => {
            this.logger.warn(`Não foi possível obter saldo: ${err.message}`);
          });
      } else {
        this.contract = new ethers.Contract(
          contractAddress,
          abi,
          this.provider,
        );
        this.logger.log('🔗 Blockchain conectada em modo LEITURA (público)');
        this.logger.warn(
          '⚠️ Sem chave privada - não é possível registrar lotes',
        );
      }

      this.logger.log(`✅ Blockchain inicializada com sucesso`);
    } catch (error: any) {
      this.logger.error(
        '❌ Erro ao inicializar conexão com a Blockchain:',
        error,
      );
    }
  }

  // ============================================================
  // 🔓 FUNÇÕES DE LEITURA (PÚBLICAS)
  // ============================================================

  /**
   * Consulta um lote pelo ID na blockchain
   */
  async getBatch(batchId: string): Promise<BatchQueryResult | null> {
    if (!this.contract) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      this.logger.log(`🔍 Consultando lote ${batchId} na blockchain...`);

      const result = await this.contract.verifyBatch(batchId);

      return {
        productName: result[0],
        companyName: result[1],
        isCompliant: result[2],
        ipfsDocumentHash: result[3],
        ipfsInspectionHash: result[4],
        nftTokenId: Number(result[5]),
        auditedBy: result[6],
        co2Emitted: 0, // Será buscado do mapping
        countryOfOrigin: '',
        destinationCountry: '',
        registeredAt: new Date(),
        registeredBy: '',
      };
    } catch (error: any) {
      if (error.message?.includes('Lote nao encontrado')) {
        this.logger.warn(`⚠️ Lote ${batchId} não encontrado`);
        return null;
      }
      this.logger.error(`Erro ao buscar lote ${batchId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Busca dados completos do lote (incluindo campos do mapping)
   */
  async getFullBatch(batchId: string): Promise<BlockchainBatchData | null> {
    if (!this.contract) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      const exists = await this.contract.batchExists(batchId);
      if (!exists) {
        return null;
      }

      const batch = await this.contract.batches(batchId);

      return {
        batchId: batch.batchId,
        productName: batch.productName,
        // 🔧 Converter de volta para decimal (dividir por 100)
        co2Emitted: Number(batch.co2Emitted) / 100,
        companyName: batch.companyName,
        countryOfOrigin: batch.countryOfOrigin,
        destinationCountry: batch.destinationCountry,
        isCompliant: batch.isCompliant,
        ipfsDocumentHash: batch.ipfsDocumentHash,
        ipfsInspectionHash: batch.ipfsInspectionHash,
        registeredAt: new Date(Number(batch.registeredAt) * 1000),
        registeredBy: batch.registeredBy,
        auditedBy: batch.auditedBy,
        nftTokenId: Number(batch.nftTokenId),
        index: 0,
      };
    } catch (error: any) {
      this.logger.error(
        `Erro ao buscar lote completo ${batchId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Verifica se um lote existe na blockchain
   */
  async isBatchRegistered(batchId: string): Promise<boolean> {
    if (!this.contract) return false;
    try {
      return await this.contract.batchExists(batchId);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verificação rápida (para QR code)
   */
  async quickVerify(
    batchId: string,
  ): Promise<{ isCompliant: boolean; hasCertificate: boolean }> {
    if (!this.contract) {
      return { isCompliant: false, hasCertificate: false };
    }
    try {
      const result = await this.contract.quickVerify(batchId);
      return {
        isCompliant: result[0],
        hasCertificate: result[1],
      };
    } catch (error) {
      return { isCompliant: false, hasCertificate: false };
    }
  }

  /**
   * Retorna todos os lotes registrados
   */
  async getAllBatches(): Promise<BlockchainBatchData[]> {
    if (!this.contract) {
      return [];
    }

    try {
      const count = await this.contract.getBatchCount();
      this.logger.log(`📦 Buscando ${count} lotes...`);

      const batches: BlockchainBatchData[] = [];

      for (let i = 0; i < Number(count); i++) {
        const batchId = await this.contract.batchIds(i);
        const batch = await this.getFullBatch(batchId);
        if (batch) {
          batch.index = i;
          batches.push(batch);
        }
      }

      return batches;
    } catch (error: any) {
      this.logger.error(`Erro ao listar lotes: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtém o total de lotes
   */
  async getBatchCount(): Promise<number> {
    if (!this.contract) return 0;
    try {
      const count = await this.contract.getBatchCount();
      return Number(count);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Busca lotes com paginação
   */
  async getBatchesPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: BlockchainBatchData[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const total = await this.getBatchCount();
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, total);

    const batches: BlockchainBatchData[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      const batchId = await this.contract!.batchIds(i);
      const batch = await this.getFullBatch(batchId);
      if (batch) {
        batch.index = i;
        batches.push(batch);
      }
    }

    return { data: batches, total, page, totalPages };
  }

  /**
   * Busca lotes recentes
   */
  async getRecentBatches(limit: number = 5): Promise<BlockchainBatchData[]> {
    const total = await this.getBatchCount();
    const startIndex = Math.max(0, total - limit);
    const batches: BlockchainBatchData[] = [];

    for (let i = total - 1; i >= startIndex; i--) {
      const batchId = await this.contract!.batchIds(i);
      const batch = await this.getFullBatch(batchId);
      if (batch) {
        batch.index = i;
        batches.push(batch);
      }
    }

    return batches;
  }

  /**
   * Estatísticas do sistema
   */
  async getSystemStats(): Promise<{
    totalBatches: number;
    compliantBatches: number;
    certificatesIssued: number;
    totalAuditors: number;
    totalCO2Captured: number;
  }> {
    if (!this.contract) {
      return {
        totalBatches: 0,
        compliantBatches: 0,
        certificatesIssued: 0,
        totalAuditors: 0,
        totalCO2Captured: 0,
      };
    }
    try {
      const stats = await this.contract.getSystemStats();
      return {
        totalBatches: Number(stats[0]),
        compliantBatches: Number(stats[1]),
        certificatesIssued: Number(stats[2]),
        totalAuditors: Number(stats[3]),
        totalCO2Captured: Number(stats[4]),
      };
    } catch (error) {
      return {
        totalBatches: 0,
        compliantBatches: 0,
        certificatesIssued: 0,
        totalAuditors: 0,
        totalCO2Captured: 0,
      };
    }
  }

  /**
   * Lista todos os auditores
   */
  async getAllAuditors(): Promise<string[]> {
    if (!this.contract) return [];
    try {
      return await this.contract.getAllAuditors();
    } catch (error) {
      return [];
    }
  }

  /**
   * Verifica se um endereço é auditor
   */
  async isAuditor(address: string): Promise<boolean> {
    if (!this.contract) return false;
    try {
      return await this.contract.isAuditor(address);
    } catch (error) {
      return false;
    }
  }

  // ============================================================
  // 🔒 FUNÇÕES DE ESCRITA
  // ============================================================

  /**
   * Registra um lote na blockchain (apenas EXPORTER_ROLE)
   */
  // No método registerBatchOnChain, adicione esta conversão:

  async registerBatchOnChain(
    batchId: string,
    productName: string,
    co2Emitted: number,
    companyName: string,
    countryOfOrigin: string,
    destinationCountry: string,
    ipfsDocumentHash: string,
  ): Promise<{ txHash: string }> {
    if (!this.contract || !this.signer) {
      throw new BadRequestException('Blockchain não disponível para escrita');
    }

    try {
      this.logger.log(`⛓️ Registrando lote ${batchId} na Blockchain...`);
      this.logger.log(`📊 CO₂ original: ${co2Emitted} kg`);

      // 🔧 Converter para inteiro (multiplicar por 100 para ter 2 casas decimais)
      // Ex: 8979.99 -> 897999
      const co2EmittedInt = Math.round(co2Emitted * 100);
      this.logger.log(
        `📊 CO₂ convertido para inteiro: ${co2EmittedInt} (centésimos de kg)`,
      );

      const tx = await this.contract.registerBatch(
        batchId,
        productName,
        co2EmittedInt, // ← Usar o valor inteiro
        companyName,
        countryOfOrigin,
        destinationCountry,
        ipfsDocumentHash,
      );

      const receipt = await tx.wait();
      this.logger.log(`✅ Lote ${batchId} registrado! Tx: ${receipt.hash}`);

      return { txHash: receipt.hash };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao registrar lote: ${error.message}`);
      throw new BadRequestException(`Falha ao registrar: ${error.message}`);
    }
  }

  /**
   * Audita um lote (apenas AUDITOR_ROLE)
   */
  async auditBatchOnChain(
    batchId: string,
    isCompliant: boolean,
    ipfsInspectionHash: string,
  ): Promise<{ txHash: string }> {
    if (!this.contract || !this.signer) {
      throw new BadRequestException('Blockchain não disponível para escrita');
    }

    try {
      this.logger.log(`🔍 Auditando lote ${batchId}...`);

      const tx = await this.contract.auditBatch(
        batchId,
        isCompliant,
        ipfsInspectionHash,
      );
      const receipt = await tx.wait();

      this.logger.log(`✅ Lote ${batchId} auditado! Tx: ${receipt.hash}`);
      return { txHash: receipt.hash };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao auditar lote: ${error.message}`);
      throw new BadRequestException(`Falha ao auditar: ${error.message}`);
    }
  }

  /**
   * Adiciona um novo auditor (apenas ADMIN)
   */
  async addAuditor(auditorAddress: string): Promise<{ txHash: string }> {
    if (!this.contract || !this.signer) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      const tx = await this.contract.addAuditor(auditorAddress);
      const receipt = await tx.wait();
      this.logger.log(`✅ Auditor ${auditorAddress} adicionado!`);
      return { txHash: receipt.hash };
    } catch (error: any) {
      throw new BadRequestException(
        `Falha ao adicionar auditor: ${error.message}`,
      );
    }
  }

  /**
   * Remove um auditor (apenas ADMIN)
   */
  async removeAuditor(auditorAddress: string): Promise<{ txHash: string }> {
    if (!this.contract || !this.signer) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      const tx = await this.contract.removeAuditor(auditorAddress);
      const receipt = await tx.wait();
      this.logger.log(`✅ Auditor ${auditorAddress} removido!`);
      return { txHash: receipt.hash };
    } catch (error: any) {
      throw new BadRequestException(
        `Falha ao remover auditor: ${error.message}`,
      );
    }
  }

  /**
   * Verifica saúde da conexão
   */
  async healthCheck(): Promise<{
    connected: boolean;
    blockNumber?: number;
    contractAddress?: string;
    hasSigner: boolean;
  }> {
    try {
      if (!this.provider || !this.contract) {
        return { connected: false, hasSigner: false };
      }

      const blockNumber = await this.provider.getBlockNumber();
      const contractAddress = await this.contract.getAddress();

      return {
        connected: true,
        blockNumber,
        contractAddress,
        hasSigner: !!this.signer,
      };
    } catch (error) {
      return { connected: false, hasSigner: false };
    }
  }

  async validateConsistency(batchId: string): Promise<{
    isConsistent: boolean;
    discrepancies: string[];
    blockchainData: any;
    localData: any;
  }> {
    const blockchainBatch = await this.getFullBatch(batchId);
    const localBatch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: { batchSuppliers: true },
    });

    const discrepancies: string[] = [];

    if (!blockchainBatch && localBatch?.blockchainTxHash) {
      discrepancies.push(
        'Lote marcado como blockchain mas não encontrado na rede',
      );
    }

    if (blockchainBatch && localBatch) {
      // Comparar CO2
      const blockchainCO2 = blockchainBatch.co2Emitted;
      const localCO2 = localBatch.co2Emitted || 0;

      if (Math.abs(blockchainCO2 - localCO2) > 0.01) {
        discrepancies.push(
          `CO2不一致: blockchain=${blockchainCO2}, local=${localCO2}`,
        );
      }

      // Comparar status
      if (blockchainBatch.isCompliant !== localBatch.isCompliant) {
        discrepancies.push(
          `Status不一致: blockchain=${blockchainBatch.isCompliant}, local=${localBatch.isCompliant}`,
        );
      }
    }

    return {
      isConsistent: discrepancies.length === 0,
      discrepancies,
      blockchainData: blockchainBatch,
      localData: localBatch,
    };
  }
}
