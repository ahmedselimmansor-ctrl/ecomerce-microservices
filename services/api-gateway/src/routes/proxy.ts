import type { FastifyInstance, FastifyRequest } from 'fastify';
import { services } from '../config.js';
import { isBlockedPath } from '../lib/path-guard.js';

interface RouteDef {
  prefix: string;
  target: string;
  auth: 'required' | 'optional' | 'none';
  /** إعادة كتابة المسار قبل إرساله للخدمة الخلفية. */
  rewrite?: (path: string) => string;
  /**
   * حدّ معدّل أضيق من الحدّ العام لهذا المسار.
   *
   * <p>يُمرَّر عبر `config.rateLimit` على المسار نفسه لا بتسجيل الإضافة داخل
   * نطاق مغلق: النطاق المغلق يحصر الحدّ في المسارات المسجَّلة داخله، وهذه
   * مسجَّلة هنا — فكان الحدّ المشدَّد يُنشأ على نطاق فارغ ولا يُطبَّق أبدًا،
   * وتقع محاولات الدخول تحت الحدّ العام (300) بدل 10.
   */
  rateLimit?: { max: number; timeWindow: number };
}

/**
 * جدول التوجيه.
 *
 * <p>الـ gateway لا يعرف منطق الأعمال — يعرف فقط أي خدمة تملك أي مسار،
 * ومن يحتاج تسجيل دخول. المنطق يبقى داخل الخدمات.
 */
const ROUTES: RouteDef[] = [
  // تخمين كلمات المرور يبدأ هنا: حدّ ضيق يجعل الهجوم غير عملي بلا إزعاج
  // مستخدم يخطئ كلمته مرتين.
  { prefix: '/api/v1/auth', target: services.identity, auth: 'none',
    rateLimit: { max: 10, timeWindow: 60_000 } },
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

export async function proxyRoutes(app: FastifyInstance): Promise<void> {
  // ملاحظة: `@fastify/reply-from` يُسجَّل في الجذر (server.ts) لا هنا،
  // لأن التسجيل داخل إضافة يحصره في سياقها فلا تراه مسارات الإدارة.
  for (const route of ROUTES) {
    const opts = {
      preHandler: preHandlerFor(app, route),
      ...(route.rateLimit
        ? {
            config: {
              rateLimit: {
                ...route.rateLimit,
                /*
                 * مفتاح مستقل لكل مسار له حدّ خاص. بدون البادئة يشترك
                 * المسار مع الحدّ العام في نفس مفتاح Redis، فتستهلك تصفّحُ
                 * المنتجات رصيدَ محاولات الدخول — ويصير الحدّ «١٠» رقمًا
                 * يعتمد على ما فعله المستخدم قبله لا على محاولاته هو.
                 */
                keyGenerator: (req: FastifyRequest) =>
                  `${route.prefix}:${req.user?.id ?? req.ip}`,
              },
            },
          }
        : {}),
    };
    app.all(`${route.prefix}`, opts, handler(route));
    app.all(`${route.prefix}/*`, opts, handler(route));
  }

  function preHandlerFor(instance: FastifyInstance, route: RouteDef) {
    const guards = [];

    // حظر المسارات الداخلية قبل أي شيء آخر.
    // نرد 404 لا 403 حتى لا نؤكّد وجود هذه المسارات أصلًا.
    guards.push(async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
      if (isBlockedPath(req.url)) {
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
