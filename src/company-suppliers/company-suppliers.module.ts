import { Module } from '@nestjs/common';
import { CompanySuppliersService } from './company-suppliers.service';
import { CompanySuppliersController } from './company-suppliers.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompanySuppliersController],
  providers: [CompanySuppliersService],
  exports: [CompanySuppliersService],
})
export class CompanySuppliersModule {}
