import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, initApp } from './app.setup.js';
import { APP_CONFIG, type AppConfig } from './config/config.module.js';
import { loadWorkspaceEnv } from './config/load-env.js';

// El .env se carga antes de crear la app: la configuración se valida al
// construir los proveedores, no al importar los módulos.
loadWorkspaceEnv();
if (process.env.VERCEL) console.log('API: arrancando en Vercel');

const app = await NestFactory.create(AppModule);
const config = app.get<AppConfig>(APP_CONFIG);
configureApp(app, config);
await initApp(app);

// En Vercel el lanzador intercepta listen(): se llama solo con el puerto,
// como en su ejemplo para NestJS. Fuera de Vercel se fija también la interfaz.
if (process.env.VERCEL) await app.listen(config.port);
else await app.listen(config.port, config.host);
console.log(`API en http://${config.host}:${config.port} (estado: /health)`);
