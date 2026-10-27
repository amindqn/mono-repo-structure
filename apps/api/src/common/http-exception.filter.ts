import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { TaskNotFound } from '../modules/tasks/application/task-not-found.js';
import { ApplicationError } from './application-error.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    if (error instanceof ApplicationError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof TaskNotFound) {
      status = 404;
      code = 'TASK_NOT_FOUND';
      message = error.message;
    } else if (error instanceof ZodValidationException) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Check the request fields and try again';
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = `HTTP_${status}`;
      message = status >= 500 ? 'The service is temporarily unavailable' : error.message;
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      status = error.statusCode;
      code = `HTTP_${status}`;
      message = status === 413 ? 'The request is too large' : 'The request could not be processed';
    }
    if (status >= 500)
      this.logger.error({
        requestId: request.id,
        message: 'Request failed',
        error: error instanceof Error ? error.stack : 'Unknown error',
      });
    void reply.status(status).send({ status, code, message, requestId: request.id });
  }
}
