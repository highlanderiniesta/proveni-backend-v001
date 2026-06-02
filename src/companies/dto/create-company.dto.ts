import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { CompanyType, Plan } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsString()
  cnpj: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(CompanyType)
  companyType: CompanyType;

  @IsEnum(Plan)
  plan: Plan;
}
