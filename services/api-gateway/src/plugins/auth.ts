import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { jwtVerify } from 'jose';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email?: string; roles: string[] };
  }
}

const secret = new TextEncoder().encode(config.JWT_SECRET);

/**
 * يتحقق من التوكن ويضع هوية المستخدم على الطلب.
 *
 * <p>في الإنتاج على AWS يُستبدل السرّ المشترك بـ RS256: تُوقَّع التوكنات
 * بمفتاح خاص في KMS، ويجلب هذا الـ gateway المفتاح العام من JWKS ويخزّنه —
 * فلا يحتاج أحد لمعرفة أي سرّ.
 */
async function plugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', undefined);

  /** يحاول قراءة الهوية دون فرضها — للمسارات التي تختلف حسب تسجيل الدخول. */
  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    const token = extractToken(req);
    if (!token) return;
    try {
      const { payload } = await jwtVerify(token, secret, { issuer: 'noon-identity' });
      req.user = {
        id: String(payload.sub),
        email: payload.email as string | undefined,
        roles: (payload.roles as string[]) ?? [],
      };
    } catch {
      // توكن غير صالح على مسار عام: نتجاهله ونكمل كزائر
    }
  });

  /** يفرض تسجيل الدخول. */
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(req);
    if (!token) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Authorization header is required',
      });
    }
    try {
      const { payload } = await jwtVerify(token, secret, { issuer: 'noon-identity' });
      req.user = {
        id: String(payload.sub),
        email: payload.email as string | undefined,
        roles: (payload.roles as string[]) ?? [],
      };
    } catch (err) {
      req.log.debug({ err }, 'token verification failed');
      return reply.code(401).send({
        code: 'INVALID_TOKEN',
        message: 'Access token is invalid or expired',
      });
    }
  });

  app.decorate('requireRole', (role: string) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user?.roles.includes(role)) {
        return reply.code(403).send({
          code: 'FORBIDDEN',
          message: `Role ${role} is required`,
        });
      }
    };
  });
}

/**
 * `fastify-plugin` يكسر التغليف (encapsulation) عمدًا.
 * بدونه تبقى الـ decorators داخل سياق الإضافة وحدها، فتظهر
 * {@code app.requireAuth} كـ undefined عند تسجيل المسارات في الجذر.
 */
export const authPlugin = fp(plugin, { name: 'noon-auth' });

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

declare module 'fastify' {
  interface FastifyInstance {
    optionalAuth: (req: FastifyRequest) => Promise<void>;
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireRole: (
      role: string,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
