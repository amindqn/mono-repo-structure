import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { RouteConfig } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodResponse } from 'nestjs-zod';
import { AUTH_COOKIES } from '@repo/contracts';
import { Public } from '../../../common/auth-context.js';
import type { AuthenticatedRequest } from '../../../common/auth-context.js';
import { ApplicationError } from '../../../common/application-error.js';
import { AuthService } from '../application/auth.service.js';
import { AuthCookies } from './auth-cookies.js';
import {
  AuthSessionDto,
  LoginDto,
  PasswordDto,
  RegisterDto,
  UserDto,
  SessionPresenceDto,
  AcceptedEmailDto,
} from './identity.dto.js';

@ApiTags('auth')
@ApiCookieAuth('access')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
  ) {}
  @Public()
  @Get('session')
  @ZodResponse({ type: SessionPresenceDto })
  session(@Req() request: FastifyRequest) {
    return {
      present: Boolean(
        request.cookies[AUTH_COOKIES.access] || request.cookies[AUTH_COOKIES.refresh],
      ),
    };
  }
  @Public()
  @Post('register')
  @RouteConfig({ rateLimit: { max: 5, timeWindow: '1 minute' } })
  @ApiBody({ type: RegisterDto })
  @ZodResponse({ status: 202, type: AcceptedEmailDto })
  async register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }
  @Public()
  @Post('login')
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '1 minute' } })
  @ApiBody({ type: LoginDto })
  @ZodResponse({ status: 200, type: AuthSessionDto })
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.login(input);
    this.cookies.set(reply, result);
    return result.body;
  }
  @Public()
  @Post('refresh')
  @ZodResponse({ status: 200, type: AuthSessionDto })
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const result = await this.auth.refresh(request.cookies[AUTH_COOKIES.refresh]);
      this.cookies.set(reply, result);
      return result.body;
    } catch (error) {
      if (error instanceof ApplicationError && error.status === 401) this.cookies.clear(reply);
      throw error;
    }
  }
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(request.cookies[AUTH_COOKIES.refresh]);
    this.cookies.clear(reply);
  }
  @Get('me')
  @ZodResponse({ type: UserDto })
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
  @Post('password')
  @HttpCode(204)
  @ApiBody({ type: PasswordDto })
  @ApiNoContentResponse()
  async password(
    @Req() request: AuthenticatedRequest,
    @Body() input: PasswordDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.changePassword(request.user.id, input);
    this.cookies.clear(reply);
  }
}
