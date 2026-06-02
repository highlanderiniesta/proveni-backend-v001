import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [OcrModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
