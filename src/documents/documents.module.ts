import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { OcrModule } from '../ocr/ocr.module';
import { IpfsModule } from '../ipfs/ipfs.module';
import { AiModule } from '../ai/ai.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    // Configura a pasta temporária para uploads
    MulterModule.register({ dest: './uploads/temp' }),
    OcrModule,
    IpfsModule,
    AiModule,
    BlockchainModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
