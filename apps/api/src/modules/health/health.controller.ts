import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { healthSchema } from '@repo/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { PERSISTENCE } from '../../infrastructure/persistence.module.js';
import type { Persistence } from '../../infrastructure/persistence.module.js';
import { Public } from '../../common/auth-context.js';

class HealthDto extends createZodDto(healthSchema) {}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(PERSISTENCE) private readonly persistence: Persistence) {}

  @Get('live')
  @ZodResponse({ type: HealthDto })
  live() {
    return { status: 'ok' as const, persistence: this.persistence.mode };
  }

  @Get('ready')
  @ZodResponse({ type: HealthDto })
  async ready() {
    try {
      await this.persistence.check();
    } catch {
      throw new ServiceUnavailableException('Storage is not ready');
    }
    return this.live();
  }
}
