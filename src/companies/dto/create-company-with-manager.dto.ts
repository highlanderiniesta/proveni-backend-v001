// backend/src/companies/dto/create-company-with-manager.dto.ts
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { Plan } from '@prisma/client';

export class CreateCompanyWithManagerDto {
  // Dados da Empresa
  @IsString()
  companyName: string;

  @IsString()
  companyCnpj: string;

  @IsEmail()
  companyEmail: string;

  @IsString()
  @IsOptional()
  companyPhone?: string;

  @IsEnum(Plan)
  plan: Plan;

  // Dados do Gerente
  @IsString()
  managerName: string;

  @IsEmail()
  managerEmail: string;

  @IsString()
  managerPassword: string;
}
