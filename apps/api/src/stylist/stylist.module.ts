// Imports con nombre: funcionan igual con la compilación ESM local y la de Vercel.
import { Anthropic } from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { StylistController } from './stylist.controller.js';
import { ANTHROPIC_CLIENT, StylistService } from './stylist.service.js';

// Estilista IA: Claude con la herramienta show_products, en streaming (SSE).
// Sin clave de Anthropic queda apagado y la web usa el guion.
@Module({
  imports: [CatalogModule],
  controllers: [StylistController],
  providers: [
    StylistService,
    {
      provide: ANTHROPIC_CLIENT,
      inject: [APP_CONFIG],
      // El SDK lee ANTHROPIC_API_KEY del entorno (cargado desde el .env).
      useFactory: (config: AppConfig) => (config.stylist.enabled ? new Anthropic({ maxRetries: 1 }) : null),
    },
  ],
})
export class StylistModule {}
