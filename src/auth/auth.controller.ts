/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from 'src/auth/dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    try {
      const user = await this.authService.validateUser(
        body.email,
        body.password,
      );
      return this.authService.login(user);
    } catch (error: any) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: error.message || 'Credenciais inválidas',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
