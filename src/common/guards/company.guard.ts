/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/common/guards/company.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class CompanyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const companyId = request.params.companyId || request.body.companyId;

    if (user.role === 'ADMIN') return true;

    if (user.role === 'MANAGER' && user.companyId !== companyId) {
      throw new ForbiddenException(
        'Acesso negado: você não pertence a esta empresa',
      );
    }

    if (user.role === 'SUPPLIER' && user.companyId !== companyId) {
      throw new ForbiddenException(
        'Acesso negado: fornecedor não tem permissão',
      );
    }

    return true;
  }
}
