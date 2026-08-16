import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config, services } from '../config.js';

interface RouteDef {
  prefix: string;
  target: string;
  auth: 'required' | 'optional' | 'none';
  /** إعادة كتابة المسار قبل إرساله للخدمة الخلفية. */
  rewrite?: (path: string) => string;
}

/**
 * جدول التوجيه.
 *
 * <p>الـ gateway لا يعرف منطق الأعمال — يعرف فقط أي خدمة تملك أي مسار،
 * ومن يحتاج تسجيل دخول. المنطق يبقى داخل الخدمات.
 */
const ROUTES: RouteDef[] = [
  { prefix: '/api/v1/auth', target: services.identity, auth: 'none' },
  { prefix: '/api/v1/users', target: services.identity, auth: 'required' },
  { prefix: '/api/v1/products', target: services.catalog, auth: 'none' },
  { prefix: '/api/v1/categories', target: services.catalog, auth: 'none' },
  { prefix: '/api/v1/search', target: services.search, auth: 'optional' },
  { prefix: '/api/v1/recommendations', target: services.recommendation, auth: 'optional' },
  { prefix: '/api/v1/cart', target: services.cart, auth: 'optional' },
  { prefix: '/api/v1/orders', target: services.order, auth: 'required' },
  { prefix: '/api/v1/payments', target: services.payment, auth: 'required' },
  { prefix: '/api/v1/inventory', target: services.inventory, auth: 'none' },
];

/**
 * مسارات داخلية لا يجوز أن تُعرَض للعالم.
 * النمط يطابق المقطع سواء كان في وسط المسار أو في نهايته
 * ({@code /products/admin} و{@code /products/admin/x} كلاهما محظور).
 */
const BLOCKED_PATH = /\/(internal|admin|actuator)(\/|$|\?)/i;

export async function proxyRoutes(app: FastifyInstance): Promise<void> {
  // ملاحظة: `@fastify/reply-from` يُسجَّل في الجذر (server.ts) لا هنا،
  // لأن التسجيل داخل إضافة يحصره في سياقها فلا تراه مسارات الإدارة.
  for (const route of ROUTES) {
    app.all(`${route.prefix}`, { preHandler: preHandlerFor(app, route) }, handler(route));
    app.all(`${route.prefix}/*`, { preHandler: preHandlerFor(app, route) }, handler(route));
  }

  function preHandlerFor(instance: FastifyInstance, route: RouteDef) {
    const guards = [];

    // حظر المسارات الداخلية قبل أي شيء آخر.
    // نرد 404 لا 403 حتى لا نؤكّد وجود هذه المسارات أصلًا.
    guards.push(async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
      if (BLOCKED_PATH.test(req.url)) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Not found' });
      }
    });

    if (route.auth === 'required') guards.push(instance.requireAuth);
    if (route.auth === 'optional') guards.push(instance.optionalAuth);
    return guards;
  }

  function handler(route: RouteDef) {
    return function (this: FastifyInstance, req: FastifyRequest, reply: import('fastify').FastifyReply) {
      const path = route.rewrite ? route.rewrite(req.url) : req.url;

      return reply.from(`${route.target}${path}`, {
        rewriteRequestHeaders: (originalReq, headers) => {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries(headers)) {
            const key = k.toLowerCase();
            // الكوكيز لا تُمرَّر: الخدمات الخلفية لا تعرف الجلسات إطلاقًا.
            // أما `authorization` فيُمرَّر عمدًا حتى تستطيع خدمة تريد
            // التحقق بنفسها (identity-service) فعل ذلك — zero trust.
            if (key === 'cookie' || key === 'host' || key === 'content-length') continue;
            if (typeof v === 'string') clean[key] = v;
          }
          clean['x-request-id'] = (originalReq as FastifyRequest).id;
          clean['x-forwarded-host'] = String(headers['host'] ?? '');
          const user = (originalReq as FastifyRequest).user;
          if (user) {
            clean['x-user-id'] = user.id;
            clean['x-user-roles'] = user.roles.join(',');
          }
          return clean;
        },
        onError: (rep, { error }) => {
          req.log.error({ err: error, target: route.target }, 'upstream proxy error');
          rep.code(502).send({
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'The service is temporarily unavailable, please try again',
          });
        },
      });
    };
  }
}

export { config };
