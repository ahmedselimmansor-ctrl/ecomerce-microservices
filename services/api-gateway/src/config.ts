import { z } from 'zod';

/**
 * الإعدادات تُتحقَّق عند الإقلاع.
 * الفشل السريع عند نقص متغيّر أفضل بكثير من اكتشافه في أول طلب إنتاجي.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  SERVICE_URL_IDENTITY: z.string().url().default('http://localhost:8081'),
  SERVICE_URL_CATALOG: z.string().url().default('http://localhost:8082'),
  SERVICE_URL_ORDER: z.string().url().default('http://localhost:8083'),
  SERVICE_URL_PAYMENT: z.string().url().default('http://localhost:8084'),
  SERVICE_URL_INVENTORY: z.string().url().default('http://localhost:8085'),
  SERVICE_URL_CART: z.string().url().default('http://localhost:8086'),
  SERVICE_URL_SEARCH: z.string().url().default('http://localhost:8087'),
  SERVICE_URL_RECOMMENDATION: z.string().url().default('http://localhost:8088'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  PDP_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const config = parsed.data;

export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim());

export const services = {
  identity: config.SERVICE_URL_IDENTITY,
  catalog: config.SERVICE_URL_CATALOG,
  order: config.SERVICE_URL_ORDER,
  payment: config.SERVICE_URL_PAYMENT,
  inventory: config.SERVICE_URL_INVENTORY,
  cart: config.SERVICE_URL_CART,
  search: config.SERVICE_URL_SEARCH,
  recommendation: config.SERVICE_URL_RECOMMENDATION,
} as const;

export type ServiceName = keyof typeof services;
