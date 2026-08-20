import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config, services } from '../config.js';
import { callUpstream, optional, UpstreamError } from '../lib/upstream.js';

/**
 * مسارات BFF المجمّعة.
 *
 * <p>صفحة المنتج تحتاج 4 مصادر. لو نادتها الواجهة مباشرة لكانت 4 رحلات
 * ذهاب وعودة عبر الإنترنت (~600ms على 4G). هنا نجمعها في نداء واحد ينفّذ
 * الأربعة بالتوازي داخل نفس الـ VPC (~40ms)، والنتيجة تُخزَّن في Redis.
 */
export async function bffRoutes(app: FastifyInstance): Promise<void> {
  const localeOf = (h?: string): string =>
    h?.split(',')[0]?.trim().split('-')[0]?.toLowerCase() === 'en' ? 'en' : 'ar';

  // ------------------------------------------------------------ product page

  app.get('/api/v1/bff/pdp/:idOrSlug', {
    preHandler: [app.optionalAuth],
    schema: {
      params: {
        type: 'object',
        properties: { idOrSlug: { type: 'string', maxLength: 160 } },
        required: ['idOrSlug'],
      },
    },
  }, async (req, reply) => {
    const { idOrSlug } = req.params as { idOrSlug: string };
    const locale = localeOf(req.headers['accept-language']);
    const userId = req.user?.id;

    const cacheKey = `pdp:${idOrSlug}:${locale}`;
    const buildPage = async () => {
      const headers = { 'accept-language': locale, 'x-request-id': req.id };

      /**
       * الروابط الظاهرة للمستخدم تستعمل الـ slug (أفضل لمحركات البحث)،
       * بينما الأنظمة الداخلية تستعمل الـ sku. نقبل الاثنين هنا: نجرّب
       * الـ sku أولًا ثم نسقط إلى الـ slug.
       */
      const product = await callUpstream<{ sku: string }>(
        services.catalog, `/api/v1/products/${encodeURIComponent(idOrSlug)}`, { headers },
      ).catch((err) => {
        if (err instanceof UpstreamError && err.status === 404) {
          return callUpstream<{ sku: string }>(
            services.catalog, `/api/v1/products/slug/${encodeURIComponent(idOrSlug)}`, { headers },
          );
        }
        throw err;
      });

      // نداءات التوفّر والمشابه تحتاج الـ sku الحقيقي لا ما كتبه المستخدم
      const sku = product.sku;

      const [stock, similar] = await Promise.all([
        optional(
          callUpstream<{ available: number; inStock: boolean; lowStock: boolean }>(
            services.inventory, `/api/v1/inventory/${encodeURIComponent(sku)}`,
            { headers, timeoutMs: 800 }),
          { available: 0, inStock: true, lowStock: false },
          (err) => req.log.warn({ err, sku }, 'inventory lookup failed — assuming in stock'),
        ),
        optional(
          callUpstream<unknown[]>(
            services.catalog, `/api/v1/products/${encodeURIComponent(sku)}/similar?limit=12`,
            { headers, timeoutMs: 800 }),
          [],
          (err) => req.log.warn({ err, sku }, 'similar products failed'),
        ),
      ]);

      return { product, availability: stock, similar };
    };

    let page: Awaited<ReturnType<typeof buildPage>>;
    try {
      page = userId
        ? await buildPage()
        : await app.cache.getOrSet(cacheKey, config.PDP_CACHE_TTL_SECONDS, buildPage);
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 404) {
        return reply.code(404).send({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
      }
      throw err;
    }

    // التوصيات الشخصية خارج الكاش المشترك
    const resolvedSku = (page.product as { sku?: string }).sku ?? idOrSlug;
    const recommended = await optional(
      callUpstream<unknown[]>(
        services.recommendation,
        `/api/v1/recommendations/related?sku=${encodeURIComponent(resolvedSku)}&limit=12`,
        { headers: { 'x-user-id': userId, 'accept-language': locale }, timeoutMs: 600 },
      ),
      [],
      (err) => req.log.warn({ err, sku: resolvedSku },
        'recommendations unavailable — degrading gracefully'),
    );

    if (!userId) {
      reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    } else {
      reply.header('cache-control', 'private, no-store');
    }

    return { ...page, recommended };
  });

  // -------------------------------------------------------------- home page

  app.get('/api/v1/bff/home', { preHandler: [app.optionalAuth] }, async (req, reply) => {
    const locale = localeOf(req.headers['accept-language']);
    const userId = req.user?.id;
    const headers = { 'accept-language': locale, 'x-request-id': req.id };

    const [categories, deals, bestsellers] = await Promise.all([
      optional(callUpstream<unknown[]>(services.catalog, '/api/v1/categories', { headers }), []),
      optional(
        callUpstream<{ items: unknown[] }>(
          services.catalog, '/api/v1/products?sort=price_asc&size=12', { headers }),
        { items: [] },
      ),
      optional(
        callUpstream<{ items: unknown[] }>(
          services.catalog, '/api/v1/products?sort=rating&size=12', { headers }),
        { items: [] },
      ),
    ]);

    const forYou = userId
      ? await optional(
          callUpstream<unknown[]>(
            services.recommendation, '/api/v1/recommendations/for-you?limit=12',
            { headers: { ...headers, 'x-user-id': userId }, timeoutMs: 700 }),
          [],
        )
      : [];

    reply.header('cache-control', userId ? 'private, no-store' : 'public, max-age=120');

    return {
      categories,
      deals: deals.items ?? [],
      bestsellers: bestsellers.items ?? [],
      forYou,
    };
  });

  // ----------------------------------------------------------- cart snapshot

  /** السلة + بيانات المنتجات + التوفّر في نداء واحد. */
  app.get('/api/v1/bff/cart', { preHandler: [app.optionalAuth] }, async (req) => {
    const locale = localeOf(req.headers['accept-language']);
    const guestToken = req.headers['x-guest-token'];
    const headers = {
      'accept-language': locale,
      'x-request-id': req.id,
      'x-user-id': req.user?.id,
      'x-guest-token': typeof guestToken === 'string' ? guestToken : undefined,
    };

    const cart = await callUpstream<{ items: { sku: string; quantity: number }[] }>(
      services.cart, '/api/v1/cart', { headers });

    if (cart.items.length === 0) {
      return { items: [], products: [], availability: {}, subtotalMinor: 0 };
    }

    const skus = cart.items.map((i) => i.sku);
    const [products, availability] = await Promise.all([
      callUpstream<{ sku: string; priceMinor: number }[]>(
        services.catalog, '/api/v1/products/bulk', { method: 'POST', headers, body: { skus } }),
      optional(
        callUpstream<Record<string, number>>(
          services.inventory, '/api/v1/inventory/availability',
          { method: 'POST', headers, body: { skus }, timeoutMs: 800 }),
        {},
      ),
    ]);

    // المجموع يُحسب من أسعار الكتالوج لا من السلة — السلة تخزّن الكميات فقط
    const priceBySku = new Map(products.map((p) => [p.sku, p.priceMinor]));
    const subtotalMinor = cart.items.reduce(
      (sum, item) => sum + (priceBySku.get(item.sku) ?? 0) * item.quantity, 0);

    return { items: cart.items, products, availability, subtotalMinor };
  });

  // ------------------------------------------------- user interaction events

  const interactionSchema = z.object({
    eventType: z.enum(['view', 'add_to_cart', 'purchase', 'search', 'wishlist']),
    sku: z.string().max(64).optional(),
    query: z.string().max(200).optional(),
  });

  /**
   * تتبّع تفاعلات المستخدم لتغذية Vertex AI Search for commerce.
   * الرد `202` فورًا: التتبّع يجب ألا يبطّئ التصفّح إطلاقًا.
   */
  app.post('/api/v1/bff/track', { preHandler: [app.optionalAuth] }, async (req, reply) => {
    const parsed = interactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid tracking payload',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    reply.code(202).send({ accepted: true });

    // الإرسال بعد الرد — فشله لا يعني شيئًا للمستخدم
    void callUpstream(services.recommendation, '/api/v1/recommendations/events', {
      method: 'POST',
      headers: { 'x-user-id': req.user?.id, 'x-request-id': req.id },
      body: { ...parsed.data, sessionId: req.headers['x-session-id'] ?? req.id },
      timeoutMs: 1_000,
    }).catch((err) => req.log.debug({ err }, 'interaction tracking failed'));
  });
}
