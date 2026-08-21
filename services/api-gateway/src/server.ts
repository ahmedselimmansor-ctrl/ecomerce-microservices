import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import replyFrom from '@fastify/reply-from';
import { randomUUID } from 'node:crypto';

import { config, corsOrigins, services } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { cachePlugin } from './plugins/cache.js';
import { proxyRoutes } from './routes/proxy.js';
import { bffRoutes } from './routes/bff.js';
import { adminRoutes } from './routes/admin.js';
import { UpstreamError } from './lib/upstream.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino/file', options: { destination: 1 } } }
      : {}),
  },
  // معرّف الطلب يُمرَّر لكل الخدمات الخلفية فيمكن تتبّع الرحلة كاملة
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
  trustProxy: true,
  bodyLimit: 1_048_576,
  disableRequestLogging: config.NODE_ENV === 'production',
});

await app.register(helmet, {
  contentSecurityPolicy: false, // الواجهة تتولى CSP الخاص بها
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'content-type', 'authorization', 'accept-language',
    'idempotency-key', 'x-guest-token', 'x-session-id', 'x-request-id',
  ],
  exposedHeaders: ['x-request-id', 'retry-after'],
  maxAge: 86_400,
});

await app.register(compress, { global: true, threshold: 1_024 });

// في الجذر لا داخل إضافة: `reply.from` يجب أن يكون متاحًا
// لمسارات الـ proxy والإدارة معًا
await app.register(replyFrom, {
  undici: {
    connections: 128,
    pipelining: 1,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 300_000,
  },
});

await app.register(cachePlugin);
await app.register(authPlugin);

/**
 * تحديد المعدّل موزّع عبر Redis — لا في ذاكرة كل pod.
 * بدون ذلك يصبح الحدّ الفعلي = الحدّ × عدد النسخ، وهو ما يجعله بلا معنى.
 */
await app.register(rateLimit, {
  global: true,
  max: config.RATE_LIMIT_MAX,
  timeWindow: config.RATE_LIMIT_WINDOW_MS,
  redis: app.redis,
  nameSpace: 'rl:',
  keyGenerator: (req) => req.user?.id ?? req.ip,
  // حدود أضيق على مسارات إساءة الاستخدام المعتادة
  allowList: (req) => req.url.startsWith('/health'),
  /*
   * `statusCode` إلزامي هنا. بدونه يصل الكائن إلى setErrorHandler بلا حالة،
   * فيُعامَل كخطأ مجهول ويردّ 500 — أي أن تجاوز الحدّ كان يبدو عطلًا في
   * الخادم بدل رفضٍ مقصود، ويشجّع العميل على إعادة المحاولة فورًا بدل
   * احترام Retry-After.
   */
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMITED',
    message: `Too many requests. Retry in ${Math.ceil(ctx.ttl / 1000)}s`,
  }),
});

// ---------------------------------------------------------------- health

app.get('/health/live', async () => ({ status: 'UP' }));

app.get('/health/ready', async (_req, reply) => {
  // الجاهزية تفحص التبعيات الحرجة فقط. Redis كاش اختياري ⇒ لا يمنع الجاهزية.
  try {
    await app.redis.ping();
    return { status: 'UP', redis: 'UP' };
  } catch {
    return reply.code(200).send({ status: 'UP', redis: 'DEGRADED' });
  }
});

/**
 * لوحة تشخيص للمشغّل — ليست probe لـ Kubernetes.
 *
 * <p>الخدمات تكشف مسارات صحة مختلفة حسب لغتها: Spring Boot على
 * {@code /actuator/health/liveness} و Node/Python على {@code /health/live}.
 * نجرّب الاثنين ونعتبر الخدمة سليمة إن نجح أيّهما.
 */
app.get('/health/services', async () => {
  const probe = async (url: string): Promise<boolean> => {
    for (const path of ['/actuator/health/liveness', '/health/live']) {
      try {
        const res = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(1_500) });
        if (res.ok) return true;
      } catch {
        // نجرّب المسار التالي
      }
    }
    return false;
  };

  const results = await Promise.all(
    Object.entries(services).map(async ([name, url]) =>
      [name, (await probe(url)) ? 'UP' : 'DOWN'] as const),
  );
  return Object.fromEntries(results);
});

// ---------------------------------------------------------------- routes

// الترتيب مقصود: مسارات الإدارة تُسجَّل قبل الـ proxy العام حتى لا يبتلعها
await app.register(bffRoutes);
await app.register(adminRoutes);
await app.register(proxyRoutes);

// ------------------------------------------------------------ error handling

app.setErrorHandler((error: FastifyError, req, reply) => {
  if (error instanceof UpstreamError) {
    return reply.code(error.status).send({
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }
  if (error.validation) {
    return reply.code(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.validation,
    });
  }

  req.log.error({ err: error }, 'unhandled error');
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  return reply.code(status).send({
    code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
    // لا نسرّب تفاصيل داخلية في الإنتاج
    message: status === 500 ? 'An unexpected error occurred' : error.message,
  });
});

app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ code: 'NOT_FOUND', message: `No route for ${req.method} ${req.url}` });
});

// ------------------------------------------------------------ graceful shutdown

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received — draining connections`);
    // Kubernetes يزيل الـ pod من الـ endpoints أولًا؛ المهلة تسمح بإنهاء
    // الطلبات الجارية قبل الإغلاق
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error({ err }, 'error during shutdown');
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`api-gateway listening on ${config.HOST}:${config.PORT}`);
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
