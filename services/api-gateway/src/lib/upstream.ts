import { request } from 'undici';
import { config } from '../config.js';

export interface UpstreamOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * نداء خدمة داخلية.
 *
 * <p>الترويسات النظيفة مقصودة: لا نمرّر `authorization` من العميل إلى الخدمات
 * الخلفية. الـ gateway تحقّق من التوكن مرة واحدة ثم يمرّر الهوية عبر
 * `X-User-Id`، فتبقى الخدمات الخلفية بسيطة ولا تعرف شيئًا عن صيغة التوكن.
 */
export async function callUpstream<T>(
  baseUrl: string,
  path: string,
  opts: UpstreamOptions = {},
): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };

  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v !== undefined) headers[k] = v;
  }
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const res = await request(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headersTimeout: opts.timeoutMs ?? config.UPSTREAM_TIMEOUT_MS,
    bodyTimeout: opts.timeoutMs ?? config.UPSTREAM_TIMEOUT_MS,
  });

  const text = await res.body.text();

  if (res.statusCode >= 400) {
    let code = 'UPSTREAM_ERROR';
    let message = `Upstream responded ${res.statusCode}`;
    let details: unknown;
    try {
      const parsed = JSON.parse(text) as { code?: string; message?: string; details?: unknown };
      code = parsed.code ?? code;
      message = parsed.message ?? message;
      details = parsed.details;
    } catch {
      // الاستجابة ليست JSON — نحتفظ بالرسالة العامة
    }
    throw new UpstreamError(res.statusCode, code, message, details);
  }

  return (text ? JSON.parse(text) : null) as T;
}

/**
 * ينفّذ نداءً اختياريًا: الفشل يعيد `fallback` بدل إسقاط الاستجابة كلها.
 * تُستخدم للأقسام غير الجوهرية مثل التوصيات.
 */
export async function optional<T>(
  promise: Promise<T>,
  fallback: T,
  onError?: (err: unknown) => void,
): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    onError?.(err);
    return fallback;
  }
}
