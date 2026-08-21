/**
 * اختيار إشارة بطاقة المنتج.
 *
 * <p>القاعدة: **إشارة واحدة فقط**. عرضها كلها معًا يُلغي أثرها — بطاقة تقول
 * «الكمية تنفد» و«الأعلى تقييمًا» و«توصيل مجاني» في آن واحد لا تقول شيئًا.
 * الترتيب مقصود: الندرة تسبق الشعبية تسبق التوصيل، لأن الأولى وحدها تدفع
 * إلى قرار فوري.
 *
 * <p>مفصولة عن المكوّن عمدًا. المنطق هنا قرار خالص لا يعرف React، فيُختبَر
 * بلا DOM ولا مُصيِّر — وربطه بالمكوّن كان يعني أن اختباره يتطلب بيئة متصفّح
 * كاملة لفحص سلسلة من `if`.
 */

export type ProductSignal =
  | 'low-stock'
  | 'lowest-price'
  | 'bestseller'
  | 'trending'
  | 'free-delivery';

/**
 * ترتيب الأولوية. الأول الذي يطابق وسمًا يفوز، وما بعده يُتجاهَل.
 * `free-delivery` ليس وسمًا بل الافتراضي حين لا يطابق شيء.
 */
const PRIORITY: readonly ProductSignal[] = [
  'low-stock',
  'lowest-price',
  'bestseller',
  'trending',
] as const;

/** الإشارة التي تُعرض لمنتج بوسومه. */
export function selectSignal(tags: readonly string[] | null | undefined): ProductSignal {
  if (!tags) return 'free-delivery';
  return PRIORITY.find((signal) => tags.includes(signal)) ?? 'free-delivery';
}

/** النص المعروض لكل إشارة. */
export const SIGNAL_LABEL: Record<ProductSignal, string> = {
  'low-stock': 'Selling out fast',
  'lowest-price': 'Lowest price in 30 days',
  bestseller: 'Top rated in category',
  trending: '500+ sold recently',
  'free-delivery': 'Free Delivery',
};

/**
 * هل الإشارة إشارة إلحاح؟ الإلحاح يُعرض بالرمّاني، والبقية بالرمادي —
 * فلا يصير كل سطر في الشبكة أحمر ويفقد اللون معناه.
 */
export function isUrgent(signal: ProductSignal): boolean {
  return signal === 'low-stock' || signal === 'lowest-price';
}
