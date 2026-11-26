import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';
import type { Response } from 'express';

const CODE_BY_STATUS: Record<number, ApiError['code']> = {
  [HttpStatus.BAD_REQUEST]: 'invalid_request',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

// Todos los errores salen como { code } (y, si es validación, { issues }):
// la web traduce el código, así ningún mensaje en un idioma fijo llega al
// visitante. Los errores inesperados se registran y responden 500 sin detalles.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    // Un error nunca se guarda en caché: un producto recién agregado no debe
    // seguir respondiendo 404 por la caché de una lectura anterior.
    response.setHeader('Cache-Control', 'no-store');
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logger.error(exception.stack ?? exception.message);
      const payload = exception.getResponse();
      const body: ApiError =
        typeof payload === 'object' && payload !== null && 'code' in payload
          ? (payload as ApiError)
          : { code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'invalid_request') };
      response.status(status).json(body);
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error' } satisfies ApiError);
  }
}
