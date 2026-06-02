// src/manager/dto/create-manager.dto.ts
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// src/manager/dto/create-manager.dto.ts
export class SupplierLinkDto {
  @IsString()
  supplierId: string;

  @IsString()
  productName: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  co2Emitted?: number;

  @IsString()
  @IsOptional()
  documentId?: string;

  @IsString()
  @IsOptional()
  ipfsDocumentHash?: string; // ✅ ADICIONAR
}

export class CreateManagerBatchDto {
  @IsString()
  batchId: string;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productDescription?: string;

  @IsString()
  @IsOptional()
  countryOfOrigin?: string;

  @IsString()
  @IsOptional()
  destinationCountry?: string;

  @IsNumber()
  @IsOptional()
  totalValue?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  incoterm?: string;

  @IsString()
  @IsOptional()
  shippingDate?: string;

  @IsString()
  @IsOptional()
  estimatedArrival?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierLinkDto)
  @IsOptional()
  suppliers?: SupplierLinkDto[];
}
