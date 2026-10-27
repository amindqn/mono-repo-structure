import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { mediaConfigSchema, mediaListSchema, mediaSchema } from '@repo/contracts';
import type { AuthenticatedRequest } from '../../../common/auth-context.js';
import { CurrentUserId } from '../../../common/auth-context.js';
import { MediaService } from '../application/media.service.js';

class MediaDto extends createZodDto(mediaSchema) {}
class MediaListDto extends createZodDto(mediaListSchema) {}
class MediaConfigDto extends createZodDto(mediaConfigSchema) {}
@ApiTags('media')
@ApiCookieAuth('access')
@Controller('media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly files: MediaService) {}
  @Get()
  @ZodResponse({ type: MediaListDto })
  list(@CurrentUserId() ownerId: string) {
    return this.files.list(ownerId);
  }
  @Get('config')
  @ZodResponse({ type: MediaConfigDto })
  config() {
    return this.files.config();
  }
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiQuery({ name: 'storage', enum: ['database', 'object'], required: false })
  @ZodResponse({ status: 201, type: MediaDto })
  async upload(@Req() request: AuthenticatedRequest, @Query('storage') storage = 'database') {
    if (!['database', 'object'].includes(storage))
      throw new BadRequestException('Choose database or object storage');
    let input: { filename: string; claimedType: string; bytes: Buffer } | undefined;
    for await (const part of request.parts()) {
      if (part.type !== 'file' || part.fieldname !== 'file' || input)
        throw new BadRequestException('Send exactly one file using the file field');
      input = { filename: part.filename, claimedType: part.mimetype, bytes: await part.toBuffer() };
    }
    if (!input) throw new BadRequestException('Send one file using the file field');
    return this.files.upload(request.user.id, {
      ...input,
      storage: storage as 'database' | 'object',
    });
  }
  @Get(':id/content')
  async content(
    @CurrentUserId() ownerId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() reply: FastifyReply,
  ) {
    const { asset, bytes } = await this.files.read(ownerId, id);
    reply.type(asset.contentType);
    reply.header(
      'content-disposition',
      `${asset.contentType.startsWith('image/') ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
    );
    reply.header('content-security-policy', "default-src 'none'; sandbox");
    return reply.send(Buffer.from(bytes));
  }
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@CurrentUserId() ownerId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.files.remove(ownerId, id);
  }
}
