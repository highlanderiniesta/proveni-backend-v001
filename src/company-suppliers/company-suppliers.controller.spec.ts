import { Test, TestingModule } from '@nestjs/testing';
import { CompanySuppliersController } from './company-suppliers.controller';
import { CompanySuppliersService } from './company-suppliers.service';

describe('CompanySuppliersController', () => {
  let controller: CompanySuppliersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanySuppliersController],
      providers: [CompanySuppliersService],
    }).compile();

    controller = module.get<CompanySuppliersController>(CompanySuppliersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
