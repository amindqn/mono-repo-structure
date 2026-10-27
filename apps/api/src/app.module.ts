import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import type { Environment } from './config/environment.js';
import { PersistenceModule } from './infrastructure/persistence.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

@Module({})
export class AppModule {
  static register(env: Environment): DynamicModule {
    return {
      module: AppModule,
      imports: [PersistenceModule.register(env), TasksModule],
      controllers: [HealthController],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    };
  }
}
