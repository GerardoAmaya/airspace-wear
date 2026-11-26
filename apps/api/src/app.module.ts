import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CatalogModule } from './catalog/catalog.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { shouldSkipThrottle } from './common/throttle-skip.js';
import { createValidationPipe } from './common/validation.js';
import { APP_CONFIG, type AppConfig, ConfigModule } from './config/config.module.js';
import { ContentModule } from './content/content.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StylistModule } from './stylist/stylist.module.js';

// Módulo raíz. Validación, errores y límite de peticiones se registran aquí
// (no en main.ts) para que las pruebas e2e los tengan igual.
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    // 120 peticiones por minuto por IP; el estilista tiene su propio límite.
    // El servidor de la web queda fuera (ver common/throttle-skip.ts).
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        skipIf: (context) => shouldSkipThrottle(context, config),
      }),
    }),
    HealthModule,
    CatalogModule,
    ContentModule,
    StylistModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
