/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: { select: { id: true, name: true, status: true } } },
    });

    if (!user) {
      this.logger.warn(`Tentativa de login com email não existente: ${email}`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!user.isActive) {
      this.logger.warn(`Tentativa de login de usuário inativo: ${email}`);
      throw new UnauthorizedException(
        'Usuário inativo. Contate o administrador',
      );
    }

    if (user.company && user.company.status !== 'ACTIVE') {
      this.logger.warn(
        `Tentativa de login de empresa inativa: ${user.company.name}`,
      );
      throw new UnauthorizedException(
        'Empresa inativa. Contate o administrador',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Tentativa de login com senha inválida: ${email}`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Atualizar último login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    this.logger.log(`Login bem-sucedido: ${user.email} (${user.role})`);

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company?.name,
      },
    };
  }

  async validateToken(token: string): Promise<any> {
    try {
      const decoded = this.jwtService.verify(token);
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
