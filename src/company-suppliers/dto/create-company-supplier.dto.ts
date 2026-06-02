import {
  IsString,
  IsEmail,
  IsOptional,
  IsStrongPassword,
  MinLength,
  IsEnum,
} from 'class-validator';

export class CreateSupplierDirectlyDto {
  // Dados do Fornecedor
  @IsString()
  @MinLength(3)
  supplierName: string;

  @IsString()
  @MinLength(14)
  supplierCnpj: string;

  @IsEmail()
  supplierEmail: string;

  @IsString()
  @IsOptional()
  supplierPhone?: string;

  @IsString()
  @IsOptional()
  supplierPassword?: string;

  @IsString()
  @IsOptional()
  responsibleName?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  // Dados da Empresa (usado pelo ADMIN/SPECIALIST para especificar)
  @IsString()
  @IsOptional()
  companyId?: string;
}
