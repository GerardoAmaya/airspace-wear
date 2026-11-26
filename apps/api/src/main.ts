import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, initApp } from './app.setup.js';
import { APP_CONFIG, type AppConfig } from './config/config.module.js';
import { loadWorkspaceEnv } from './config/load-env.js';

// El .env se carga antes de crear la app: la configuración se valida al
// construir los proveedores, no al importar los módulos.
loadWorkspaceEnv();

const app = await NestFactory.create(AppModule);
const config = app.get<AppConfig>(APP_CONFIG);
configureApp(app, config);
await initApp(app);

await app.listen(config.port, config.host);
console.log(`API en http://${config.host}:${config.port} (estado: /health)`);
