/**
 * حجب المسارات الداخلية عند الحافة.
 *
 * <p>وحدة مستقلة بلا تبعيات عمدًا — لا إعدادات ولا Fastify. الحاجز الأمني يجب
 * أن يكون قابلًا للاختبار وحده، وربطه بإعدادات الخدمة كان يعني أن اختباره
 * يتطلب بيئة كاملة، فلا يُختبر.
 *
 * <p>كُتبت بعد ثغرة حقيقية: كان الحجب يطابق على الـ URL الخام، فمرّ
 * {@code /api/v1/products/%61dmin} و{@code /api/v1/products/admin;x=1} إلى
 * catalog-service الذي فكّهما إلى {@code /admin} — وأتاح سرد المنتجات
 * المؤرشفة وحذفها بلا مصادقة.
 *
 * <p>القاعدة المستخلصة: قائمة حظر تُطابَق على مدخل لم يُطبَّع هي قائمة يملك
 * المهاجم مفاتيحها.
 */

/** المقاطع التي لا يجوز أن تصل من الإنترنت مهما كان ما قبلها. */
const BLOCKED_SEGMENT = /^(internal|admin|actuator)$/i;

/**
 * يُرجع مقاطع المسار بعد التطبيع، أو {@code null} إن كان المسار مشبوهًا بذاته
 * فيجب رفضه دون محاولة تفسيره.
 *
 * <p>الترتيب مقصود: نرفض الشرطة المرمّزة على الخام أولًا (فكّها يمحو الإشارة)،
 * ثم نفكّ الترميز حتى الثبات ليسقط الترميز المزدوج، ثم نُسقط معاملات المصفوفة
 * لأن Spring يُسقطها هو أيضًا عند التوجيه، ثم نحلّ {@code .} و{@code ..}.
 */
function normalizedSegments(rawUrl: string): string[] | null {
  if (/%2f/i.test(rawUrl)) return null;

  let path = rawUrl.split('?')[0]?.split('#')[0] ?? '';

  // فكّ متكرر بحدّ أقصى: حلقة غير محدودة على مدخل خبيث ليست خيارًا
  let settled = false;
  for (let i = 0; i < 5; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      // ترميز تالف — لا نستطيع تطبيعه، فنرفضه بدل تمريره
      return null;
    }
    if (decoded === path) {
      settled = true;
      break;
    }
    path = decoded;
  }
  if (!settled) return null;

  const out: string[] = [];
  for (const raw of path.split('/')) {
    const segment = raw.split(';')[0] ?? '';
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out;
}

/** هل يلامس المسار مقطعًا محظورًا بعد التطبيع؟ */
export function isBlockedPath(rawUrl: string): boolean {
  const segments = normalizedSegments(rawUrl);
  if (segments === null) return true; // المشبوه يُرفض
  return segments.some((s) => BLOCKED_SEGMENT.test(s));
}
