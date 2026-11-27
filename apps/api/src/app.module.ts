import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { RateLimitGuard } from './common/rate-limit.js';
import { createValidationPipe } from './common/validation.js';
import { ConfigModule } from './config/config.module.js';
import { ContentModule } from './content/content.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StylistModule } from './stylist/stylist.module.js';

// Módulo raíz. Validación, errores y límite de peticiones se registran aquí
// (no en main.ts) para que las pruebas e2e los tengan igual.
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    CatalogModule,
    ContentModule,
    StylistModule,
    AuthModule,
    OrdersModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    // 120 peticiones por minuto por IP y ruta; el estilista tiene su propio
    // límite y el servidor de la web queda fuera (common/rate-limit.ts).
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
