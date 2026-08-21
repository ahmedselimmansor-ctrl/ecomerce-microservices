/**
 * قواعد السلة النقية.
 *
 * <p>مفصولة عن {@link CartStore} عمدًا: القواعد هنا لا تعرف Redis، فتُختبَر
 * بلا حاوية. ما يبقى في المخزن هو نقل البيانات لا القرار.
 */

/** أقصى كمية لصنف واحد. الحد يمنع خطأ إدخال من حجز مخزون فرع كامل. */
export const MAX_QUANTITY_PER_ITEM = 20;

/** أقصى عدد أصناف مختلفة. سلة بلا حد تعني مفتاح Redis بلا حد. */
export const MAX_DISTINCT_ITEMS = 100;

/**
 * الكمية بعد إضافة صنف موجود.
 *
 * <p>الإضافة تُراكم لا تستبدل — «أضف للسلة» مرتين تعني اثنين — لكنها تتوقف
 * عند السقف بدل أن ترفض العملية: رفضها يعني أن زر الإضافة يفشل بلا سبب
 * مفهوم للعميل، وقصّها يعطيه ما يمكن إعطاؤه.
 */
export function nextQuantityOnAdd(existing: number, added: number): number {
  return Math.min(existing + added, MAX_QUANTITY_PER_ITEM);
}

/**
 * الكمية عند دمج سلة زائر مع سلة مستخدم عند تسجيل الدخول.
 *
 * <p>نأخذ الأكبر لا المجموع. الجمع يبدو منطقيًا حتى تتخيّل الحالة الشائعة:
 * عميل أضاف نفس المنتج على هاتفه ثم على حاسوبه، فيجد عند الدخول ضعف ما
 * أراد — وهو خطأ يكتشفه عند الدفع لا قبله.
 */
export function mergedQuantity(guest: number, user: number): number {
  return Math.min(Math.max(guest, user), MAX_QUANTITY_PER_ITEM);
}

/** هل تقبل السلة صنفًا جديدًا (لا زيادة كمية صنف قائم)؟ */
export function canAcceptNewItem(distinctCount: number): boolean {
  return distinctCount < MAX_DISTINCT_ITEMS;
}

/**
 * تحقّق من كمية يرسلها العميل.
 *
 * <p>الصفر ليس خطأً بل حذف — تعامله الطبقة الأعلى كإزالة للصنف. أما السالب
 * والكسر فمدخل فاسد يُرفض عند الحدّ لا يُقصّ بصمت.
 */
export function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_QUANTITY_PER_ITEM
  );
}
