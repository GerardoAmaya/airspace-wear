// Contratos compartidos entre apps/web y apps/api: una sola definición de
// cada forma de datos, validada con zod en ambos lados.
// Primero la configuración de zod (sin eval, ver zod-config.ts).
import './zod-config.js';
export * from './auth.js';
export * from './catalog.js';
export * from './health.js';
export * from './locale.js';
export * from './orders.js';
export * from './stylist.js';
