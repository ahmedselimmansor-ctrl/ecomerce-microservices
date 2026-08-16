import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { services } from '../config.js';

/**
 * مسارات لوحة التحكم.
 *
 * <p>مسارات {@code /admin} على الخدمات محجوبة عند الحافة عمدًا
 * (انظر {@code BLOCKED_PATH} في proxy.ts). هذه هي النافذة الوحيدة إليها،
 * وهي مغلقة خلف تحقق من دور ADMIN. الطبقة الثانية — وهي الحقيقية — هي
 * NetworkPolicy التي لا تسمح بالوصول للخدمات إلا من هذا الـ gateway.
 */
interface AdminRoute {
  /** البادئة كما يراها العميل. */
  prefix: string;
  target: string;
  /** إعادة الكتابة إلى مسار الخدمة الداخلي. */
  rewrite: (url: string) => string;
}

const ADMIN_ROUTES: AdminRoute[] = [
  {
    prefix: '/api/v1/admin/products',
    target: services.catalog,
    rewrite: (url) => url.replace('/api/v1/admin/products', '/api/v1/products/admin'),
  },
  {
    prefix: '/api/v1/admin/orders',
    target: services.order,
    rewrite: (url) => url.replace('/api/v1/admin/orders', '/api/v1/orders/admin'),
  },
  {
    prefix: '/api/v1/admin/inventory',
    target: services.inventory,
    rewrite: (url) => url.replace('/api/v1/admin/inventory', '/api/v1/inventory/admin'),
  },
];

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const guard = [app.requireAuth, app.requireRole('ADMIN')];

  for (const route of ADMIN_ROUTES) {
    const handler = function (this: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
      return reply.from(`${route.target}${route.rewrite(req.url)}`, {
        rewriteRequestHeaders: (originalReq, headers) => {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries(headers)) {
            const key = k.toLowerCase();
            if (key === 'cookie' || key === 'host' || key === 'content-length') continue;
            if (typeof v === 'string') clean[key] = v;
          }
          const user = (originalReq as FastifyRequest).user;
          clean['x-request-id'] = (originalReq as FastifyRequest).id;
          clean['x-internal-caller'] = 'api-gateway-admin';
          if (user) {
            clean['x-user-id'] = user.id;
            clean['x-user-roles'] = user.roles.join(',');
          }
          return clean;
        },
        onError: (rep, { error }) => {
          req.log.error({ err: error, target: route.target }, 'admin upstream error');
          rep.code(502).send({
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'The service is temporarily unavailable',
          });
        },
      });
    };

    app.all(route.prefix, { preHandler: guard }, handler);
    app.all(`${route.prefix}/*`, { preHandler: guard }, handler);
  }

  /**
   * لوحة المؤشرات: تجميع إحصاءات ثلاث خدمات في نداء واحد.
   * فشل أي منها لا يُفرّغ اللوحة — نعرض ما توفّر.
   */
  app.get('/api/v1/admin/dashboard', { preHandler: guard }, async (req) => {
    const headers = {
      'x-request-id': req.id,
      'x-internal-caller': 'api-gateway-admin',
      accept: 'application/json',
    };

    const fetchStats = async (url: string): Promise<unknown> => {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(2_500) });
        return res.ok ? await res.json() : null;
      } catch (err) {
        req.log.warn({ err, url }, 'admin stats fetch failed');
        return null;
      }
    };

    const [catalog, orders, inventory] = await Promise.all([
      fetchStats(`${services.catalog}/api/v1/products/admin/stats`),
      fetchStats(`${services.order}/api/v1/orders/admin/stats`),
      fetchStats(`${services.inventory}/api/v1/inventory/admin/stats`),
    ]);

    return { catalog, orders, inventory };
  });
}
