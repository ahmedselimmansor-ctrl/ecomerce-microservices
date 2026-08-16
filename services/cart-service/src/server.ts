import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Cart, CartError, CartStore } from './cart-store.js';

const PORT = Number(process.env.PORT ?? 8086);
const HOST = process.env.HOST ?? '0.0.0.0';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
  trustProxy: true,
  bodyLimit: 65_536,
});

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  connectTimeout: 2_000,
  retryStrategy: (times: number) => Math.min(times * 200, 3_000),
});
redis.on('error', (err: unknown) => app.log.error({ err }, 'redis error'));

const store = new CartStore(redis);

/**
 * تحديد مالك السلة.
 *
 * <p>`X-User-Id` تضعها الـ gateway بعد التحقق من التوكن — لا يستطيع العميل
 * تزويرها لأن الـ gateway تحذف أي ترويسة بهذا الاسم قادمة من الخارج.
 * الزائر يحمل `X-Guest-Token` عشوائيًا نصدره نحن.
 */
function resolveOwner(req: FastifyRequest): { owner: 'user' | 'guest'; id: string } | null {
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) {
    return { owner: 'user', id: userId };
  }
  const guestToken = req.headers['x-guest-token'];
  if (typeof guestToken === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(guestToken)) {
    return { owner: 'guest', id: guestToken };
  }
  return null;
}

function requireOwner(req: FastifyRequest, reply: FastifyReply) {
  const owner = resolveOwner(req);
  if (!owner) {
    reply.code(400).send({
      code: 'NO_CART_IDENTITY',
      message: 'Provide either an authenticated session or an X-Guest-Token header',
    });
    return null;
  }
  return owner;
}

// ------------------------------------------------------------------- schemas

const addItemSchema = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  quantity: z.number().int().min(1).max(20).default(1),
});

const setQuantitySchema = z.object({
  quantity: z.number().int().min(0).max(20),
});

const mergeSchema = z.object({
  guestToken: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

// -------------------------------------------------------------------- routes

app.get('/health/live', async () => ({ status: 'UP' }));

app.get('/health/ready', async (_req, reply) => {
  try {
    await redis.ping();
    return { status: 'UP' };
  } catch {
    // Redis هو مخزن السلة نفسه، لا كاش: سقوطه يعني عدم الجاهزية فعلًا
    return reply.code(503).send({ status: 'DOWN', reason: 'redis unreachable' });
  }
});

/** يصدر توكن ضيف — تستدعيه الواجهة مرة عند أول زيارة. */
app.post('/api/v1/cart/guest-token', async (_req, reply) => {
  const token = randomUUID().replace(/-/g, '');
  return reply.code(201).send({ guestToken: token });
});

app.get('/api/v1/cart', async (req, reply) => {
  const owner = requireOwner(req, reply);
  if (!owner) return;
  return store.get(owner.owner, owner.id);
});

app.post('/api/v1/cart/items', async (req, reply) => {
  const owner = requireOwner(req, reply);
  if (!owner) return;

  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Invalid cart item',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const cart = await store.addItem(owner.owner, owner.id, parsed.data.sku, parsed.data.quantity);
  return reply.code(201).send(cart);
});

app.put('/api/v1/cart/items/:sku', async (req, reply) => {
  const owner = requireOwner(req, reply);
  if (!owner) return;

  const { sku } = req.params as { sku: string };
  const parsed = setQuantitySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Quantity must be an integer between 0 and 20',
    });
  }
  return store.setQuantity(owner.owner, owner.id, sku, parsed.data.quantity);
});

app.delete('/api/v1/cart/items/:sku', async (req, reply) => {
  const owner = requireOwner(req, reply);
  if (!owner) return;
  const { sku } = req.params as { sku: string };
  return store.removeItem(owner.owner, owner.id, sku);
});

app.delete('/api/v1/cart', async (req, reply) => {
  const owner = requireOwner(req, reply);
  if (!owner) return;
  await store.clear(owner.owner, owner.id);
  return reply.code(204).send();
});

/** دمج سلة الضيف بعد تسجيل الدخول — تستدعيه الواجهة مباشرة بعد الـ login. */
app.post('/api/v1/cart/merge', async (req, reply) => {
  const userId = req.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.length === 0) {
    return reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Merging requires an authenticated user',
    });
  }
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid guest token' });
  }

  const cart: Cart = await store.merge(parsed.data.guestToken, userId);
  req.log.info({ userId, items: cart.items.length }, 'guest cart merged');
  return cart;
});

// ------------------------------------------------------------ error handling

app.setErrorHandler((error: FastifyError, req, reply) => {
  if (error instanceof CartError) {
    return reply.code(error.status).send({ code: error.code, message: error.message });
  }
  req.log.error({ err: error }, 'unhandled error');
  return reply.code(500).send({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
});

// --------------------------------------------------------- graceful shutdown

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received — shutting down`);
    app.close().then(
      async () => {
        await redis.quit().catch(() => redis.disconnect());
        process.exit(0);
      },
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`cart-service listening on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
