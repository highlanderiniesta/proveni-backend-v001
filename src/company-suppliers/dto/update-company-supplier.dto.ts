import { PartialType } from '@nestjs/mapped-types';
import { CreateSupplierDirectlyDto } from './create-company-supplier.dto';

export class UpdateCompanySupplierDto extends PartialType(
  CreateSupplierDirectlyDto,
) {}
