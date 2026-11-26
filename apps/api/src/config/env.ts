import { z } from 'zod';

// URL de la base local de docker-compose.yml. Solo vale fuera de producción:
// en producción DATABASE_URL es obligatoria.
export const LOCAL_DATABASE_URL = 'postgresql://airspace:airspace@127.0.0.1:5434/airspace';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Puerto propio; si falta, el que asigne la plataforma (PORT) o 4000.
    API_PORT: z.coerce.number().int().positive().optional(),
    PORT: z.coerce.number().int().positive().optional(),
    // 127.0.0.1 en desarrollo; 0.0.0.0 dentro de un contenedor y en Vercel.
    API_HOST: z.string().min(1).optional(),
    VERCEL: z.string().optional(),
    // Detrás de un proxy (Railway, Docker con balanceador): número de saltos
    // de confianza, para que el límite de peticiones use la IP real.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Orígenes de la web permitidos por CORS, separados por coma. Se normalizan
    // al origen (sin barra final ni ruta), que es lo que compara el navegador.
    WEB_ORIGIN: z
      .string()
      .default('http://localhost:3000,http://127.0.0.1:3000')
      .transform((value, context) => {
        const origins = value.split(',').map((item) => item.trim()).filter(Boolean);
        const parsed = origins.map((item) => z.url().safeParse(item));
        if (parsed.some((result) => !result.success)) {
          context.addIssue({ code: 'custom', message: 'Invalid URL' });
          return z.NEVER;
        }
        return origins.map((item) => new URL(item).origin);
      }),
    DATABASE_URL: z.string().min(1).optional(),
    // Estilista IA. La clave solo se comprueba que exista (el SDK la lee del
    // entorno); nunca se guarda en la configuración ni se imprime.
    ANTHROPIC_API_KEY: z.string().optional(),
    STYLIST_ENABLED: z.enum(['true', 'false']).default('true'),
    STYLIST_MODEL: z.string().min(1).default('claude-opus-5-5'),
    STYLIST_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(2),
    // Clave compartida con el servidor de la web para saltar el límite de
    // peticiones (cabecera x-internal-key). Opcional; mínimo 24 caracteres.
    // Vacía equivale a no configurada (docker-compose pasa "" si falta).
    INTERNAL_API_KEY: z.union([z.literal(''), z.string().min(24)]).optional(),
  })
  .transform((env, context) => {
    if (!env.DATABASE_URL && env.NODE_ENV === 'production') {
      context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL es obligatoria en producción' });
      return z.NEVER;
    }
    return {
      nodeEnv: env.NODE_ENV,
      port: env.API_PORT ?? env.PORT ?? 4000,
      host: env.API_HOST ?? (env.VERCEL ? '0.0.0.0' : '127.0.0.1'),
      trustProxy: env.TRUST_PROXY,
      webOrigins: env.WEB_ORIGIN,
      databaseUrl: env.DATABASE_URL ?? LOCAL_DATABASE_URL,
      internalApiKey: env.INTERNAL_API_KEY || null,
      stylist: {
        enabled: env.STYLIST_ENABLED === 'true' && Boolean(env.ANTHROPIC_API_KEY),
        model: env.STYLIST_MODEL,
        dailyBudgetUsd: env.STYLIST_DAILY_BUDGET_USD,
      },
    };
  });

export type AppConfig = z.infer<typeof envSchema>;

// Valida las variables una vez al arrancar. Si algo falta, el error dice qué
// variable es, pero nunca imprime sus valores.
export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuración inválida: ${fields}`);
  }
  return result.data;
}
