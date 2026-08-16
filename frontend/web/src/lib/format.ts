/**
 * تنسيق العرض.
 *
 * <p>كل المبالغ تأتي من الخادم بالوحدة الصغرى (قرش/فلس) كأعداد صحيحة.
 * القسمة على 100 تحدث هنا فقط — عند العرض — ولا تُخزَّن نتيجتها أبدًا.
 */

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * @param withCurrency عند `false` نعيد الرقم وحده — noon تعرض رمز العملة
 *   في عنصر منفصل بحجم أصغر ("EGP" ثم الرقم بخط عريض).
 */
export function formatMoney(
  minorAmount: number,
  currency = 'EGP',
  locale = 'en-EG',
  withCurrency = true,
): string {
  const key = `${locale}:${currency}:${withCurrency}`;
  let formatter = formatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      ...(withCurrency ? { style: 'currency', currency } : {}),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    formatters.set(key, formatter);
  }

  return formatter.format(minorAmount / 100);
}

/** noon تختصر أعداد التقييمات: 29500 ← 29.5K */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatNumber(value: number, locale = 'en-EG'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(iso: string, locale = 'ar-EG'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDateShort(iso: string, locale = 'ar-EG'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function discountPercent(priceMinor: number, wasMinor?: number | null): number | null {
  if (!wasMinor || wasMinor <= priceMinor) return null;
  return Math.round(((wasMinor - priceMinor) / wasMinor) * 100);
}

const STATUS_LABELS: Record<
  string,
  { label: string; labelEn: string; tone: 'neutral' | 'positive' | 'warning' | 'negative' }
> = {
  PENDING: { label: 'قيد المعالجة', labelEn: 'Pending', tone: 'warning' },
  AWAITING_PAYMENT: { label: 'بانتظار الدفع', labelEn: 'Awaiting payment', tone: 'warning' },
  CONFIRMED: { label: 'مؤكَّد', labelEn: 'Confirmed', tone: 'positive' },
  PROCESSING: { label: 'قيد التجهيز', labelEn: 'Processing', tone: 'neutral' },
  SHIPPED: { label: 'تم الشحن', labelEn: 'Shipped', tone: 'neutral' },
  DELIVERED: { label: 'تم التسليم', labelEn: 'Delivered', tone: 'positive' },
  CANCELLED: { label: 'ملغي', labelEn: 'Cancelled', tone: 'negative' },
  REFUNDED: { label: 'مُسترد', labelEn: 'Refunded', tone: 'neutral' },
};

export function orderStatus(status: string) {
  return STATUS_LABELS[status] ?? { label: status, labelEn: status, tone: 'neutral' as const };
}

export const STATUS_TONE_CLASS: Record<string, string> = {
  positive: 'bg-noon-green/10 text-noon-green',
  warning: 'bg-noon-yellow/40 text-noon-ink',
  negative: 'bg-noon-red/10 text-noon-red',
  neutral: 'bg-noon-bg text-noon-muted',
};

/** صورة بديلة عند غياب صورة المنتج — تمنع تخطيطًا مكسورًا. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect width="400" height="400" fill="#f7f7fa"/>
      <text x="200" y="205" font-family="system-ui" font-size="18" fill="#7e859b"
            text-anchor="middle">no image</text>
    </svg>`,
  );

/** شعار نصي للعلامات التجارية — بديل عن رفع عشرات ملفات SVG. */
export function brandInitials(name: string): string {
  return name
    .replace(/[^A-Za-z؀-ۿ ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
