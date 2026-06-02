import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { CompanySuppliersModule } from './company-suppliers/company-suppliers.module';
import { BatchesModule } from './batches/batches.module';
import { OcrModule } from './ocr/ocr.module';
import { IpfsModule } from './ipfs/ipfs.module';
import { DocumentsModule } from './documents/documents.module';
import { AiModule } from './ai/ai.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ManagerModule } from './manager/manager.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, CompaniesModule, CompanySuppliersModule, BatchesModule, OcrModule, IpfsModule, DocumentsModule, AiModule, BlockchainModule, ManagerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
