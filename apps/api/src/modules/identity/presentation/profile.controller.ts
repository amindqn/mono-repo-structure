import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUserId } from '../../../common/auth-context.js';
import type { AuthenticatedRequest } from '../../../common/auth-context.js';
import { ProfileService } from '../application/profile.service.js';
import { ProfileDto, SessionListDto, UserDto } from './identity.dto.js';

@ApiCookieAuth('access')
@ApiTags('account')
@Controller()
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}
  @Patch('users/me')
  @ApiBody({ type: ProfileDto })
  @ZodResponse({ type: UserDto })
  update(@CurrentUserId() userId: string, @Body() input: ProfileDto) {
    return this.profiles.update(userId, input);
  }
  @Get('auth/sessions')
  @ZodResponse({ type: SessionListDto })
  sessions(@Req() request: AuthenticatedRequest) {
    return this.profiles.sessions(request.user.id, request.sessionId);
  }
  @Delete('auth/sessions/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(@CurrentUserId() userId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.profiles.revokeSession(userId, id);
  }
}
