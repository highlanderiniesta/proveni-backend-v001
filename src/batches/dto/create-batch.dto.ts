import {
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';

export class CreateBatchDto {
  @IsString()
  batchId: string;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productDescription?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  // ============ CAMPOS DE EXPORTAÇÃO ============

  @IsString()
  @IsOptional()
  countryOfOrigin?: string;

  @IsString()
  @IsOptional()
  destinationCountry?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  totalValue?: number;

  @IsString()
  @IsOptional()
  @IsIn(['BRL', 'EUR', 'USD', 'GBP', 'CNY', 'ARS', 'CLP'])
  currency?: string;

  @IsString()
  @IsOptional()
  @IsIn(['FOB', 'CIF', 'EXW', 'CIP', 'DAP', 'DDP', 'FCA'])
  incoterm?: string;

  @IsDateString()
  @IsOptional()
  shippingDate?: string;

  @IsDateString()
  @IsOptional()
  estimatedArrival?: string;

  // ============ CAMPOS DE SUSTENTABILIDADE ============

  @IsNumber()
  @IsOptional()
  @Min(0)
  co2Emitted?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  co2PerUnit?: number;

  @IsString()
  @IsOptional()
  ncmCode?: string;
}
