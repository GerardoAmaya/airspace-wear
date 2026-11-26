import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';

// Valida parámetros con los esquemas zod de @airspace/contracts
// (@Query({ schema })) y responde 400 { code: 'invalid_request', issues }.
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new BadRequestException({
        code: 'invalid_request',
        issues: issues.map((issue) => ({
          path: (issue.path ?? []).map((segment) => (typeof segment === 'object' ? String(segment.key) : String(segment))).join('.'),
          message: issue.message,
        })),
      } satisfies ApiError),
  });
}
