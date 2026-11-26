import { Global, Module } from '@nestjs/common';
import { type AppConfig, parseEnv } from './env.js';

// Token de inyección de la configuración validada.
export const APP_CONFIG = Symbol('APP_CONFIG');
export type { AppConfig };

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => parseEnv() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
