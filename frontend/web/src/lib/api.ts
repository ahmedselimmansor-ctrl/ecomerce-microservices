import { z } from 'zod';
import { apiErrorSchema } from './schemas';

/**
 * عميل HTTP للتعامل مع الـ api-gateway.
 *
 * <p>عنوانان مختلفان بشكل متعمّد: المتصفح ينادي `NEXT_PUBLIC_API_URL`
 * (المرور عبر Cloud CDN وموازن الحمل)، بينما الـ Server Components تنادي
 * `INTERNAL_API_URL` مباشرة داخل الـ VPC — أسرع ولا يخرج للإنترنت.
 */
const BROWSER_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const SERVER_BASE = process.env.INTERNAL_API_URL ?? BROWSER_BASE;

const isServer = typeof window === 'undefined';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** رسالة صالحة للعرض للمستخدم بالعربية. */
  get userMessage(): string {
    const map: Record<string, string> = {
      UNAUTHENTICATED: 'الرجاء تسجيل الدخول للمتابعة',
      INVALID_TOKEN: 'انتهت الجلسة، الرجاء تسجيل الدخول مجددًا',
      INVALID_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      EMAIL_TAKEN: 'هذا البريد الإلكتروني مسجّل بالفعل',
      PRODUCT_NOT_FOUND: 'المنتج غير متوفر',
      OUT_OF_STOCK: 'الكمية المطلوبة غير متوفرة',
      CART_FULL: 'وصلت للحد الأقصى لعدد المنتجات في السلة',
      INVALID_COUPON: 'كود الخصم غير صالح أو منتهي',
      RATE_LIMITED: 'محاولات كثيرة، الرجاء الانتظار قليلًا',
      CATALOG_UNAVAILABLE: 'تعذّر التحقق من الأسعار، حاول بعد قليل',
      UPSTREAM_UNAVAILABLE: 'الخدمة غير متاحة مؤقتًا، حاول بعد قليل',
    };
    return map[this.code] ?? this.message ?? 'حدث خطأ غير متوقع';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** توكن الوصول — تمرّره مكوّنات العميل من المخزن. */
  token?: string | null;
  guestToken?: string | null;
  locale?: string;
  idempotencyKey?: string;
  /** مدة الـ ISR للطلبات من الخادم. */
  revalidate?: number | false;
  tags?: string[];
}

/**
 * الجنريك مأخوذ من المخطط نفسه لا من نوع صريح: مع `.default()` يختلف نوع
 * الدخل عن نوع الخرج، و`z.ZodType<T>` يفترض تطابقهما فينتج استنتاجًا خاطئًا.
 */
async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const {
    body, token, guestToken, locale = 'ar', idempotencyKey,
    revalidate, tags, headers: extraHeaders, ...rest
  } = options;

  const headers = new Headers(extraHeaders);
  headers.set('accept', 'application/json');
  headers.set('accept-language', locale);
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (guestToken) headers.set('x-guest-token', guestToken);
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

  const base = isServer ? SERVER_BASE : BROWSER_BASE;

  const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  if (isServer && revalidate !== undefined) {
    init.next = { revalidate, ...(tags ? { tags } : {}) };
  } else if (!isServer) {
    init.cache = 'no-store';
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, init);
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم', cause);
  }

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `HTTP ${response.status}`;
    let details: unknown;
    try {
      const parsed = apiErrorSchema.safeParse(await response.json());
      if (parsed.success) {
        code = parsed.data.code;
        message = parsed.data.message;
        details = parsed.data.details;
      }
    } catch {
      // الاستجابة ليست JSON — نحتفظ بالرسالة العامة
    }
    throw new ApiError(response.status, code, message, details);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return schema.parse(undefined) as z.output<S>;
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);

  if (!result.success) {
    // خلل تعاقد بين الواجهة والخدمة — يجب أن يظهر بوضوح لا أن يُبتلع
    console.error('response schema mismatch', path, result.error.issues);
    throw new ApiError(500, 'SCHEMA_MISMATCH',
      'استجابة الخادم غير متوقّعة', result.error.issues);
  }
  return result.data;
}

export const api = {
  get: <S extends z.ZodTypeAny>(path: string, schema: S, opts?: RequestOptions) =>
    request(path, schema, { ...opts, method: 'GET' }),

  post: <S extends z.ZodTypeAny>(
    path: string, schema: S, body?: unknown, opts?: RequestOptions,
  ) => request(path, schema, { ...opts, method: 'POST', body }),

  put: <S extends z.ZodTypeAny>(
    path: string, schema: S, body?: unknown, opts?: RequestOptions,
  ) => request(path, schema, { ...opts, method: 'PUT', body }),

  patch: <S extends z.ZodTypeAny>(
    path: string, schema: S, body?: unknown, opts?: RequestOptions,
  ) => request(path, schema, { ...opts, method: 'PATCH', body }),

  delete: <S extends z.ZodTypeAny>(path: string, schema: S, opts?: RequestOptions) =>
    request(path, schema, { ...opts, method: 'DELETE' }),
};

/** يُستخدم مع نقاط لا تعيد جسمًا (204). */
export const voidSchema = z.unknown().transform(() => undefined);
