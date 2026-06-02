import { PartialType } from '@nestjs/swagger';
import { CreateManagerBatchDto } from './create-manager.dto';

export class UpdateManagerDto extends PartialType(CreateManagerBatchDto) {}
