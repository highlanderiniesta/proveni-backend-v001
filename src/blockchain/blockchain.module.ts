import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { BlockchainController } from './blockchain.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [BlockchainService, PrismaService],
  exports: [BlockchainService],
  controllers: [BlockchainController],
})
export class BlockchainModule {}
