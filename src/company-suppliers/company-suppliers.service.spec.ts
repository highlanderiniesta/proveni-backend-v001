import { Test, TestingModule } from '@nestjs/testing';
import { CompanySuppliersService } from './company-suppliers.service';

describe('CompanySuppliersService', () => {
  let service: CompanySuppliersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompanySuppliersService],
    }).compile();

    service = module.get<CompanySuppliersService>(CompanySuppliersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
