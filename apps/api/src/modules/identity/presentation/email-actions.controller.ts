import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { RouteConfig } from '@nestjs/platform-fastify';
import type { FastifyReply } from 'fastify';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../../common/auth-context.js';
import { EmailActionsService } from '../application/email-actions.service.js';
import { AuthCookies } from './auth-cookies.js';
import {
  AcceptedEmailDto,
  EmailRequestDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './identity.dto.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class EmailActionsController {
  constructor(
    @Inject(EmailActionsService) private readonly emails: EmailActionsService,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
  ) {}
  @Post('resend-verification')
  @RouteConfig({ rateLimit: { max: 5, timeWindow: '1 minute' } })
  @ApiBody({ type: EmailRequestDto })
  @ZodResponse({ status: 202, type: AcceptedEmailDto })
  resend(@Body() input: EmailRequestDto) {
    return this.emails.request(input.email, 'verify-email');
  }
  @Post('forgot-password')
  @RouteConfig({ rateLimit: { max: 5, timeWindow: '1 minute' } })
  @ApiBody({ type: EmailRequestDto })
  @ZodResponse({ status: 202, type: AcceptedEmailDto })
  forgot(@Body() input: EmailRequestDto) {
    return this.emails.request(input.email, 'reset-password');
  }
  @Post('verify-email')
  @HttpCode(204)
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '1 minute' } })
  @ApiBody({ type: VerifyEmailDto })
  @ApiNoContentResponse()
  verify(@Body() input: VerifyEmailDto) {
    return this.emails.verify(input.token, input.password);
  }
  @Post('reset-password')
  @HttpCode(204)
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '1 minute' } })
  @ApiBody({ type: ResetPasswordDto })
  @ApiNoContentResponse()
  async reset(@Body() input: ResetPasswordDto, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.emails.reset(input.token, input.newPassword);
    this.cookies.clear(reply);
  }
}
