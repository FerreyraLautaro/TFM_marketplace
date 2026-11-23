import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { LlmRequestError, LlmUnavailableError } from '../llm/llm.errors';
import { InvalidLlmOutputError } from './catalog.errors';

export const DEFAULT_RETRY_AFTER_SECONDS = 30;

/**
 * Maps normalizer failures to HTTP so the service stays HTTP-agnostic. The
 * model is an upstream dependency, hence 502/503 rather than 500.
 */
@Catch(LlmUnavailableError, LlmRequestError, InvalidLlmOutputError)
export class CatalogExceptionFilter implements ExceptionFilter {
  catch(
    exception: LlmUnavailableError | LlmRequestError | InvalidLlmOutputError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof LlmUnavailableError) {
      response
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .setHeader('Retry-After', String(retryAfterSeconds(exception)))
        .json({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service Unavailable',
          message: 'The catalog normalizer is temporarily unavailable',
        });
      return;
    }

    const invalidOutput = exception instanceof InvalidLlmOutputError;
    response.status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      error: 'Bad Gateway',
      message: invalidOutput
        ? 'The model returned an invalid answer'
        : 'The model rejected the request',
      ...(invalidOutput && { runId: exception.runId }),
    });
  }
}

function retryAfterSeconds(error: LlmUnavailableError): number {
  if (error.retryAfterMs === undefined) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }
  return Math.max(1, Math.ceil(error.retryAfterMs / 1000));
}
