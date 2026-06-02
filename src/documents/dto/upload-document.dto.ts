import { IsString, IsOptional, IsEnum } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @IsString()
  @IsOptional()
  batchId?: string;

  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsEnum(DocumentType)
  @IsOptional()
  docType?: DocumentType;
}
